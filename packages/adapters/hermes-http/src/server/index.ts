import type { ServerAdapterModule, AdapterExecutionContext, AdapterEnvironmentTestContext, AdapterEnvironmentTestResult, AdapterSkillContext, AdapterSkillSnapshot, AdapterSessionCodec } from "@paperclipai/adapter-utils";
import { AgentHttpConnection } from "./http-client.js";
import { detectModelHttp } from "./model-resolver.js";
import type { ChatRequest, ChatResponse, ModelInfo, SkillInfo } from "./types.js";
import {
  readPaperclipRuntimeSkillEntries,
  resolvePaperclipDesiredSkillNames,
  buildPersistentSkillSnapshot,
  ensurePaperclipSkillSymlink,
  readInstalledSkillTargets,
} from "@paperclipai/adapter-utils/server-utils";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const DEFAULT_ENDPOINT = "http://localhost:8765/api/v1";
const __moduleDir = import.meta.url.replace("file://", "");

function readPaperclipWorkspaceCwd(context: Record<string, unknown>): string | null {
  const workspace = context.paperclipWorkspace as Record<string, unknown> | null | undefined;
  if (!workspace || typeof workspace !== "object") return null;
  const cwd = workspace.cwd;
  return typeof cwd === "string" && cwd.trim().length > 0 ? cwd : null;
}

export const DEFAULT_HERMES_BASELINE_TOOLSETS = [
  "file",
  "terminal",
  "skills",
  "search",
  "web",
  "memory",
  "todo",
  "clarify",
  "session_search",
];

export function resolveHermesToolsets(config: HermesHttpConfig): string[] | undefined {
  const configured = Array.isArray(config.toolsets)
    ? config.toolsets.filter((toolset): toolset is string => typeof toolset === "string")
    : undefined;
  if (configured === undefined) return undefined;
  return [...new Set([...DEFAULT_HERMES_BASELINE_TOOLSETS, ...configured])];
}

function renderPromptTemplate(template: string, data: Record<string, unknown>): string {
  let result = template;
  for (const [key, value] of Object.entries(data)) {
    if (typeof value === "string") {
      result = result.replace(new RegExp(`\\{{${key}}\\}}`, "g"), value);
    } else if (typeof value === "object" && value !== null) {
      result = result.replace(new RegExp(`\\{{${key}}\\}}`, "g"), JSON.stringify(value));
    }
  }
  return result;
}

export const agentConfigurationDoc = `# Hermes HTTP Agent Configuration

Adapter: hermes_http

Use when:
- You want to connect Paperclip to a hermes-agent HTTP server
- You want to avoid subprocess spawning (Windows compatibility)
- You want to run the agent on a separate machine

Core fields:
- endpoint (string, optional): HTTP endpoint for the hermes server (default: http://localhost:8765/api/v1)
- model (string, optional): Model to use
- provider (string, optional): Provider to use
- timeoutSec (number, optional): Request timeout in seconds
- apiUrl (string, optional): Paperclip API base URL (default: http://localhost:3100).
  Forwarded to hermes so the agent can reach the Paperclip API.
- apiKey (string, optional): Agent API key (create via Board → Agents → API keys).
  Forwarded to hermes so the agent's API calls are authenticated as this agent
  (comments/updates get agent identity + run attribution instead of local-board).
- toolsets (string[], optional): Exclusive Hermes toolset allow-list for this agent.
  When set, the adapter always merges a baseline toolset list
  (file, terminal, skills, search, web, memory, todo, clarify, session_search)
  with the configured values before sending, so core capabilities are never
  silently stripped. When unset, the server's default toolset set is used.
- leanContext (boolean, optional): When true, the heartbeat prompt omits the
  full issue description and instead points the agent at
  GET /api/issues/{issueId}/heartbeat-context for the full description,
  project, goal, and ancestors. Requires the agent to have PAPERCLIP_API_KEY
  (+ PAPERCLIP_API_URL) available, otherwise context-starved.
- workMode / issueId (auto-forwarded): The adapter forwards the current issue's
  work mode (standard / ask / planning) and id from the heartbeat context.
  Hermes uses them to gate mode-conditioned skill contracts
  (metadata.hermes.contract checks with a "when" clause) and to give
  contract-retry prompts a live context pointer.

Notes:
- Requires a running hermes-agent HTTP server (hermes_server.py)
- The server exposes /chat, /model, /skills endpoints
- Paperclip skills can be synced to Hermes via the paperclipSkillSync config
- Skills are symlinked into ~/.hermes/skills for Hermes to load
`;

export interface HermesHttpConfig {
  endpoint?: string;
  model?: string;
  provider?: string;
  timeoutSec?: number;
  toolsets?: string[];
  paperclipSkillSync?: Record<string, unknown>;
  apiUrl?: string;
  apiKey?: string;
}

function getConfigFromEnv(config: Record<string, unknown>): HermesHttpConfig {
  return {
    endpoint: typeof config.endpoint === "string" ? config.endpoint : DEFAULT_ENDPOINT,
    model: typeof config.model === "string" ? config.model : undefined,
    provider: typeof config.provider === "string" ? config.provider : undefined,
    timeoutSec: typeof config.timeoutSec === "number" && config.timeoutSec > 0 ? config.timeoutSec : 0,
    toolsets: Array.isArray(config.toolsets)
      ? config.toolsets.filter((toolset): toolset is string => typeof toolset === "string")
      : undefined,
    paperclipSkillSync: typeof config.paperclipSkillSync === "object" && config.paperclipSkillSync !== null ? config.paperclipSkillSync as Record<string, unknown> : undefined,
    apiUrl: typeof config.apiUrl === "string" && config.apiUrl.length > 0 ? config.apiUrl.replace(/\/$/, "") : undefined,
    apiKey: typeof config.apiKey === "string" && config.apiKey.length > 0 ? config.apiKey : undefined,
  };
}

export async function testEnvironment(ctx: AdapterEnvironmentTestContext): Promise<AdapterEnvironmentTestResult> {
  const config = getConfigFromEnv(ctx.config);
  const connection = new AgentHttpConnection(config.endpoint, config.timeoutSec);
  
  try {
    await connection.healthCheck();
    return {
      status: "pass",
      adapterType: "hermes_http",
      testedAt: new Date().toISOString(),
      checks: [],
    };
  } catch (err) {
    return {
      status: "fail",
      adapterType: "hermes_http",
      testedAt: new Date().toISOString(),
      checks: [{
        code: "connection_failed",
        level: "error",
        message: `Failed to connect to hermes HTTP server at ${config.endpoint}: ${err instanceof Error ? err.message : String(err)}`,
      }],
    };
  }
}

export async function execute(ctx: AdapterExecutionContext) {
  const config = getConfigFromEnv(ctx.config);
  const connection = new AgentHttpConnection(config.endpoint, config.timeoutSec);
  
  const context = ctx.context ?? {};
  
  const promptSections: string[] = [];
  
  if (context.paperclipWake) {
    const wake = context.paperclipWake as Record<string, unknown>;
    const reason = wake.reason as string | undefined;
    const comments = wake.comments as Array<Record<string, unknown>> | undefined;
    
    if (reason === "issue_commented" && comments && comments.length > 0) {
      const latestComment = comments[comments.length - 1] as Record<string, unknown>;
      const commentBody = latestComment.body as string | undefined;
      const author = latestComment.author as Record<string, unknown> | undefined;
      const authorType = author?.type as string | undefined;
      const authorId = author?.id as string | undefined;
      
      promptSections.push(`\n## Recent Comment\n`);
      promptSections.push(`From ${authorType === "user" ? "user" : `agent ${authorId?.slice(0, 8)}`}:`);
      promptSections.push(commentBody ?? "");
    }
  }
  
  if (context.paperclipTaskMarkdown) {
    promptSections.push(context.paperclipTaskMarkdown as string);
  }
  
  if (context.paperclipSessionHandoffMarkdown) {
    promptSections.push(context.paperclipSessionHandoffMarkdown as string);
  }
  
  const promptTemplate = ctx.config?.promptTemplate as string | undefined;
  if (promptTemplate) {
    const templateData = {
      agentId: ctx.agent.id,
      companyId: ctx.agent.companyId,
      runId: ctx.runId,
      context,
    };
    const rendered = renderPromptTemplate(promptTemplate, templateData);
    promptSections.push(rendered);
  }
  
  const message = promptSections.length > 0 ? promptSections.join("\n\n") : (context.prompt as string ?? "");

  const paperclipIssue = context.paperclipIssue as { workMode?: string; id?: string; status?: string; priority?: string; title?: string } | undefined;

  // ── Session reuse: try to resume previous Hermes session for same agent/task ──
  // Heartbeat stores previous sessionId in taskSession; it may appear under several keys.
  const resumeCandidates: Array<unknown> = [
    (context as Record<string, unknown>).paperclipResumeSessionId,
    (context as Record<string, unknown>).resumeSessionId,
    (context.paperclipTaskSession as Record<string, unknown> | undefined)?.sessionId,
    (context.paperclipTaskSession as Record<string, unknown> | undefined)?.session_id,
    (ctx as unknown as Record<string, unknown>).sessionId,
    (ctx.executionTarget as unknown as Record<string, unknown> | undefined)?.sessionId,
  ];
  let resumeSessionId: string | undefined;
  for (const c of resumeCandidates) {
    if (typeof c === "string" && c.trim().length >= 4) { resumeSessionId = c.trim(); break; }
    if (c && typeof c === "object" && typeof (c as Record<string, unknown>).sessionId === "string") {
      const v = (c as Record<string, unknown>).sessionId as string;
      if (v.trim().length >= 4) { resumeSessionId = v.trim(); break; }
    }
  }

  // ── Agent instructions (Layer 2) — fetch per-agent markdown bundle ────────
  let instructions: string | null = null;
  // Authoritative assigned skillset + MCP servers — fetched ONCE deterministically,
  // injected pre-LLM so the intent gate uses them (no skills_list call allowed).
  let assignedSkills: string[] = [];
  let assignedMcpServers: string[] = [];
  // True only when the authoritative skills fetch actually succeeded.
  // On failure assignedSkills stays [] (fail-closed gate) BUT disk state is
  // left untouched — a transient HTTP blip must not wipe the toolbox.
  let assignedSkillsFetched = false;
  if (config.apiUrl && config.apiKey && ctx.agent?.id) {
    try {
      const url = `${config.apiUrl.replace(/\/$/, "")}/api/agents/${ctx.agent.id}/instructions-bundle`;
      const resp = await fetch(url, { headers: { Authorization: `Bearer ${config.apiKey}`, Accept: "application/json" } });
      if (resp.ok) {
        const data = await resp.json() as Record<string, unknown>;
        // Bundle shape: { files: Record<string,string> } or { bundle: {files} }
        const files = (data.files ?? (data.bundle as Record<string, unknown> | undefined)?.files) as Record<string, string> | undefined;
        if (files && typeof files === "object") {
          instructions = Object.entries(files).map(([p, body]) => `# ${p}\n\n${body}`).join("\n\n---\n\n");
        } else if (typeof data.content === "string") {
          instructions = data.content;
        }
      }
    } catch {
      // best-effort
    }
    // Fetch assigned skills (paperclipSkillSync.desiredSkills) + mcp_servers — pre-LLM authoritative list
    try {
      const skUrl = `${config.apiUrl.replace(/\/$/, "")}/api/agents/${ctx.agent.id}/skills?companyId=${ctx.agent.companyId}`;
        const skResp = await fetch(skUrl, { headers: { Authorization: `Bearer ${config.apiKey}`, Accept: "application/json" } });
        if (skResp.ok) {
          assignedSkillsFetched = true;
          const sk = await skResp.json() as Record<string, unknown>;
        // AgentSkillSnapshot shape: { desiredSkills: string[], entries: AgentSkillEntry[], ... }
        const desiredSkills = sk.desiredSkills as string[] | undefined;
        if (Array.isArray(desiredSkills) && desiredSkills.length > 0) {
          assignedSkills = desiredSkills.map((s) => String(s).replace(/^paperclipai\/paperclip\//, "")).filter(Boolean);
        } else {
          // Fallback: extract from entries with desired=true or state=installed
          const entries = sk.entries as Array<Record<string, unknown>> | undefined;
          if (Array.isArray(entries)) {
            assignedSkills = entries
              .filter((e) => e.desired === true || e.state === "installed")
              .map((e) => String(e.key ?? e.name ?? "").replace(/^paperclipai\/paperclip\//, ""))
              .filter(Boolean);
          }
        }
      }
    } catch {
      // best-effort
    }
    // MCP servers from agent adapterConfig (paperclipSkillSync may carry them); fallback to skill keys with 'mcp' marker
    try {
      const mcp = (ctx.config as Record<string, unknown>)?.mcpServers;
      if (Array.isArray(mcp)) {
        assignedMcpServers = mcp.map((s) => String(s)).filter(Boolean);
      }
    } catch {
      // best-effort
    }
    // Per-agent skill materialization (owner catalog, assignment-only): link
    // this wake's assigned skills into the agent's own subdirectory and prune
    // anything else there. Tenants never share a skills home. Skipped when
    // the authoritative fetch failed — last-known disk state survives the
    // blip and re-syncs on the next successful wake.
    try {
      const wakeAgentId = typeof ctx.agent?.id === "string" ? ctx.agent.id : "";
      if (wakeAgentId && assignedSkillsFetched) {
        const runtimeEntries = await readPaperclipRuntimeSkillEntries(ctx.config, __moduleDir);
        await ensureAgentSkillLinks(wakeAgentId, assignedSkills, async () => runtimeEntries);
      }
    } catch {
      // best-effort: materialization must never fail a wake
    }
  }

  // ── Current issue context (Layer 5) + emotional inputs ────────────────────
  // Description is required: the hermes pre-loop intent gate scores ONLY
  // identifier + title + description (never wake comments/history).
  const paperclipIssueFull = paperclipIssue as
    | { id?: string; identifier?: string; title?: string; description?: string; status?: string; priority?: string; workMode?: string }
    | undefined;
  const currentIssue: Record<string, unknown> | null = paperclipIssue ? {
    id: paperclipIssue.id,
    identifier: paperclipIssueFull?.identifier ?? null,
    title: paperclipIssue.title,
    description: paperclipIssueFull?.description ?? null,
    status: paperclipIssue.status,
    priority: paperclipIssue.priority,
    workMode: paperclipIssue.workMode,
  } : null;

  // Soul template: if agent instructions contain a {{SOUL}} marker, treat first file as soul template
  // Otherwise soulTemplate stays null and Hermes falls back to SOUL.template.md / SOUL.md
  let soulTemplate: string | null = null;
  if (typeof ctx.config?.soulTemplate === "string" && (ctx.config.soulTemplate as string).trim()) {
    soulTemplate = ctx.config.soulTemplate as string;
  }

  const rawSoulEnabled = (ctx.agent as unknown as Record<string, unknown>)?.soulEnabled;
  const soulEnabled = typeof rawSoulEnabled === "boolean" ? rawSoulEnabled : true;

  // ── Deterministic akashic profile (pre-LLM, no reasoning) ──────────────────
  // Solid profile: agent identity + company/issue/workspace + KNOWLEDGE_GRAPH hint.
  // Built deterministically from ctx — LLM does not need to curl for IDs.
  const wsCwd = readPaperclipWorkspaceCwd(context);
  const issueIdent = (paperclipIssue as unknown as Record<string, unknown> | undefined)?.identifier as string | undefined
    ?? (paperclipIssue?.id as string | undefined)?.slice(0, 8);
  const agentProfile = [
    `# Agent Profile (deterministic)`,
    `- Agent: ${ctx.agent?.name ?? ctx.agent?.id} (${(ctx.agent as unknown as Record<string, unknown>)?.role ?? "agent"}) — ${ctx.agent?.id}`,
    `- Company: ${ctx.agent?.companyId ?? companyIdFromContext(context) ?? "unknown"}${issueIdent ? ` — Issue: ${issueIdent}` : ""}`,
    wsCwd ? `- Workspace: ${wsCwd}` : null,
    `- KNOWLEDGE_GRAPH.md is your akashic record — read it via instructions bundle; before dying, update it with this issue's node + edges.`,
    soulEnabled ? `- Soul: ON — emotional vectors (recentRuns, astro) will be injected as volatile tier` : `- Soul: OFF — mechanical mode, no persona/emotional tier`,
  ].filter(Boolean).join("\n");
  function companyIdFromContext(c: Record<string, unknown>): string | null {
    const v = c.companyId as string | undefined ?? (c.paperclipCompanyId as string | undefined);
    return typeof v === "string" && v ? v : null;
  }

  // ── Gate recentRuns + emotionalState on soulEnabled ───────────────────────
  // Only populate when soul is ON; otherwise KNOWLEDGE_GRAPH.md carries memory.
  let recentRuns: Array<Record<string, unknown>> | null = null;
  let emotionalState: Record<string, unknown> | null = null;
  if (soulEnabled) {
    // Best-effort: derive emotional baseline from astrology vectors if present
    const agg = (ctx.config?.astrologyVectors as Record<string, unknown> | undefined)?.aggregate as Record<string, number> | undefined;
    if (agg) {
      emotionalState = { _source: "deterministic profile", aggregate: agg } as unknown as Record<string, unknown>;
    }
    // recentRuns will be populated by hermes_server if available; adapter leaves null to avoid extra API roundtrip
  }

  // ── Wake brief (deterministic pre-LLM continuity) ─────────────────────
  // Last wake outcome + open threads + unread board-chat, so every wake
  // starts continuous instead of re-discovering state with tool calls.
  // Best-effort: any failure yields a null brief, never blocks the wake.
  let wakeBrief: string | null = null;
  if (config.apiUrl && config.apiKey && ctx.agent?.id) {
    try {
      const briefApiBase = config.apiUrl.replace(/\/$/, "");
      const briefHeaders = { Authorization: `Bearer ${config.apiKey}`, Accept: "application/json" };
      const briefLines: string[] = ["# Wake Brief (deterministic — continuity, read first)"];
      // 1. Last wake outcome for this issue
      try {
        const briefIssueId = typeof paperclipIssue?.id === "string" ? paperclipIssue.id : undefined;
        if (briefIssueId) {
          const rResp = await fetch(`${briefApiBase}/api/issues/${briefIssueId}/runs`, { headers: briefHeaders });
          if (rResp.ok) {
            const runs = await rResp.json() as Array<Record<string, unknown>>;
            const finished = (Array.isArray(runs) ? runs : [])
              .filter((r) => r.status !== "running" && r.status !== "queued")
              .sort((a, b) => String(b.updatedAt ?? b.createdAt ?? "").localeCompare(String(a.updatedAt ?? a.createdAt ?? "")));
            const last = finished[0];
            briefLines.push(last
              ? `- Last wake: run ${String(last.id).slice(0, 8)} ${last.status} at ${last.updatedAt ?? last.createdAt ?? "?"}`
              : "- Last wake: none completed yet on this issue");
          }
        }
      } catch { /* best-effort */ }
      // 2. Open threads (assigned to me, not done, not this issue)
      try {
        const briefCompanyId = ctx.agent?.companyId as string | undefined;
        const briefAgentId = ctx.agent?.id as string | undefined;
        const briefCurId = typeof paperclipIssue?.id === "string" ? paperclipIssue.id : undefined;
        if (briefCompanyId && briefAgentId) {
          const iResp = await fetch(`${briefApiBase}/api/companies/${briefCompanyId}/issues?limit=25`, { headers: briefHeaders });
          if (iResp.ok) {
            const issues = await iResp.json() as Array<Record<string, unknown>>;
            const open = (Array.isArray(issues) ? issues : [])
              .filter((i) => i.assigneeAgentId === briefAgentId && i.id !== briefCurId && i.status !== "done" && i.status !== "cancelled")
              .slice(0, 8);
            if (open.length > 0) {
              briefLines.push("- Open threads:");
              for (const o of open) {
                briefLines.push(`  - ${o.identifier ?? String(o.id).slice(0, 8)} — ${o.title ?? "?"} (${o.status})`);
              }
            } else {
              briefLines.push("- Open threads: none (this is the only live issue)");
            }
          }
        }
      } catch { /* best-effort */ }
      // 3. Unread board-chat (standing Board Operations issue, last 5 comments)
      try {
        const briefCompanyId = ctx.agent?.companyId as string | undefined;
        if (briefCompanyId) {
          const bResp = await fetch(`${briefApiBase}/api/companies/${briefCompanyId}/issues?limit=25`, { headers: briefHeaders });
          if (bResp.ok) {
            const bIssues = await bResp.json() as Array<Record<string, unknown>>;
            const boardIssue = (Array.isArray(bIssues) ? bIssues : []).find(
              (i) => i.title === "Board Operations" && i.status !== "done" && i.status !== "cancelled",
            );
            if (boardIssue?.id) {
              const cResp = await fetch(`${briefApiBase}/api/issues/${boardIssue.id}/comments`, { headers: briefHeaders });
              if (cResp.ok) {
                const comments = await cResp.json() as Array<Record<string, unknown>>;
                const tail = (Array.isArray(comments) ? comments : []).slice(-5);
                if (tail.length > 0) {
                  briefLines.push("- Board chat (latest):");
                  for (const c of tail) {
                    const who = (c.authorAgentId as string | undefined)
                      ?? (c.authorUserId as string | undefined)
                      ?? "?";
                    const body = String(c.body ?? "").replace(/\s+/g, " ").slice(0, 200);
                    briefLines.push(`  - [${who}]: ${body}`);
                  }
                }
              }
            }
          }
        }
      } catch { /* best-effort */ }
      // 4. Semantic memory (Postgres + pgvector; FTS when unembedded).
      // Capped so the brief never bloats the prompt — retrieval is frozen
      // per wake, never live-prefetched per turn (prefix-cache stays warm).
      try {
        const briefAgentId = ctx.agent?.id as string | undefined;
        const briefCompanyId = ctx.agent?.companyId as string | undefined;
        const briefTitle = typeof paperclipIssue?.title === "string" ? paperclipIssue.title : "";
        if (briefAgentId && briefCompanyId && briefTitle) {
          const mResp = await fetch(
            `${briefApiBase}/api/agents/${briefAgentId}/memories/search?q=${encodeURIComponent(briefTitle)}&kinds=self,house,distilled,fact,day_entry&k=6&maxChars=600`,
            { headers: briefHeaders },
          );
          if (mResp.ok) {
            const mData = await mResp.json() as { results?: Array<Record<string, unknown>>; rules?: Array<Record<string, unknown>> };
            const rules = Array.isArray(mData.rules) ? mData.rules : [];
            if (rules.length > 0) {
              briefLines.push("- Standing rules (always obey — outrank everything below):");
              for (const r of rules) {
                briefLines.push(`  - RULE: ${String(r.text ?? "").replace(/\s+/g, " ").slice(0, 400)}`);
              }
            }
            const hits = Array.isArray(mData.results) ? mData.results : [];
            if (hits.length > 0) {
              briefLines.push("- Memory (semantic, top hits):");
              let chars = 0;
              for (const h of hits) {
                const line = `  - [${h.kind} ${h.createdAt ?? "?"} · ${h.score}]: ${String(h.text ?? "").replace(/\s+/g, " ").slice(0, 300)}`;
                if (chars + line.length > 1800) break;
                chars += line.length;
                briefLines.push(line);
              }
            }
          }
        }
      } catch { /* best-effort */ }
      wakeBrief = briefLines.length > 1 ? briefLines.join("\n") : null;
    } catch {
      wakeBrief = null;
    }
  }

  const request: ChatRequest = {
    message,
    session_id: resumeSessionId,
    model: config.model,
    provider: config.provider,
    max_turns: ctx.config?.maxTurnsPerRun as number ?? 50,
    toolsets: resolveHermesToolsets(config),
    skills: ctx.config?.skills as string[] | undefined,
    workMode: typeof paperclipIssue?.workMode === "string" ? paperclipIssue.workMode : undefined,
    issueId: typeof paperclipIssue?.id === "string" ? paperclipIssue.id : undefined,
    paperclipSkillSync: config.paperclipSkillSync,
    agentId: ctx.agent?.id ?? null,
    companyId: ctx.agent?.companyId ?? null,
    runId: ctx.runId ?? null,
    apiUrl: config.apiUrl ?? null,
    apiKey: config.apiKey ?? null,
    cwd: readPaperclipWorkspaceCwd(context),
    soulTemplate,
    soulEnabled,
    astrologyVectors: (ctx.config?.astrologyVectors as Record<string, unknown> | undefined) ?? null,
    instructions,
    agentProfile,
    assignedSkills,
    assignedMcpServers,
    currentIssue,
    recentRuns,
    emotionalState,
    wakeBrief,
  };
  
  const result = await connection.chat(request);

  if (Array.isArray(result.transcript) && result.transcript.length > 0) {
    const body = result.transcript.map((entry) => JSON.stringify(entry)).join("\n") + "\n";
    await ctx.onLog("stdout", body);
  }

  return {
    exitCode: result.exitCode ?? 0,
    signal: null,
    timedOut: false,
    provider: result.provider ?? config.provider ?? "auto",
    model: result.model ?? config.model ?? "openrouter/free",
    summary: result.response?.slice(0, 2000) ?? "",
    resultJson: {
      result: result.response ?? "",
      session_id: result.session_id ?? null,
      usage: result.usage ?? null,
      cost_usd: result.cost_usd ?? null,
      contract: result.contract ?? null,
      error: result.error ?? null,
    },
    sessionParams: result.session_id ? { sessionId: result.session_id } : undefined,
  };
}

export async function detectModel(): Promise<{ model: string; provider: string; source: string; candidates?: string[] } | null> {
  const result = await detectModelHttp();
  return {
    model: result.model,
    provider: result.provider,
    source: "http",
    candidates: result.available_models,
  };
}

export async function listSkills(ctx: AdapterSkillContext): Promise<AdapterSkillSnapshot> {
  const config = getConfigFromEnv(ctx.config);
  const availableEntries = await readPaperclipRuntimeSkillEntries(ctx.config, __moduleDir);
  const desiredSkills = resolvePaperclipDesiredSkillNames(ctx.config, availableEntries);
  const skillsHome = resolveHermesSkillsHome();
  const installed = await readInstalledSkillTargets(skillsHome);
  
  return buildPersistentSkillSnapshot({
    adapterType: "hermes_http",
    availableEntries,
    desiredSkills,
    installed,
    skillsHome,
    locationLabel: "~/.hermes/skills",
    installedDetail: "Installed in Hermes skills home for agent execution.",
    missingDetail: "Configured but not currently linked into Hermes skills home.",
    externalConflictDetail: "Skill name is occupied by an external installation in Hermes skills home.",
    externalDetail: "Installed outside Paperclip management in Hermes skills home.",
    warnings: [],
  });
}

function resolveHermesSkillsHome(): string {
  const home = typeof process.env.HOME === "string" ? process.env.HOME : os.homedir();
  return path.join(home, ".hermes", "skills");
}

/** Per-agent skills home: `<global>/@<agentId>` so tenants never share one directory. */
export function resolveAgentSkillsHome(agentId?: string): string {
  const home = resolveHermesSkillsHome();
  if (typeof agentId !== "string" || !/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(agentId)) return home;
  return path.join(home, `@${agentId}`);
}

const AGENT_ASSIGNED_MANIFEST = ".paperclip-assigned.json";

function stripPaperclipSkillPrefix(name: string): string {
  return String(name).replace(/^paperclipai\/paperclip\//i, "").trim();
}

/**
 * Link ONLY this agent's assigned skills into its own subdirectory and prune
 * anything else there. Best-effort: never throws. Steady-state cost is one
 * small manifest read per wake; the full entries scan runs only when the
 * assignment actually changed.
 */
export async function ensureAgentSkillLinks(
  agentId: string,
  assignedSkills: string[],
  loadEntries: () => Promise<Array<{ key: string; runtimeName?: string | null; source?: string | null }>>,
): Promise<void> {
  const home = resolveAgentSkillsHome(agentId);
  if (home === resolveHermesSkillsHome()) return;
  const want = assignedSkills.map((s) => stripPaperclipSkillPrefix(s).toLowerCase()).filter(Boolean).sort();
  try {
    await fs.mkdir(home, { recursive: true });
    try {
      const raw = await fs.readFile(path.join(home, AGENT_ASSIGNED_MANIFEST), "utf8");
      const have = JSON.parse(raw) as unknown;
      if (Array.isArray(have) && have.map(String).sort().join("\n") === want.join("\n")) return;
    } catch {
      // fall through to full sync
    }
    const entries = await loadEntries();
    const byKey = new Map<string, { runtimeName: string; source: string }>();
    const byRuntime = new Map<string, { runtimeName: string; source: string }>();
    for (const entry of entries) {
      const runtimeName = typeof entry.runtimeName === "string" ? entry.runtimeName.trim() : "";
      const source = typeof entry.source === "string" ? entry.source.trim() : "";
      if (!entry.key || !runtimeName || !source) continue;
      const rec = { runtimeName, source };
      byKey.set(stripPaperclipSkillPrefix(entry.key).toLowerCase(), rec);
      byRuntime.set(runtimeName.toLowerCase(), rec);
    }
    const desired = new Set<string>();
    for (const name of want) {
      const hit = byKey.get(name) ?? byRuntime.get(name);
      if (!hit) continue;
      await ensurePaperclipSkillSymlink(hit.source, path.join(home, hit.runtimeName));
      desired.add(hit.runtimeName);
    }
    const names = await fs.readdir(home).catch(() => [] as string[]);
    for (const name of names) {
      if (name === AGENT_ASSIGNED_MANIFEST || desired.has(name)) continue;
      const target = path.join(home, name);
      const st = await fs.lstat(target).catch(() => null);
      if (st && st.isSymbolicLink()) await fs.unlink(target).catch(() => {});
    }
    await fs.writeFile(path.join(home, AGENT_ASSIGNED_MANIFEST), JSON.stringify(want)).catch(() => {});
  } catch {
    // best-effort: skill materialization must never fail a wake
  }
}

export async function syncSkills(ctx: AdapterSkillContext, desiredSkills: string[]): Promise<AdapterSkillSnapshot> {
  const config = getConfigFromEnv(ctx.config);
  const availableEntries = await readPaperclipRuntimeSkillEntries(ctx.config, __moduleDir);
  const skillsHome = resolveHermesSkillsHome();
  
  await fs.mkdir(skillsHome, { recursive: true });
  
  const installed = await readInstalledSkillTargets(skillsHome);
  const availableByRuntimeName = new Map(availableEntries.map((entry) => [entry.runtimeName, entry]));
  const desiredSet = new Set(desiredSkills);
  
  for (const available of availableEntries) {
    if (!desiredSet.has(available.key)) continue;
    const target = path.join(skillsHome, available.runtimeName);
    await ensurePaperclipSkillSymlink(available.source, target);
  }
  
  for (const [name, installedEntry] of installed.entries()) {
    const available = availableByRuntimeName.get(name);
    if (!available) continue;
    if (desiredSet.has(available.key)) continue;
    if (installedEntry.targetPath === available.source) continue;
    await fs.unlink(path.join(skillsHome, name)).catch(() => {});
  }
  
  return listSkills(ctx);
}

export const sessionCodec: AdapterSessionCodec = {
  serialize: (params) => params ?? {},
  deserialize: (raw) => typeof raw === "object" && raw !== null ? raw as Record<string, unknown> : null,
};

const hermesHttpAdapter: ServerAdapterModule = {
  type: "hermes_http",
  execute,
  testEnvironment,
  detectModel,
  listSkills,
  syncSkills,
  models: [],
  supportsLocalAgentJwt: false,
  supportsInstructionsBundle: false,
  requiresMaterializedRuntimeSkills: false,
  agentConfigurationDoc,
  sessionCodec,
  getRuntimeCommandSpec: () => ({
    command: "python hermes_server.py",
    detectCommand: "python hermes_server.py",
    installCommand: "pip install fastapi uvicorn",
  }),
};

export function createServerAdapter(): ServerAdapterModule {
  return hermesHttpAdapter;
}

export default hermesHttpAdapter;