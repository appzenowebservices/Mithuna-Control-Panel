import { and, eq, inArray } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { agents, companySkills } from "@paperclipai/db";
import type { SkillRequirements } from "@paperclipai/shared";
import { parseFrontmatterMarkdown } from "@paperclipai/shared";
import { readPaperclipSkillSyncPreference } from "@paperclipai/adapter-utils/server-utils";

export type SkillPreflightIssueKind =
  | "missing_mcp_provider"
  | "missing_tool"
  | "unknown_inventory";

export type SkillPreflightSeverity = "error" | "warning";

export interface SkillPreflightIssue {
  skillKey: string;
  skillName: string;
  kind: SkillPreflightIssueKind;
  requirement: "mcp" | "tools" | "optionalTools";
  expected: string;
  actual: string[];
  severity: SkillPreflightSeverity;
  remediation: string;
}

export interface SkillPreflightSkill {
  key: string;
  name: string;
  requirements: SkillRequirements;
}

export interface SkillPreflightResult {
  ok: boolean;
  checkedSkills: string[];
  issues: SkillPreflightIssue[];
}

function normalizeList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const entry of value) {
    if (typeof entry !== "string") continue;
    const trimmed = entry.trim();
    if (trimmed && !out.includes(trimmed)) out.push(trimmed);
  }
  return out;
}

function readRequiresObject(value: unknown): SkillRequirements {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const record = value as Record<string, unknown>;
  const requirements: SkillRequirements = {};
  const mcp = normalizeList(record.mcp);
  const tools = normalizeList(record.tools);
  const optionalTools = normalizeList(record.optionalTools ?? record.optional_tools);
  if (mcp.length > 0) requirements.mcp = mcp;
  if (tools.length > 0) requirements.tools = tools;
  if (optionalTools.length > 0) requirements.optionalTools = optionalTools;
  return requirements;
}

/**
 * Reads `requires:` from SKILL.md frontmatter and/or `metadata.requirements`.
 * Frontmatter wins per field; metadata is the fallback so older imported skills
 * that already carry requirements keep working.
 */
export function parseSkillRequirements(
  markdown: string | null | undefined,
  metadata?: Record<string, unknown> | null,
): SkillRequirements {
  const fromMetadata = readRequiresObject(
    metadata && typeof metadata.requirements === "object" ? metadata.requirements : null,
  );
  if (!markdown) return fromMetadata;
  let fromFrontmatter: SkillRequirements = {};
  try {
    const parsed = parseFrontmatterMarkdown(markdown);
    const frontmatter = parsed.frontmatter as Record<string, unknown>;
    fromFrontmatter = readRequiresObject(frontmatter.requires);
    const nestedMetadata = frontmatter.metadata;
    if (Object.keys(fromFrontmatter).length === 0 && nestedMetadata && typeof nestedMetadata === "object") {
      fromFrontmatter = readRequiresObject(
        (nestedMetadata as Record<string, unknown>).requirements,
      );
    }
  } catch {
    return fromMetadata;
  }
  return {
    ...fromMetadata,
    ...fromFrontmatter,
  };
}

export function hasSkillRequirements(requirements: SkillRequirements): boolean {
  return Boolean(
    (requirements.mcp?.length ?? 0) > 0 ||
      (requirements.tools?.length ?? 0) > 0 ||
      (requirements.optionalTools?.length ?? 0) > 0,
  );
}

/**
 * Pure evaluator: given assigned skills and the agent's bound MCP servers /
 * known tool inventory, decide whether a run may start.
 *
 * Inventory semantics: unknown inventory never fails a run (warning instead),
 * because the panel must not infer that a tool is missing when it simply has
 * not synced the provider yet.
 */
export function evaluateSkillPreflight(input: {
  skills: SkillPreflightSkill[];
  mcpServers: string[];
  toolInventory?: Record<string, string[]> | null;
}): SkillPreflightResult {
  const issues: SkillPreflightIssue[] = [];
  const inventory = input.toolInventory ?? null;
  const boundServers = new Set(input.mcpServers.map((server) => server.trim()).filter(Boolean));

  for (const skill of input.skills) {
    const { requirements } = skill;

    for (const provider of requirements.mcp ?? []) {
      if (!boundServers.has(provider)) {
        issues.push({
          skillKey: skill.key,
          skillName: skill.name,
          kind: "missing_mcp_provider",
          requirement: "mcp",
          expected: provider,
          actual: [...boundServers],
          severity: "error",
          remediation: `Bind the "${provider}" MCP server to this agent (Agent → MCP servers).`,
        });
      }
    }

    if ((requirements.tools?.length ?? 0) > 0) {
      const providerServers = (requirements.mcp ?? []).filter((provider) => boundServers.has(provider));
      if (!inventory || providerServers.length === 0) {
        issues.push({
          skillKey: skill.key,
          skillName: skill.name,
          kind: "unknown_inventory",
          requirement: "tools",
          expected: (requirements.tools ?? []).join(", "),
          actual: [],
          severity: "warning",
          remediation:
            "Tool inventory has not been synced for this provider; refresh the MCP inventory to enable strict tool checks.",
        });
      } else {
        for (const tool of requirements.tools ?? []) {
          const known = providerServers.some((provider) => {
            const tools = inventory[provider];
            return Array.isArray(tools) && tools.includes(tool);
          });
          if (!known) {
            issues.push({
              skillKey: skill.key,
              skillName: skill.name,
              kind: "missing_tool",
              requirement: "tools",
              expected: tool,
              actual: inventory ? Object.values(inventory).flat() : [],
              severity: "error",
              remediation: `Enable the "${tool}" tool on the bound MCP server for this agent.`,
            });
          }
        }
      }
    }

    for (const tool of requirements.optionalTools ?? []) {
      const known =
        inventory &&
        (requirements.mcp ?? []).some((provider) => Array.isArray(inventory[provider]) && inventory[provider]!.includes(tool));
      if (!known) {
        issues.push({
          skillKey: skill.key,
          skillName: skill.name,
          kind: "unknown_inventory",
          requirement: "optionalTools",
          expected: tool,
          actual: [],
          severity: "warning",
          remediation: "Optional tool is not available; the run continues without it.",
        });
      }
    }
  }

  return {
    ok: !issues.some((issue) => issue.severity === "error"),
    checkedSkills: input.skills.map((skill) => skill.key),
    issues,
  };
}

function readToolInventory(config: Record<string, unknown>): Record<string, string[]> | null {
  const raw = config.mcpServerTools;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const inventory: Record<string, string[]> = {};
  for (const [server, tools] of Object.entries(raw as Record<string, unknown>)) {
    const list = normalizeList(tools);
    if (list.length > 0) inventory[server] = list;
  }
  return Object.keys(inventory).length > 0 ? inventory : null;
}

/**
 * Resolves an agent's assigned skills + MCP bindings and evaluates their
 * declared `requires:` block. Read-only; safe to call from the UI and from the
 * dispatch path.
 */
export async function runSkillPreflight(
  db: Db,
  input: { agentId: string; companyId: string },
): Promise<SkillPreflightResult> {
  const agent = await db
    .select({ id: agents.id, adapterConfig: agents.adapterConfig })
    .from(agents)
    .where(and(eq(agents.id, input.agentId), eq(agents.companyId, input.companyId)))
    .then((rows) => rows[0] ?? null);
  if (!agent) {
    return { ok: false, checkedSkills: [], issues: [] };
  }

  const config = (agent.adapterConfig ?? {}) as Record<string, unknown>;
  const preference = readPaperclipSkillSyncPreference(config);
  const desiredKeys = preference.desiredSkills;
  if (desiredKeys.length === 0) {
    return { ok: true, checkedSkills: [], issues: [] };
  }

  const rows = await db
    .select({
      key: companySkills.key,
      name: companySkills.name,
      markdown: companySkills.markdown,
      metadata: companySkills.metadata,
    })
    .from(companySkills)
    .where(and(eq(companySkills.companyId, input.companyId), inArray(companySkills.key, desiredKeys)));

  const skills: SkillPreflightSkill[] = rows.map((row) => ({
    key: row.key,
    name: row.name,
    requirements: parseSkillRequirements(row.markdown, row.metadata),
  }));

  const mcpServers = normalizeList(config.mcpServers);

  return evaluateSkillPreflight({
    skills,
    mcpServers,
    toolInventory: readToolInventory(config),
  });
}
