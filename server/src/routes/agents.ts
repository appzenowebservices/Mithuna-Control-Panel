import { Router, type Request, type Response } from "express";
import { generateKeyPairSync, randomUUID } from "node:crypto";
import path from "node:path";
import type { Db } from "@paperclipai/db";
import { agents as agentsTable, companies, heartbeatRuns, issues as issuesTable, projects as projectsTable } from "@paperclipai/db";
import { and, desc, eq, inArray, not, sql } from "drizzle-orm";
import {
  agentSkillSyncSchema,
  agentMineInboxQuerySchema,
  AGENT_DEFAULT_MAX_CONCURRENT_RUNS,
  createAgentKeySchema,
  createAgentHireSchema,
  createAgentSchema,
  deriveAgentUrlKey,
  isUuidLike,
  normalizeIssueIdentifier,
  resetAgentSessionSchema,
  testAdapterEnvironmentSchema,
  type AgentDesiredSkillEntry,
  type AgentSkillSnapshot,
  type InstanceSchedulerHeartbeatAgent,
  upsertAgentInstructionsFileSchema,
  appendAgentMemorySchema,
  createAgentRuleSchema,
  recordAgentDistilledSchema,
  searchAgentMemoriesSchema,
  upsertAgentHousesSchema,
  upsertAgentSelfSchema,
  upsertHermesSessionSchema,
  updateAgentInstructionsBundleSchema,
  updateAgentPermissionsSchema,
  updateAgentInstructionsPathSchema,
  wakeAgentSchema,
  updateAgentSchema,
  supportedEnvironmentDriversForAdapter,
  LOW_TRUST_REVIEW_PRESET,
} from "@paperclipai/shared";
import {
  resolvePaperclipInstanceRootForAdapter,
  readPaperclipSkillSyncPreference,
  writePaperclipSkillSyncPreference,
} from "@paperclipai/adapter-utils/server-utils";
import { trackAgentCreated } from "@paperclipai/shared/telemetry";
import { validate } from "../middleware/validate.js";
import {
  agentService,
  agentInstructionsService,
  agentMemoryService,
  accessService,
  approvalService,
  companySkillService,
  budgetService,
  heartbeatService,
  ISSUE_LIST_DEFAULT_LIMIT,
  issueApprovalService,
  issueRecoveryActionService,
  issueService,
  KG_GENERATED_END,
  KG_GENERATED_START,
  KG_HOUSES,
  applyPruneGate,
  buildManualBlock,
  kgDistilledDates,
  kgTodayUtc,
  logActivity,
  parseDiaryRegions,
  publishLiveEvent,
  syncInstructionsBundleConfigFromFilePath,
  workspaceOperationService,
} from "../services/index.js";
import { conflict, forbidden, notFound, unprocessable } from "../errors.js";
import { assertBoard, assertCompanyAccess, assertInstanceAdmin, getActorInfo } from "./authz.js";
import {
  assertNoAgentHostWorkspaceCommandMutation,
  collectAgentAdapterWorkspaceCommandPaths,
} from "./workspace-command-authz.js";
import type { PluginWorkerManager } from "../services/plugin-worker-manager.js";
import { environmentService } from "../services/environments.js";
import { hermesSessionService, normalizeHermesSnapshot } from "../services/hermes-sessions.js";
import { resolveEnvironmentExecutionTarget } from "../services/environment-execution-target.js";
import { environmentRuntimeService } from "../services/environment-runtime.js";
import type { AdapterExecutionTarget } from "@paperclipai/adapter-utils/execution-target";
import type {
  AdapterEnvironmentCheck,
  AdapterEnvironmentTestResult,
} from "@paperclipai/adapter-utils";
import { skillVersionSelectionMap } from "../services/runtime-skill-selections.js";
import { secretService } from "../services/secrets.js";
import {
  detectAdapterModel,
  findActiveServerAdapter,
  findServerAdapter,
  listAdapterModels,
  listAdapterModelProfiles,
  refreshAdapterModels,
  requireServerAdapter,
} from "../adapters/index.js";
import { redactEventPayload } from "../redaction.js";
import { redactCurrentUserValue } from "../log-redaction.js";
import { renderOrgChartSvg, renderOrgChartPng, type OrgNode, type OrgChartStyle, ORG_CHART_STYLES } from "./org-chart-svg.js";
import { instanceSettingsService } from "../services/instance-settings.js";
import { runClaudeLogin } from "@paperclipai/adapter-claude-local/server";
import {
  DEFAULT_ACPX_LOCAL_AGENT,
  DEFAULT_ACPX_LOCAL_MODE,
  DEFAULT_ACPX_LOCAL_NON_INTERACTIVE_PERMISSIONS,
  DEFAULT_ACPX_LOCAL_PERMISSION_MODE,
} from "@paperclipai/adapter-acpx-local";
import { DEFAULT_CODEX_LOCAL_BYPASS_APPROVALS_AND_SANDBOX } from "@paperclipai/adapter-codex-local";
import { DEFAULT_CURSOR_LOCAL_MODEL } from "@paperclipai/adapter-cursor-local";
import { DEFAULT_GEMINI_LOCAL_MODEL } from "@paperclipai/adapter-gemini-local";
import { DEFAULT_OPENCODE_LOCAL_MODEL } from "@paperclipai/adapter-opencode-local";
import { requireOpenCodeModelId } from "@paperclipai/adapter-opencode-local/server";
import {
  loadDefaultAgentInstructionsBundle,
  resolveDefaultAgentInstructionsBundleRole,
} from "../services/default-agent-instructions.js";
import { getTelemetryClient } from "../telemetry.js";
import { assertEnvironmentSelectionForCompany } from "./environment-selection.js";
import { recoveryService } from "../services/recovery/service.js";
import { resolveCoreTrustPreset } from "../services/trust-preset-resolver.js";
import { readObject } from "../lib/objects.js";
import { listInvalidOrgChainDescendantIds } from "../services/agent-invokability.js";

const RUN_LOG_DEFAULT_LIMIT_BYTES = 256_000;
const RUN_LOG_MAX_LIMIT_BYTES = 1024 * 1024;

function readRunLogLimitBytes(value: unknown) {
  const parsed = Number(value ?? RUN_LOG_DEFAULT_LIMIT_BYTES);
  if (!Number.isFinite(parsed)) return RUN_LOG_DEFAULT_LIMIT_BYTES;
  return Math.max(1, Math.min(RUN_LOG_MAX_LIMIT_BYTES, Math.trunc(parsed)));
}

function readLiveRunsQueryInt(value: unknown, max: number, fallback = 0) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  if (parsed <= 0) return fallback;
  return Math.min(max, Math.trunc(parsed));
}

function readRunIssueId(context: Record<string, unknown> | null) {
  const directIssueId = context?.issueId;
  if (typeof directIssueId === "string" && isUuidLike(directIssueId)) return directIssueId;
  const paperclipIssue = readObject(context?.paperclipIssue);
  const nestedIssueId = paperclipIssue?.id;
  return typeof nestedIssueId === "string" && isUuidLike(nestedIssueId) ? nestedIssueId : null;
}

export function agentRoutes(
  db: Db,
  options: { pluginWorkerManager?: PluginWorkerManager } = {},
) {
  // Legacy hardcoded maps — used as fallback when adapter module does not
  // declare capability flags explicitly.
  const DEFAULT_INSTRUCTIONS_PATH_KEYS: Record<string, string> = {
    acpx_local: "instructionsFilePath",
    claude_local: "instructionsFilePath",
    codex_local: "instructionsFilePath",
    droid_local: "instructionsFilePath",
    gemini_local: "instructionsFilePath",
    opencode_local: "instructionsFilePath",
    cursor: "instructionsFilePath",
    pi_local: "instructionsFilePath",
  };
  const DEFAULT_MANAGED_INSTRUCTIONS_ADAPTER_TYPES = new Set(Object.keys(DEFAULT_INSTRUCTIONS_PATH_KEYS));

  /** Check if an adapter supports the managed instructions bundle. */
  function adapterSupportsInstructionsBundle(adapterType: string): boolean {
    const adapter = findActiveServerAdapter(adapterType);
    if (adapter?.supportsInstructionsBundle !== undefined) return adapter.supportsInstructionsBundle;
    return DEFAULT_MANAGED_INSTRUCTIONS_ADAPTER_TYPES.has(adapterType);
  }

  /** Resolve the adapter config key for the instructions file path. */
  function resolveInstructionsPathKey(adapterType: string): string | null {
    const adapter = findActiveServerAdapter(adapterType);
    if (adapter?.instructionsPathKey) return adapter.instructionsPathKey;
    if (adapter?.supportsInstructionsBundle === true) return "instructionsFilePath";
    if (adapter?.supportsInstructionsBundle === false) return null;
    return DEFAULT_INSTRUCTIONS_PATH_KEYS[adapterType] ?? null;
  }
  const KNOWN_INSTRUCTIONS_PATH_KEYS = new Set(["instructionsFilePath", "agentsMdPath"]);
  const KNOWN_INSTRUCTIONS_BUNDLE_KEYS = [
    "instructionsBundleMode",
    "instructionsRootPath",
    "instructionsEntryFile",
    "instructionsFilePath",
    "agentsMdPath",
  ] as const;

  const router = Router();
  const svc = agentService(db);
  const access = accessService(db);
  const approvalsSvc = approvalService(db);
  const budgets = budgetService(db);
  const environmentsSvc = environmentService(db);
  const environmentRuntime = environmentRuntimeService(db, {
    pluginWorkerManager: options.pluginWorkerManager,
  });
  const heartbeat = heartbeatService(db, {
    pluginWorkerManager: options.pluginWorkerManager,
  });
  const recovery = recoveryService(db, { enqueueWakeup: heartbeat.wakeup });
  const issueApprovalsSvc = issueApprovalService(db);
  const secretsSvc = secretService(db);
  const instructions = agentInstructionsService();
  const memories = agentMemoryService(db);
  const hermesSessions = hermesSessionService(db);
  const companySkills = companySkillService(db);
  const workspaceOperations = workspaceOperationService(db);
  const instanceSettings = instanceSettingsService(db);
  const strictSecretsMode = process.env.PAPERCLIP_SECRETS_STRICT_MODE === "true";

  async function assertAgentEnvironmentSelection(
    companyId: string,
    adapterType: string,
    environmentId: string | null | undefined,
  ) {
    if (environmentId === undefined || environmentId === null) return;
    await assertEnvironmentSelectionForCompany(environmentService(db), companyId, environmentId, {
      allowedDrivers: allowedEnvironmentDriversForAgent(adapterType),
    });
  }

  async function decideAgentRead(req: Request, agent: { id: string; companyId: string }) {
    return access.decide({
      actor: req.actor,
      action: "agent:read",
      resource: { type: "agent", companyId: agent.companyId, agentId: agent.id },
    });
  }

  async function assertAgentReadAllowed(req: Request, res: Response, agent: { id: string; companyId: string }) {
    const decision = await decideAgentRead(req, agent);
    if (decision.allowed) return true;
    res.status(403).json({ error: "Agent is outside this actor's authorization boundary" });
    return false;
  }

  async function filterAgentsForActor<T extends Record<string, unknown>>(
    req: Request,
    rows: T[],
    fallbackCompanyId?: string,
  ) {
    const decisions = await Promise.all(rows.map((agent) => {
      const id = typeof agent.id === "string" ? agent.id : null;
      const companyId = typeof agent.companyId === "string" ? agent.companyId : fallbackCompanyId ?? null;
      if (!id || !companyId) return Promise.resolve({ allowed: false });
      return decideAgentRead(req, { id, companyId });
    }));
    return rows.filter((_, index) => decisions[index]?.allowed);
  }

  /**
   * Resolve the execution target the adapter should run its test probes against.
   *
   * - No environmentId / local environment → returns a local target so the
   *   adapter probes the Paperclip host (legacy behavior).
   * - SSH environment → builds an SSH execution target from the environment
   *   config so the adapter probes the remote box. No lease is required:
   *   the SSH spec is fully derived from the saved environment config.
   * - Sandbox / plugin environments → acquires an ad-hoc lease, realizes the
   *   workspace, and resolves a sandbox execution target wired to the runtime
   *   so the adapter probe runs inside the sandbox the same way a heartbeat
   *   would. The returned `release` callback rolls the lease back when the
   *   route is done.
   *
   * The caller MUST always invoke `release()` (typically in a `finally` block).
   */
  async function resolveAdapterTestExecutionContext(input: {
    companyId: string;
    adapterType: string;
    environmentId: string | null;
  }): Promise<{
    executionTarget: AdapterExecutionTarget | null;
    environmentName: string | null;
    fallbackChecks: AdapterEnvironmentCheck[];
    release: (status?: "released" | "failed") => Promise<void>;
  }> {
    const noopRelease = async () => {};

    if (!input.environmentId) {
      return {
        executionTarget: null,
        environmentName: null,
        fallbackChecks: [],
        release: noopRelease,
      };
    }

    const environment = await environmentsSvc.getById(input.environmentId);
    if (!environment) {
      return {
        executionTarget: null,
        environmentName: null,
        fallbackChecks: [
          {
            code: "environment_not_found",
            level: "warn",
            message: "Selected environment was not found. The test did not run.",
          },
        ],
        release: noopRelease,
      };
    }

    if (environment.driver === "local") {
      return {
        executionTarget: null,
        environmentName: environment.name,
        fallbackChecks: [],
        release: noopRelease,
      };
    }

    if (environment.driver === "ssh") {
      try {
        const target = await resolveEnvironmentExecutionTarget({
          db,
          companyId: input.companyId,
          adapterType: input.adapterType,
          environment: {
            id: environment.id,
            driver: environment.driver,
            config: environment.config ?? null,
          },
          leaseMetadata: null,
        });
        if (target) {
          return {
            executionTarget: target,
            environmentName: environment.name,
            fallbackChecks: [],
            release: noopRelease,
          };
        }
        return {
          executionTarget: null,
          environmentName: environment.name,
          fallbackChecks: [
            {
              code: "environment_target_unavailable",
              level: "warn",
              message:
                `Could not resolve an execution target for environment "${environment.name}". The test did not run.`,
            },
          ],
          release: noopRelease,
        };
      } catch (err) {
        return {
          executionTarget: null,
          environmentName: environment.name,
          fallbackChecks: [
            {
              code: "environment_target_failed",
              level: "warn",
              message:
                `Could not connect to environment "${environment.name}" to run the test.`,
              detail: err instanceof Error ? err.message : String(err),
            },
          ],
          release: noopRelease,
        };
      }
    }

    // sandbox / plugin / other remote drivers: spin up an ad-hoc lease, realize
    // the workspace inside the box, and run the same probe SSH uses against
    // a sandbox execution target wired to the environment runtime.
    //
    // We pass `heartbeatRunId: null` because there's no heartbeat run for an
    // operator-initiated `Test` invocation — the leases table FKs heartbeat
    // run id to heartbeat_runs.id, and we don't want to manufacture a fake
    // run row. Cleanup goes through the driver's `releaseRunLease` directly
    // (by lease record), since the batch helper queries by heartbeatRunId.
    let leaseRecord: Awaited<ReturnType<typeof environmentRuntime.acquireRunLease>>;
    try {
      leaseRecord = await environmentRuntime.acquireRunLease({
        companyId: input.companyId,
        environment,
        issueId: null,
        heartbeatRunId: null,
        persistedExecutionWorkspace: null,
      });
    } catch (err) {
      return {
        executionTarget: null,
        environmentName: environment.name,
        fallbackChecks: [
          {
            code: "environment_lease_acquire_failed",
            level: "error",
            message: `Could not acquire a lease for environment "${environment.name}".`,
            detail: err instanceof Error ? err.message : String(err),
            hint: "Check the environment's provider credentials and quota.",
          },
        ],
        release: noopRelease,
      };
    }

    const driver = environmentRuntime.getDriver(environment.driver);
    const releaseLease = async (status: "released" | "failed" = "released") => {
      try {
        if (driver) {
          await driver.releaseRunLease({
            environment,
            lease: leaseRecord.lease,
            status,
          });
        } else {
          await environmentsSvc.releaseLease(leaseRecord.lease.id, status);
        }
      } catch (err) {
        // Cleanup failures must not mask the test result.
        // eslint-disable-next-line no-console
        console.warn(
          `[adapter-test] Failed to release lease ${leaseRecord.lease.id}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    };

    let realizedCwd: string | null = null;
    try {
      const realized = await environmentRuntime.realizeWorkspace({
        environment,
        lease: leaseRecord.lease,
        // No host workspace to copy for a Test invocation; sandbox/plugin
        // realize implementations use the lease metadata's remoteCwd to
        // create the working directory inside the box.
        workspace: {},
      });
      realizedCwd =
        typeof realized.cwd === "string" && realized.cwd.trim().length > 0
          ? realized.cwd.trim()
          : null;
    } catch (err) {
      await releaseLease("failed");
      return {
        executionTarget: null,
        environmentName: environment.name,
        fallbackChecks: [
          {
            code: "environment_workspace_realize_failed",
            level: "error",
            message: `Could not realize a workspace inside "${environment.name}".`,
            detail: err instanceof Error ? err.message : String(err),
          },
        ],
        release: noopRelease,
      };
    }

    let target: AdapterExecutionTarget | null;
    try {
      // Prefer the cwd the realize step returned; fall back to lease metadata.
      const leaseMetadataForTarget: Record<string, unknown> | null =
        realizedCwd
          ? { ...(leaseRecord.lease.metadata ?? {}), remoteCwd: realizedCwd }
          : (leaseRecord.lease.metadata as Record<string, unknown> | null) ?? null;

      target = await resolveEnvironmentExecutionTarget({
        db,
        companyId: input.companyId,
        adapterType: input.adapterType,
        environment: {
          id: environment.id,
          driver: environment.driver,
          config: environment.config ?? null,
        },
        leaseId: leaseRecord.lease.id,
        leaseMetadata: leaseMetadataForTarget,
        lease: leaseRecord.lease,
        environmentRuntime,
      });
    } catch (err) {
      await releaseLease("failed");
      return {
        executionTarget: null,
        environmentName: environment.name,
        fallbackChecks: [
          {
            code: "environment_target_failed",
            level: "error",
            message: `Could not resolve a sandbox execution target for "${environment.name}".`,
            detail: err instanceof Error ? err.message : String(err),
          },
        ],
        release: noopRelease,
      };
    }

    if (!target) {
      await releaseLease("failed");
      return {
        executionTarget: null,
        environmentName: environment.name,
        fallbackChecks: [
          {
            code: "environment_target_unsupported",
            level: "warn",
            message:
              `Adapter "${input.adapterType}" is not allowed in "${environment.name}" environments.`,
          },
        ],
        release: noopRelease,
      };
    }

    return {
      executionTarget: target,
      environmentName: environment.name,
      fallbackChecks: [],
      release: releaseLease,
    };
  }

  async function getCurrentUserRedactionOptions() {
    return {
      enabled: (await instanceSettings.getGeneral()).censorUsernameInLogs,
    };
  }

  function canCreateAgents(agent: { role: string; permissions: Record<string, unknown> | null | undefined }) {
    if (!agent.permissions || typeof agent.permissions !== "object") return false;
    return Boolean((agent.permissions as Record<string, unknown>).canCreateAgents);
  }

  async function buildAgentAccessState(agent: NonNullable<Awaited<ReturnType<typeof svc.getById>>>) {
    const membership = await access.getMembership(agent.companyId, "agent", agent.id);
    const grants = membership
      ? await access.listPrincipalGrants(agent.companyId, "agent", agent.id)
      : [];
    const hasExplicitTaskAssignGrant = grants.some((grant) => grant.permissionKey === "tasks:assign");

    if (agent.role === "ceo") {
      return {
        canAssignTasks: true,
        taskAssignSource: "ceo_role" as const,
        membership,
        grants,
      };
    }

    if (canCreateAgents(agent)) {
      return {
        canAssignTasks: true,
        taskAssignSource: "agent_creator" as const,
        membership,
        grants,
      };
    }

    if (hasExplicitTaskAssignGrant) {
      return {
        canAssignTasks: true,
        taskAssignSource: "explicit_grant" as const,
        membership,
        grants,
      };
    }

    if (membership?.status === "active") {
      return {
        canAssignTasks: true,
        taskAssignSource: "simple_default" as const,
        membership,
        grants,
      };
    }

    return {
      canAssignTasks: false,
      taskAssignSource: "none" as const,
      membership,
      grants,
    };
  }

  async function buildAgentDetail(
    agent: NonNullable<Awaited<ReturnType<typeof svc.getById>>>,
    options?: { restricted?: boolean },
  ) {
    const [chainOfCommand, accessState] = await Promise.all([
      svc.getChainOfCommand(agent.id),
      buildAgentAccessState(agent),
    ]);

    return {
      ...(options?.restricted ? redactForRestrictedAgentView(agent) : agent),
      chainOfCommand,
      access: accessState,
    };
  }

  async function resolveAgentSelfTrustPreset(req: Request, agent: NonNullable<Awaited<ReturnType<typeof svc.getById>>>) {
    if (req.actor.type !== "agent" || req.actor.agentId !== agent.id) {
      return { kind: "standard" as const };
    }
    const run = req.actor.type === "agent" && req.actor.runId
      ? await db
          .select({
            companyId: heartbeatRuns.companyId,
            agentId: heartbeatRuns.agentId,
            contextSnapshot: heartbeatRuns.contextSnapshot,
          })
          .from(heartbeatRuns)
          .where(and(eq(heartbeatRuns.id, req.actor.runId), eq(heartbeatRuns.companyId, agent.companyId)))
          .then((rows) => rows[0] ?? null)
      : null;
    const runContext = run?.agentId === agent.id ? readObject(run.contextSnapshot) : null;
    const runExecutionPolicy = readObject(runContext?.executionPolicy);
    const runIssueId = readRunIssueId(runContext);
    const runScopedIssue = runIssueId
      ? await db
          .select({
            companyId: issuesTable.companyId,
            projectId: issuesTable.projectId,
            executionPolicy: issuesTable.executionPolicy,
            projectExecutionWorkspacePolicy: projectsTable.executionWorkspacePolicy,
          })
          .from(issuesTable)
          .leftJoin(projectsTable, and(eq(projectsTable.id, issuesTable.projectId), eq(projectsTable.companyId, issuesTable.companyId)))
          .where(and(eq(issuesTable.id, runIssueId), eq(issuesTable.companyId, agent.companyId)))
          .then((rows) => rows[0] ?? null)
      : null;

    return resolveCoreTrustPreset({
      companyId: agent.companyId,
      agent,
      project: runScopedIssue?.projectId
        ? {
            companyId: runScopedIssue.companyId,
            executionWorkspacePolicy: runScopedIssue.projectExecutionWorkspacePolicy,
          }
        : null,
      issue: runScopedIssue
        ? {
            companyId: runScopedIssue.companyId,
            executionPolicy: runScopedIssue.executionPolicy,
          }
        : null,
      run: runExecutionPolicy ? { companyId: agent.companyId, executionPolicy: runExecutionPolicy } : null,
    });
  }

  function buildLowTrustSelfView(agent: NonNullable<Awaited<ReturnType<typeof svc.getById>>>) {
    return {
      id: agent.id,
      companyId: agent.companyId,
      name: agent.name,
      role: agent.role,
      title: agent.title,
      status: agent.status,
      trustPreset: LOW_TRUST_REVIEW_PRESET,
    };
  }

  async function applyDefaultAgentTaskAssignGrant(
    companyId: string,
    agentId: string,
    grantedByUserId: string | null,
  ) {
    await access.ensureMembership(companyId, "agent", agentId, "member", "active");
    await access.setPrincipalPermission(
      companyId,
      "agent",
      agentId,
      "tasks:assign",
      true,
      grantedByUserId,
    );
  }

  async function assertCanCreateAgentsForCompany(req: Request, companyId: string) {
    assertCompanyAccess(req, companyId);
    const decision = await access.decide({
      actor: req.actor,
      action: "agents:create",
      resource: { type: "company", companyId },
    });
    if (!decision.allowed) {
      throw forbidden(decision.explanation);
    }
    if (req.actor.type !== "agent") return null;
    const actorAgent = req.actor.agentId ? await svc.getById(req.actor.agentId) : null;
    if (!actorAgent || actorAgent.companyId !== companyId) {
      throw forbidden("Agent key cannot access another company");
    }
    return actorAgent;
  }

  async function assertBoardCanManageAgentsForCompany(req: Request, companyId: string) {
    assertBoard(req);
    assertCompanyAccess(req, companyId);
    const decision = await access.decide({
      actor: req.actor,
      action: "agents:create",
      resource: { type: "company", companyId },
    });
    if (decision.allowed) return;
    throw forbidden(decision.explanation);
  }

  async function assertCanReadConfigurations(req: Request, companyId: string) {
    // Reading agent configurations, skills, and config revisions is a
    // read-only operation available to any board (human) member of the
    // company. Responses go through `redactAgentConfiguration` so secrets
    // are never exposed. Mutations and environment probes still gate on
    // agents:create via assertCanCreateAgentsForCompany / assertCanUpdateAgent.
    //
    // For AGENT actors we keep the previous, stricter gate: an agent must
    // either have an explicit `agents:create` grant or the legacy
    // `canCreateAgents` permission on its own record. Agents are
    // non-human principals — they should not be able to introspect peer
    // agents' configurations just by virtue of being in the same company.
    assertCompanyAccess(req, companyId);
    if (req.actor.type === "agent") {
      if (!req.actor.agentId) throw forbidden("Agent authentication required");
      const actorAgent = await svc.getById(req.actor.agentId);
      if (!actorAgent || actorAgent.companyId !== companyId) {
        throw forbidden("Agent key cannot access another company");
      }
      const allowedByGrant = await access.hasPermission(
        companyId,
        "agent",
        actorAgent.id,
        "agents:create",
      );
      if (!allowedByGrant && !canCreateAgents(actorAgent)) {
        throw forbidden("Missing permission: can create agents");
      }
      return actorAgent;
    }
    return null;
  }

  async function getAccessibleAgent(req: Request, res: Response, id: string) {
    const agent = await svc.getById(id);
    if (!agent) {
      res.status(404).json({ error: "Agent not found" });
      return null;
    }
    assertCompanyAccess(req, agent.companyId);
    if (req.actor.type === "board") {
      await assertBoardCanManageAgentsForCompany(req, agent.companyId);
    }
    return agent;
  }

  async function actorCanReadConfigurationsForCompany(req: Request, companyId: string) {
    // Mirrors assertCanReadConfigurations but returns a boolean instead of
    // throwing. Board actors only need company access; agent actors must
    // still pass the agents:create gate (explicit grant or canCreateAgents
    // on their own record) so peer agents cannot snoop each others'
    // configurations.
    try {
      assertCompanyAccess(req, companyId);
    } catch {
      return false;
    }
    if (req.actor.type === "board") return true;
    if (!req.actor.agentId) return false;
    const actorAgent = await svc.getById(req.actor.agentId);
    if (!actorAgent || actorAgent.companyId !== companyId) return false;
    const allowedByGrant = await access.hasPermission(
      companyId,
      "agent",
      actorAgent.id,
      "agents:create",
    );
    return allowedByGrant || canCreateAgents(actorAgent);
  }

  async function buildSkippedWakeupResponse(
    agent: NonNullable<Awaited<ReturnType<typeof svc.getById>>>,
    payload: Record<string, unknown> | null | undefined,
  ) {
    const issueId = typeof payload?.issueId === "string" && payload.issueId.trim() ? payload.issueId : null;
    if (!issueId) {
      return {
        status: "skipped" as const,
        reason: "wakeup_skipped",
        message: "Wakeup was skipped.",
        issueId: null,
        executionRunId: null,
        executionAgentId: null,
        executionAgentName: null,
      };
    }

    const issue = await db
      .select({
        id: issuesTable.id,
        executionRunId: issuesTable.executionRunId,
      })
      .from(issuesTable)
      .where(and(eq(issuesTable.id, issueId), eq(issuesTable.companyId, agent.companyId)))
      .then((rows) => rows[0] ?? null);

    if (!issue?.executionRunId) {
      return {
        status: "skipped" as const,
        reason: "wakeup_skipped",
        message: "Wakeup was skipped.",
        issueId,
        executionRunId: null,
        executionAgentId: null,
        executionAgentName: null,
      };
    }

    const executionRun = await heartbeat.getRun(issue.executionRunId);
    if (!executionRun || (executionRun.status !== "queued" && executionRun.status !== "running")) {
      return {
        status: "skipped" as const,
        reason: "wakeup_skipped",
        message: "Wakeup was skipped.",
        issueId,
        executionRunId: issue.executionRunId,
        executionAgentId: null,
        executionAgentName: null,
      };
    }

    const executionAgent = await svc.getById(executionRun.agentId);
    const executionAgentName = executionAgent?.name ?? null;

    return {
      status: "skipped" as const,
      reason: "issue_execution_deferred",
      message: executionAgentName
        ? `Wakeup was deferred because this issue is already being executed by ${executionAgentName}.`
        : "Wakeup was deferred because this issue already has an active execution run.",
      issueId,
      executionRunId: executionRun.id,
      executionAgentId: executionRun.agentId,
      executionAgentName,
    };
  }

  async function assertCanUpdateAgent(req: Request, targetAgent: { id: string; companyId: string }) {
    assertCompanyAccess(req, targetAgent.companyId);
    const decision = await access.decide({
      actor: req.actor,
      action: "agent_config:update",
      resource: { type: "agent", companyId: targetAgent.companyId, agentId: targetAgent.id },
    });
    if (decision.allowed) return;
    throw forbidden(decision.explanation);
  }

  async function assertCanReadAgent(req: Request, targetAgent: { companyId: string }) {
    assertCompanyAccess(req, targetAgent.companyId);
    if (req.actor.type === "board") {
      await assertCanReadConfigurations(req, targetAgent.companyId);
      return;
    }
    if (!req.actor.agentId) throw forbidden("Agent authentication required");

    const actorAgent = await svc.getById(req.actor.agentId);
    if (!actorAgent || actorAgent.companyId !== targetAgent.companyId) {
      throw forbidden("Agent key cannot access another company");
    }
  }

  // Hermes runtime sessions: board callers pass company access; agent-key
  // callers (hermes_server.py holding the agent's own key) may read/write
  // only their own agent's rows.
  function assertCanManageHermesSession(req: Request, targetAgent: { id: string; companyId: string }) {
    assertCompanyAccess(req, targetAgent.companyId);
    if (req.actor.type === "board") return;
    if (req.actor.type !== "agent" || req.actor.agentId !== targetAgent.id) {
      throw forbidden("Agent keys can only access their own Hermes sessions");
    }
  }

  function assertKnownAdapterType(type: string | null | undefined): string {
    const adapterType = typeof type === "string" ? type.trim() : "";
    if (!adapterType) {
      throw unprocessable("Adapter type is required");
    }
    if (!findServerAdapter(adapterType)) {
      throw unprocessable(`Unknown adapter type: ${adapterType}`);
    }
    return adapterType;
  }

  async function assertAgentDefaultEnvironmentSelection(
    companyId: string,
    environmentId: string | null | undefined,
    options?: { allowedDrivers?: string[]; allowedSandboxProviders?: string[] },
  ) {
    if (environmentId === undefined || environmentId === null) return;
    const environment = await environmentsSvc.getById(environmentId);
    if (!environment) {
      throw unprocessable("Selected environment was not found");
    }
    if (options?.allowedDrivers && !options.allowedDrivers.includes(environment.driver)) {
      throw unprocessable(`Environment driver "${environment.driver}" is not allowed here`);
    }
    if (environment.driver === "sandbox" && options?.allowedSandboxProviders) {
      const config = environment.config && typeof environment.config === "object"
        ? environment.config as Record<string, unknown>
        : {};
      const provider = typeof config.provider === "string" ? config.provider : "";
      if (provider === "fake") {
        throw unprocessable(
          `Selected sandbox provider "${provider}" is not supported for agent defaults yet`,
        );
      }
      if (options.allowedSandboxProviders.length > 0 && !options.allowedSandboxProviders.includes(provider)) {
        throw unprocessable(
          `Selected sandbox provider "${provider || "unknown"}" is not supported for agent defaults yet`,
        );
      }
    }
  }

  function hasOwn(value: object, key: string): boolean {
    return Object.hasOwn(value, key);
  }

  function allowedEnvironmentDriversForAgent(adapterType: string): string[] {
    return supportedEnvironmentDriversForAdapter(adapterType);
  }

  function allowedSandboxProvidersForAgent(adapterType: string): string[] | undefined {
    return supportedEnvironmentDriversForAdapter(adapterType).includes("sandbox") ? [] : [];
  }

  async function resolveCompanyIdForAgentReference(req: Request): Promise<string | null> {
    const companyIdQuery = req.query.companyId;
    const requestedCompanyId =
      typeof companyIdQuery === "string" && companyIdQuery.trim().length > 0
        ? companyIdQuery.trim()
        : null;
    if (requestedCompanyId) {
      assertCompanyAccess(req, requestedCompanyId);
      return requestedCompanyId;
    }
    if (req.actor.type === "agent" && req.actor.companyId) {
      return req.actor.companyId;
    }
    return null;
  }

  async function normalizeAgentReference(req: Request, rawId: string): Promise<string> {
    const raw = rawId.trim();
    if (isUuidLike(raw)) return raw;

    const companyId = await resolveCompanyIdForAgentReference(req);
    if (!companyId) {
      throw unprocessable("Agent shortname lookup requires companyId query parameter");
    }

    const resolved = await svc.resolveByReference(companyId, raw);
    if (resolved.ambiguous) {
      throw conflict("Agent shortname is ambiguous in this company. Use the agent ID.");
    }
    if (!resolved.agent) {
      throw notFound("Agent not found");
    }
    return resolved.agent.id;
  }

  function parseSourceIssueIds(input: {
    sourceIssueId?: string | null;
    sourceIssueIds?: string[];
  }): string[] {
    const values: string[] = [];
    if (Array.isArray(input.sourceIssueIds)) values.push(...input.sourceIssueIds);
    if (typeof input.sourceIssueId === "string" && input.sourceIssueId.length > 0) {
      values.push(input.sourceIssueId);
    }
    return Array.from(new Set(values));
  }

  function asRecord(value: unknown): Record<string, unknown> | null {
    if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
    return value as Record<string, unknown>;
  }

  function asNonEmptyString(value: unknown): string | null {
    if (typeof value !== "string") return null;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  function asEnvBindingString(value: unknown): string | null {
    const direct = asNonEmptyString(value);
    if (direct) return direct;
    const record = asRecord(value);
    if (record?.type !== "plain") return null;
    return asNonEmptyString(record.value);
  }

  function preserveInstructionsBundleConfig(
    existingAdapterConfig: Record<string, unknown>,
    nextAdapterConfig: Record<string, unknown>,
  ) {
    const nextKeys = new Set(Object.keys(nextAdapterConfig));
    if (KNOWN_INSTRUCTIONS_BUNDLE_KEYS.some((key) => nextKeys.has(key))) {
      return nextAdapterConfig;
    }

    const merged = { ...nextAdapterConfig };
    for (const key of KNOWN_INSTRUCTIONS_BUNDLE_KEYS) {
      if (merged[key] === undefined && existingAdapterConfig[key] !== undefined) {
        merged[key] = existingAdapterConfig[key];
      }
    }
    return merged;
  }

  function parseBooleanLike(value: unknown): boolean | null {
    if (typeof value === "boolean") return value;
    if (typeof value === "number") {
      if (value === 1) return true;
      if (value === 0) return false;
      return null;
    }
    if (typeof value !== "string") return null;
    const normalized = value.trim().toLowerCase();
    if (normalized === "true" || normalized === "1" || normalized === "yes" || normalized === "on") {
      return true;
    }
    if (normalized === "false" || normalized === "0" || normalized === "no" || normalized === "off") {
      return false;
    }
    return null;
  }

  function parseNumberLike(value: unknown): number | null {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value !== "string") return null;
    const parsed = Number(value.trim());
    return Number.isFinite(parsed) ? parsed : null;
  }

  function parseSchedulerHeartbeatPolicy(runtimeConfig: unknown) {
    const heartbeat = asRecord(asRecord(runtimeConfig)?.heartbeat) ?? {};
    return {
      enabled: parseBooleanLike(heartbeat.enabled) ?? false,
      intervalSec: Math.max(0, parseNumberLike(heartbeat.intervalSec) ?? 0),
    };
  }

  function normalizeNewAgentRuntimeConfig(runtimeConfig: unknown): Record<string, unknown> {
    const parsedRuntimeConfig = asRecord(runtimeConfig);
    const normalizedRuntimeConfig = parsedRuntimeConfig ? { ...parsedRuntimeConfig } : {};
    const parsedHeartbeat = asRecord(normalizedRuntimeConfig.heartbeat);
    const heartbeat = parsedHeartbeat ? { ...parsedHeartbeat } : {};

    if (parseBooleanLike(heartbeat.enabled) == null) {
      heartbeat.enabled = false;
    }
    if (parseNumberLike(heartbeat.maxConcurrentRuns) == null) {
      heartbeat.maxConcurrentRuns = AGENT_DEFAULT_MAX_CONCURRENT_RUNS;
    }

    normalizedRuntimeConfig.heartbeat = heartbeat;
    return normalizedRuntimeConfig;
  }

  function listRuntimeModelProfileAdapterConfigs(runtimeConfig: unknown): Array<{
    profileKey: string;
    profile: Record<string, unknown>;
    adapterConfig: Record<string, unknown>;
    path: string;
  }> {
    const runtimeRecord = asRecord(runtimeConfig);
    const modelProfiles = asRecord(runtimeRecord?.modelProfiles);
    if (!modelProfiles) return [];

    const entries: Array<{
      profileKey: string;
      profile: Record<string, unknown>;
      adapterConfig: Record<string, unknown>;
      path: string;
    }> = [];
    for (const [profileKey, rawProfile] of Object.entries(modelProfiles)) {
      const profile = asRecord(rawProfile);
      const adapterConfig = asRecord(profile?.adapterConfig);
      if (!profile || !adapterConfig) continue;
      entries.push({
        profileKey,
        profile,
        adapterConfig,
        path: `runtimeConfig.modelProfiles.${profileKey}.adapterConfig`,
      });
    }
    return entries;
  }

  function assertNoAgentRuntimeConfigAdapterConfigMutation(req: Request, runtimeConfig: unknown) {
    for (const entry of listRuntimeModelProfileAdapterConfigs(runtimeConfig)) {
      assertNoAgentAdapterConfigMutation(req, entry.adapterConfig, entry.path);
    }
  }

  async function normalizeMediatedAdapterConfigForPersistence(input: {
    companyId: string;
    adapterType: string | null | undefined;
    adapterConfig: Record<string, unknown>;
    constraintAdapterConfig?: Record<string, unknown>;
  }): Promise<Record<string, unknown>> {
    const normalizedAdapterConfig = await secretsSvc.normalizeAdapterConfigForPersistence(
      input.companyId,
      input.adapterConfig,
      { strictMode: strictSecretsMode },
    );
    await assertAdapterConfigConstraints(
      input.adapterType,
      input.constraintAdapterConfig
        ? { ...input.constraintAdapterConfig, ...normalizedAdapterConfig }
        : normalizedAdapterConfig,
    );
    return normalizedAdapterConfig;
  }

  async function normalizeRuntimeConfigAdapterConfigsForPersistence(
    companyId: string,
    adapterType: string,
    runtimeConfig: Record<string, unknown>,
    baseAdapterConfig: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const entries = listRuntimeModelProfileAdapterConfigs(runtimeConfig);
    if (entries.length === 0) return runtimeConfig;
    const adapterModelProfiles = await listAdapterModelProfiles(adapterType);

    const normalizedRuntimeConfig = { ...runtimeConfig };
    const modelProfiles = asRecord(runtimeConfig.modelProfiles) ?? {};
    const normalizedModelProfiles = { ...modelProfiles };
    normalizedRuntimeConfig.modelProfiles = normalizedModelProfiles;

    for (const entry of entries) {
      const adapterProfile = adapterModelProfiles.find((profile) => profile.key === entry.profileKey);
      const adapterDefaultConfig = asRecord(adapterProfile?.adapterConfig) ?? {};
      const normalizedAdapterConfig = await normalizeMediatedAdapterConfigForPersistence({
        companyId,
        adapterType,
        adapterConfig: entry.adapterConfig,
        constraintAdapterConfig: {
          ...baseAdapterConfig,
          ...adapterDefaultConfig,
        },
      });
      normalizedModelProfiles[entry.profileKey] = {
        ...entry.profile,
        adapterConfig: normalizedAdapterConfig,
      };
    }

    return normalizedRuntimeConfig;
  }

  function generateEd25519PrivateKeyPem(): string {
    const { privateKey } = generateKeyPairSync("ed25519");
    return privateKey.export({ type: "pkcs8", format: "pem" }).toString();
  }

  function ensureGatewayDeviceKey(
    adapterType: string | null | undefined,
    adapterConfig: Record<string, unknown>,
  ): Record<string, unknown> {
    if (adapterType !== "openclaw_gateway") return adapterConfig;
    const disableDeviceAuth = parseBooleanLike(adapterConfig.disableDeviceAuth) === true;
    if (disableDeviceAuth) return adapterConfig;
    if (asNonEmptyString(adapterConfig.devicePrivateKeyPem)) return adapterConfig;
    return { ...adapterConfig, devicePrivateKeyPem: generateEd25519PrivateKeyPem() };
  }

  function codexLocalAgentHome(companyId: string, agentId: string): string {
    const instanceRoot = resolvePaperclipInstanceRootForAdapter({
      homeDir: asNonEmptyString(process.env.PAPERCLIP_HOME) ?? undefined,
      instanceId: asNonEmptyString(process.env.PAPERCLIP_INSTANCE_ID) ?? undefined,
      env: process.env,
    });
    return path.resolve(instanceRoot, "companies", companyId, "agents", agentId, "codex-home");
  }

  function codexLocalEnvKeyConfigured(value: unknown): boolean {
    if (asEnvBindingString(value)) return true;
    const record = asRecord(value);
    return record?.type === "secret_ref" && typeof record.secretId === "string";
  }

  // codex_local agents inherit whatever Codex login is already on the device
  // (the host's ~/.codex or $CODEX_HOME) by default, so a fresh agent needs no
  // env overrides at all. We only carve out an isolated per-agent CODEX_HOME
  // when the agent sets its own OPENAI_API_KEY, so that key's api-key auth.json
  // does not collide with the shared company home other agents use for the host
  // login. Agents without a key share the host credentials.
  function applyCodexLocalKeyIsolation(
    companyId: string,
    agentId: string,
    adapterType: string | null | undefined,
    adapterConfig: Record<string, unknown>,
  ): Record<string, unknown> {
    if (adapterType !== "codex_local") return adapterConfig;
    const existingEnv = asRecord(adapterConfig.env);
    if (!existingEnv) return adapterConfig;
    if (!codexLocalEnvKeyConfigured(existingEnv.OPENAI_API_KEY)) return adapterConfig;
    if (codexLocalEnvKeyConfigured(existingEnv.CODEX_HOME)) return adapterConfig;
    return {
      ...adapterConfig,
      env: { ...existingEnv, CODEX_HOME: codexLocalAgentHome(companyId, agentId) },
    };
  }

  function applyCreateDefaultsByAdapterType(
    adapterType: string | null | undefined,
    adapterConfig: Record<string, unknown>,
  ): Record<string, unknown> {
    const next = { ...adapterConfig };
    if (adapterType === "acpx_local") {
      if (!asNonEmptyString(next.agent)) {
        next.agent = DEFAULT_ACPX_LOCAL_AGENT;
      }
      if (!asNonEmptyString(next.mode)) {
        next.mode = DEFAULT_ACPX_LOCAL_MODE;
      }
      if (!asNonEmptyString(next.permissionMode)) {
        next.permissionMode = DEFAULT_ACPX_LOCAL_PERMISSION_MODE;
      }
      if (!asNonEmptyString(next.nonInteractivePermissions)) {
        next.nonInteractivePermissions = DEFAULT_ACPX_LOCAL_NON_INTERACTIVE_PERMISSIONS;
      }
      return ensureGatewayDeviceKey(adapterType, next);
    }
    if (adapterType === "codex_local") {
      const hasBypassFlag =
        typeof next.dangerouslyBypassApprovalsAndSandbox === "boolean" ||
        typeof next.dangerouslyBypassSandbox === "boolean";
      if (!hasBypassFlag) {
        next.dangerouslyBypassApprovalsAndSandbox = DEFAULT_CODEX_LOCAL_BYPASS_APPROVALS_AND_SANDBOX;
      }
      return ensureGatewayDeviceKey(adapterType, next);
    }
    if (adapterType === "gemini_local" && !asNonEmptyString(next.model)) {
      next.model = DEFAULT_GEMINI_LOCAL_MODEL;
      return ensureGatewayDeviceKey(adapterType, next);
    }
    if (adapterType === "opencode_local" && !asNonEmptyString(next.model)) {
      next.model = DEFAULT_OPENCODE_LOCAL_MODEL;
      return ensureGatewayDeviceKey(adapterType, next);
    }
    if (adapterType === "cursor" && !asNonEmptyString(next.model)) {
      next.model = DEFAULT_CURSOR_LOCAL_MODEL;
    }
    return ensureGatewayDeviceKey(adapterType, next);
  }

  async function assertAdapterConfigConstraints(
    adapterType: string | null | undefined,
    adapterConfig: Record<string, unknown>,
  ) {
    if (adapterType !== "opencode_local") return;
    try {
      requireOpenCodeModelId(adapterConfig.model);
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      throw unprocessable(`Invalid opencode_local adapterConfig: ${reason}`);
    }
  }

  function resolveInstructionsFilePath(candidatePath: string, adapterConfig: Record<string, unknown>) {
    const trimmed = candidatePath.trim();
    if (path.isAbsolute(trimmed)) return trimmed;

    const cwd = asNonEmptyString(adapterConfig.cwd);
    if (!cwd) {
      throw unprocessable(
        "Relative instructions path requires adapterConfig.cwd to be set to an absolute path",
      );
    }
    if (!path.isAbsolute(cwd)) {
      throw unprocessable("adapterConfig.cwd must be an absolute path to resolve relative instructions path");
    }
    return path.resolve(cwd, trimmed);
  }

  async function materializeDefaultInstructionsBundleForNewAgent<T extends {
    id: string;
    companyId: string;
    name: string;
    role: string;
    adapterType: string;
    adapterConfig: unknown;
  }>(
    agent: T,
    input?: { files: Record<string, string>; entryFile?: string },
  ): Promise<T> {
    if (!adapterSupportsInstructionsBundle(agent.adapterType)) {
      return agent;
    }

    const adapterConfig = asRecord(agent.adapterConfig) ?? {};
    const hasExplicitInstructionsBundle =
      Boolean(asNonEmptyString(adapterConfig.instructionsBundleMode))
      || Boolean(asNonEmptyString(adapterConfig.instructionsRootPath))
      || Boolean(asNonEmptyString(adapterConfig.instructionsEntryFile))
      || Boolean(asNonEmptyString(adapterConfig.instructionsFilePath))
      || Boolean(asNonEmptyString(adapterConfig.agentsMdPath));
    if (hasExplicitInstructionsBundle) {
      const nextAdapterConfig = { ...adapterConfig };
      const hadLegacyPrompt =
        Object.prototype.hasOwnProperty.call(nextAdapterConfig, "promptTemplate")
        || Object.prototype.hasOwnProperty.call(nextAdapterConfig, "bootstrapPromptTemplate");
      delete nextAdapterConfig.promptTemplate;
      delete nextAdapterConfig.bootstrapPromptTemplate;
      if (!hadLegacyPrompt) return agent;

      const updated = await svc.update(agent.id, { adapterConfig: nextAdapterConfig });
      return (updated as T | null) ?? { ...agent, adapterConfig: nextAdapterConfig };
    }

    const files = input?.files
      ?? await loadDefaultAgentInstructionsBundle(resolveDefaultAgentInstructionsBundleRole(agent.role));
    const materialized = await instructions.materializeManagedBundle(
      agent,
      files,
      { entryFile: input?.entryFile ?? "AGENTS.md", replaceExisting: false },
    );
    const nextAdapterConfig = { ...materialized.adapterConfig };
    delete nextAdapterConfig.promptTemplate;
    delete nextAdapterConfig.bootstrapPromptTemplate;

    const updated = await svc.update(agent.id, { adapterConfig: nextAdapterConfig });
    return (updated as T | null) ?? { ...agent, adapterConfig: nextAdapterConfig };
  }

  function assertNoNewAgentLegacyPromptTemplate(adapterType: string, adapterConfig: Record<string, unknown>) {
    if (!adapterSupportsInstructionsBundle(adapterType)) return;
    if (
      Object.prototype.hasOwnProperty.call(adapterConfig, "promptTemplate")
      || Object.prototype.hasOwnProperty.call(adapterConfig, "bootstrapPromptTemplate")
    ) {
      throw unprocessable(
        "New agents must use instructionsBundle/AGENTS.md instead of adapterConfig.promptTemplate or bootstrapPromptTemplate",
      );
    }
  }

  async function assertCanManageInstructionsPath(req: Request, targetAgent: { id: string; companyId: string }) {
    assertCompanyAccess(req, targetAgent.companyId);
    if (req.actor.type !== "board") {
      throw forbidden(
        "Only board-authenticated callers can manage instructions path or bundle configuration",
      );
    }
    await assertBoardCanManageAgentsForCompany(req, targetAgent.companyId);
  }

  function assertNoAgentInstructionsConfigMutation(
    req: Request,
    adapterConfig: Record<string, unknown> | null | undefined,
    path = "adapterConfig",
  ) {
    if (req.actor.type !== "agent" || !adapterConfig) return;
    const changedSensitiveKeys = KNOWN_INSTRUCTIONS_BUNDLE_KEYS
      .filter((key) => adapterConfig[key] !== undefined)
      .map((key) => `${path}.${key}`);
    if (changedSensitiveKeys.length === 0) return;
    throw forbidden(
      `Agent-authenticated callers cannot modify instructions path or bundle configuration (${changedSensitiveKeys.join(", ")})`,
    );
  }

  function adapterConfigTouchesInstructionsConfig(adapterConfig: Record<string, unknown>) {
    return KNOWN_INSTRUCTIONS_BUNDLE_KEYS.some((key) => adapterConfig[key] !== undefined);
  }

  function assertNoAgentAdapterConfigMutation(
    req: Request,
    adapterConfig: Record<string, unknown>,
    path = "adapterConfig",
  ) {
    assertNoAgentInstructionsConfigMutation(req, adapterConfig, path);
    assertNoAgentHostWorkspaceCommandMutation(
      req,
      collectAgentAdapterWorkspaceCommandPaths(adapterConfig, path),
    );
  }

  function summarizeAgentUpdateDetails(patch: Record<string, unknown>) {
    const changedTopLevelKeys = Object.keys(patch).sort();
    const details: Record<string, unknown> = { changedTopLevelKeys };

    const adapterConfigPatch = asRecord(patch.adapterConfig);
    if (adapterConfigPatch) {
      details.changedAdapterConfigKeys = Object.keys(adapterConfigPatch).sort();
    }

    const runtimeConfigPatch = asRecord(patch.runtimeConfig);
    if (runtimeConfigPatch) {
      details.changedRuntimeConfigKeys = Object.keys(runtimeConfigPatch).sort();
    }

    return details;
  }

  function buildUnsupportedSkillSnapshot(
    adapterType: string,
    desiredSkillEntries: AgentDesiredSkillEntry[] = [],
  ): AgentSkillSnapshot {
    const desiredSkills = desiredSkillEntries.map((entry) => entry.key);
    return {
      adapterType,
      supported: false,
      mode: "unsupported",
      desiredSkills,
      desiredSkillEntries,
      entries: [],
      warnings: ["This adapter does not implement skill sync yet."],
    };
  }

  function normalizeDesiredSkillSelections(
    requestedDesiredSkills: Array<string | AgentDesiredSkillEntry> | undefined,
  ): AgentDesiredSkillEntry[] | undefined {
    if (!requestedDesiredSkills) return undefined;
    const out = new Map<string, AgentDesiredSkillEntry>();
    for (const value of requestedDesiredSkills) {
      const entry = typeof value === "string"
        ? { key: value.trim(), versionId: null }
        : { key: value.key.trim(), versionId: value.versionId ?? null };
      if (!entry.key || out.has(entry.key)) continue;
      out.set(entry.key, entry);
    }
    return Array.from(out.values());
  }

  // Legacy hardcoded set — used as fallback when adapter module does not
  // declare requiresMaterializedRuntimeSkills explicitly.
  const LEGACY_MATERIALIZED_SKILLS_SET = new Set([
    "cursor",
    "gemini_local",
    "opencode_local",
    "pi_local",
  ]);

  function shouldMaterializeRuntimeSkillsForAdapter(adapterType: string) {
    const adapter = findActiveServerAdapter(adapterType);
    if (adapter?.requiresMaterializedRuntimeSkills !== undefined) {
      return adapter.requiresMaterializedRuntimeSkills;
    }
    return LEGACY_MATERIALIZED_SKILLS_SET.has(adapterType);
  }

  async function buildRuntimeSkillConfig(
    companyId: string,
    adapterType: string,
    config: Record<string, unknown>,
    options: {
      materializeMissing?: boolean;
    } = {},
  ) {
    const preference = readPaperclipSkillSyncPreference(config);
    const runtimeSkillEntries = await companySkills.listRuntimeSkillEntries(companyId, {
      materializeMissing: options.materializeMissing
        ?? shouldMaterializeRuntimeSkillsForAdapter(adapterType),
      versionSelections: skillVersionSelectionMap(preference.desiredSkillEntries),
    });
    return {
      ...config,
      paperclipRuntimeSkills: runtimeSkillEntries,
    };
  }

  async function resolveDesiredSkillAssignment(
    companyId: string,
    adapterType: string,
    adapterConfig: Record<string, unknown>,
    requestedDesiredSkills: AgentDesiredSkillEntry[] | undefined,
  ) {
    if (!requestedDesiredSkills) {
      return {
        adapterConfig,
        desiredSkills: null as string[] | null,
        desiredSkillEntries: null as AgentDesiredSkillEntry[] | null,
        runtimeSkillEntries: null as Awaited<ReturnType<typeof companySkills.listRuntimeSkillEntries>> | null,
      };
    }

    const resolvedRequestedSkillEntries = await companySkills.resolveRequestedSkillEntries(
      companyId,
      requestedDesiredSkills,
    );
    const runtimeSkillEntries = await companySkills.listRuntimeSkillEntries(companyId, {
      materializeMissing: shouldMaterializeRuntimeSkillsForAdapter(adapterType),
      versionSelections: skillVersionSelectionMap(resolvedRequestedSkillEntries),
    });
    const desiredSkillEntries = resolvedRequestedSkillEntries.filter(
      (entry, index, entries) => entries.findIndex((candidate) => candidate.key === entry.key) === index,
    );
    const desiredSkills = desiredSkillEntries.map((entry) => entry.key);

    return {
      adapterConfig: writePaperclipSkillSyncPreference(adapterConfig, desiredSkillEntries),
      desiredSkills,
      desiredSkillEntries,
      runtimeSkillEntries,
    };
  }

  function redactForRestrictedAgentView(agent: Awaited<ReturnType<typeof svc.getById>>) {
    if (!agent) return null;
    return {
      ...agent,
      adapterConfig: {},
      runtimeConfig: {},
    };
  }

  function redactAgentConfiguration(agent: Awaited<ReturnType<typeof svc.getById>>) {
    if (!agent) return null;
    return {
      id: agent.id,
      companyId: agent.companyId,
      name: agent.name,
      role: agent.role,
      title: agent.title,
      status: agent.status,
      reportsTo: agent.reportsTo,
      adapterType: agent.adapterType,
      adapterConfig: redactEventPayload(agent.adapterConfig),
      runtimeConfig: redactEventPayload(agent.runtimeConfig),
      permissions: agent.permissions,
      updatedAt: agent.updatedAt,
    };
  }

  function redactRevisionSnapshot(snapshot: unknown): Record<string, unknown> {
    if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) return {};
    const record = snapshot as Record<string, unknown>;
    return {
      ...record,
      adapterConfig: redactEventPayload(
        typeof record.adapterConfig === "object" && record.adapterConfig !== null
          ? (record.adapterConfig as Record<string, unknown>)
          : {},
      ),
      runtimeConfig: redactEventPayload(
        typeof record.runtimeConfig === "object" && record.runtimeConfig !== null
          ? (record.runtimeConfig as Record<string, unknown>)
          : {},
      ),
      metadata:
        typeof record.metadata === "object" && record.metadata !== null
          ? redactEventPayload(record.metadata as Record<string, unknown>)
          : record.metadata ?? null,
    };
  }

  function redactConfigRevision(
    revision: Record<string, unknown> & { beforeConfig: unknown; afterConfig: unknown },
  ) {
    return {
      ...revision,
      beforeConfig: redactRevisionSnapshot(revision.beforeConfig),
      afterConfig: redactRevisionSnapshot(revision.afterConfig),
    };
  }

  function toLeanOrgNode(node: Record<string, unknown>): Record<string, unknown> {
    const reports = Array.isArray(node.reports)
      ? (node.reports as Array<Record<string, unknown>>).map((report) => toLeanOrgNode(report))
      : [];
    return {
      id: String(node.id),
      name: String(node.name),
      role: String(node.role),
      status: String(node.status),
      reports,
    };
  }

  router.param("id", async (req, _res, next, rawId) => {
    try {
      req.params.id = await normalizeAgentReference(req, String(rawId));
      next();
    } catch (err) {
      next(err);
    }
  });

  router.get("/companies/:companyId/adapters/:type/models", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const type = assertKnownAdapterType(req.params.type as string);
    const refresh = typeof req.query.refresh === "string"
      ? ["1", "true", "yes"].includes(req.query.refresh.toLowerCase())
      : false;
    const environmentId = asNonEmptyString(req.query.environmentId);
    const environment = environmentId ? await environmentsSvc.getById(environmentId) : null;
    if (environmentId && !environment) {
      res.status(404).json({ error: "Environment not found" });
      return;
    }
    if (type === "opencode_local" && environment && environment.driver !== "local") {
      const adapter = requireServerAdapter(type);
      res.json(adapter.models ?? []);
      return;
    }
    const models = refresh
      ? await refreshAdapterModels(type)
      : await listAdapterModels(type);
    res.json(models);
  });

  router.get("/companies/:companyId/adapters/:type/model-profiles", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const type = assertKnownAdapterType(req.params.type as string);
    const profiles = await listAdapterModelProfiles(type);
    res.json(profiles);
  });

  router.get("/companies/:companyId/adapters/:type/detect-model", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const type = assertKnownAdapterType(req.params.type as string);

    const detected = await detectAdapterModel(type);
    res.json(detected);
  });

  // Hermes/agent presence telemetry. The agent runtime reports its own
  // reachability (online/offline/busy); the event is broadcast to the company
  // live-event stream as `agent.presence` for UI/simulation subscribers.
  router.post("/companies/:companyId/agents/:agentId/presence", async (req, res) => {
    const companyId = req.params.companyId as string;
    const agentId = req.params.agentId as string;
    assertCompanyAccess(req, companyId);

    const agent = await svc.getById(agentId);
    if (!agent || agent.companyId !== companyId) {
      res.status(404).json({ error: "Agent not found" });
      return;
    }

    const state =
      typeof req.body?.state === "string" && ["online", "offline", "busy"].includes(req.body.state)
        ? req.body.state
        : "online";
    const detail =
      typeof req.body?.detail === "string" && req.body.detail.trim().length > 0
        ? req.body.detail.trim().slice(0, 500)
        : null;

    publishLiveEvent({
      companyId,
      type: "agent.presence",
      payload: {
        agentId,
        state,
        ...(detail ? { detail } : {}),
        reportedAt: new Date().toISOString(),
      },
    });

    res.json({ ok: true, agentId, state });
  });

  router.post(
    "/companies/:companyId/adapters/:type/test-environment",
    validate(testAdapterEnvironmentSchema),
    async (req, res) => {
      const companyId = req.params.companyId as string;
      const type = assertKnownAdapterType(req.params.type as string);
      await assertCanCreateAgentsForCompany(req, companyId);

      const adapter = requireServerAdapter(type);

      const inputAdapterConfig =
        (req.body?.adapterConfig ?? {}) as Record<string, unknown>;
      const requestedEnvironmentId =
        typeof req.body?.environmentId === "string" && req.body.environmentId.trim().length > 0
          ? (req.body.environmentId as string)
          : null;
      const normalizedAdapterConfig = await secretsSvc.normalizeAdapterConfigForPersistence(
        companyId,
        inputAdapterConfig,
        { strictMode: strictSecretsMode },
      );
      const { config: runtimeAdapterConfig } = await secretsSvc.resolveAdapterConfigForRuntime(
        companyId,
        normalizedAdapterConfig,
      );

      const { executionTarget, environmentName, fallbackChecks, release } =
        await resolveAdapterTestExecutionContext({
          companyId,
          adapterType: type,
          environmentId: requestedEnvironmentId,
        });

      let releaseStatus: "released" | "failed" = "released";
      try {
        // If the caller explicitly selected an environment, never fall back to
        // probing the host when we couldn't resolve that environment's
        // execution target. Surface the diagnostic checks instead.
        if (requestedEnvironmentId && !executionTarget && fallbackChecks.length > 0) {
          const status: AdapterEnvironmentTestResult["status"] = fallbackChecks.some((c) => c.level === "error")
            ? "fail"
            : fallbackChecks.some((c) => c.level === "warn")
              ? "warn"
              : "pass";
          if (status === "fail") releaseStatus = "failed";
          const synthesized: AdapterEnvironmentTestResult = {
            adapterType: type,
            status,
            checks: fallbackChecks,
            testedAt: new Date().toISOString(),
          };
          res.json(synthesized);
          return;
        }

        const result = await adapter.testEnvironment({
          companyId,
          adapterType: type,
          config: runtimeAdapterConfig,
          executionTarget,
          environmentName,
        });

        if (result.status === "fail") releaseStatus = "failed";
        res.json(result);
      } catch (err) {
        releaseStatus = "failed";
        throw err;
      } finally {
        await release(releaseStatus);
      }
    },
  );

  router.get("/agents/:id/skills", async (req, res) => {
    const id = req.params.id as string;
    const agent = await svc.getById(id);
    if (!agent) {
      res.status(404).json({ error: "Agent not found" });
      return;
    }
    await assertCanReadConfigurations(req, agent.companyId);

    const adapter = findActiveServerAdapter(agent.adapterType);
    if (!adapter?.listSkills) {
      const preference = readPaperclipSkillSyncPreference(
        agent.adapterConfig as Record<string, unknown>,
      );
      const desiredSkillEntries = preference.desiredSkillEntries.filter(
        (entry, index, entries) => entries.findIndex((candidate) => candidate.key === entry.key) === index,
      );
      res.json(buildUnsupportedSkillSnapshot(agent.adapterType, desiredSkillEntries));
      return;
    }

    const { config: runtimeConfig } = await secretsSvc.resolveAdapterConfigForRuntime(
      agent.companyId,
      agent.adapterConfig,
    );
    const runtimeSkillConfig = await buildRuntimeSkillConfig(
      agent.companyId,
      agent.adapterType,
      runtimeConfig,
      { materializeMissing: false },
    );
    const snapshot = await adapter.listSkills({
      agentId: agent.id,
      companyId: agent.companyId,
      adapterType: agent.adapterType,
      config: runtimeSkillConfig,
    });
    res.json(snapshot);
  });

  router.post(
    "/agents/:id/skills/sync",
    validate(agentSkillSyncSchema),
    async (req, res) => {
      const id = req.params.id as string;
      const agent = await svc.getById(id);
      if (!agent) {
        res.status(404).json({ error: "Agent not found" });
        return;
      }
      await assertCanUpdateAgent(req, agent);

      const requestedSkills = normalizeDesiredSkillSelections(req.body.desiredSkills);
      const {
        adapterConfig: nextAdapterConfig,
        desiredSkills,
        desiredSkillEntries,
        runtimeSkillEntries,
      } = await resolveDesiredSkillAssignment(
        agent.companyId,
        agent.adapterType,
        agent.adapterConfig as Record<string, unknown>,
        requestedSkills,
      );
      if (!desiredSkills || !desiredSkillEntries || !runtimeSkillEntries) {
        throw unprocessable("Skill sync requires desiredSkills.");
      }
      const actor = getActorInfo(req);
      const updated = await svc.update(agent.id, {
        adapterConfig: nextAdapterConfig,
      }, {
        recordRevision: {
          createdByAgentId: actor.agentId,
          createdByUserId: actor.actorType === "user" ? actor.actorId : null,
          source: "skill-sync",
        },
      });
      if (!updated) {
        res.status(404).json({ error: "Agent not found" });
        return;
      }

      const adapter = findActiveServerAdapter(updated.adapterType);
      const { config: runtimeConfig } = await secretsSvc.resolveAdapterConfigForRuntime(
        updated.companyId,
        updated.adapterConfig,
      );
      const runtimeSkillConfig = {
        ...runtimeConfig,
        paperclipRuntimeSkills: runtimeSkillEntries,
      };
      const snapshot = adapter?.syncSkills
        ? await adapter.syncSkills({
            agentId: updated.id,
            companyId: updated.companyId,
            adapterType: updated.adapterType,
            config: runtimeSkillConfig,
          }, desiredSkills)
        : adapter?.listSkills
          ? await adapter.listSkills({
              agentId: updated.id,
              companyId: updated.companyId,
              adapterType: updated.adapterType,
              config: runtimeSkillConfig,
            })
          : buildUnsupportedSkillSnapshot(updated.adapterType, desiredSkillEntries);

      await logActivity(db, {
        companyId: updated.companyId,
        actorType: actor.actorType,
        actorId: actor.actorId,
        action: "agent.skills_synced",
        entityType: "agent",
        entityId: updated.id,
        agentId: actor.agentId,
        runId: actor.runId,
        details: {
          adapterType: updated.adapterType,
          desiredSkills,
          desiredSkillEntries,
          mode: snapshot.mode,
          supported: snapshot.supported,
          entryCount: snapshot.entries.length,
          warningCount: snapshot.warnings.length,
        },
      });

      res.json(snapshot);
    },
  );

  router.get("/companies/:companyId/agents", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const unsupportedQueryParams = Object.keys(req.query).sort();
    if (unsupportedQueryParams.length > 0) {
      res.status(400).json({
        error: `Unsupported query parameter${unsupportedQueryParams.length === 1 ? "" : "s"}: ${unsupportedQueryParams.join(", ")}`,
      });
      return;
    }
    const result = await filterAgentsForActor(req, await svc.list(companyId));
    const canReadConfigs = await actorCanReadConfigurationsForCompany(req, companyId);
    if (canReadConfigs) {
      res.json(result);
      return;
    }
    res.json(result.map((agent) => redactForRestrictedAgentView(agent)));
  });

  router.get("/instance/scheduler-heartbeats", async (req, res) => {
    assertInstanceAdmin(req);

    const rows = await db
      .select({
        id: agentsTable.id,
        companyId: agentsTable.companyId,
        agentName: agentsTable.name,
        role: agentsTable.role,
        title: agentsTable.title,
        status: agentsTable.status,
        adapterType: agentsTable.adapterType,
        runtimeConfig: agentsTable.runtimeConfig,
        lastHeartbeatAt: agentsTable.lastHeartbeatAt,
        companyName: companies.name,
        companyIssuePrefix: companies.issuePrefix,
      })
      .from(agentsTable)
      .innerJoin(companies, eq(agentsTable.companyId, companies.id))
      .orderBy(companies.name, agentsTable.name);

    const items: InstanceSchedulerHeartbeatAgent[] = rows
      .map((row) => {
        const policy = parseSchedulerHeartbeatPolicy(row.runtimeConfig);
        const statusEligible =
          row.status !== "paused" &&
          row.status !== "terminated" &&
          row.status !== "pending_approval";

        return {
          id: row.id,
          companyId: row.companyId,
          companyName: row.companyName,
          companyIssuePrefix: row.companyIssuePrefix,
          agentName: row.agentName,
          agentUrlKey: deriveAgentUrlKey(row.agentName, row.id),
          role: row.role as InstanceSchedulerHeartbeatAgent["role"],
          title: row.title,
          status: row.status as InstanceSchedulerHeartbeatAgent["status"],
          adapterType: row.adapterType,
          intervalSec: policy.intervalSec,
          heartbeatEnabled: policy.enabled,
          schedulerActive: statusEligible && policy.enabled && policy.intervalSec > 0,
          lastHeartbeatAt: row.lastHeartbeatAt,
        };
      })
      .filter((item) =>
        item.status !== "paused" &&
        item.status !== "terminated" &&
        item.status !== "pending_approval",
      )
      .sort((left, right) => {
        if (left.schedulerActive !== right.schedulerActive) {
          return left.schedulerActive ? -1 : 1;
        }
        const companyOrder = left.companyName.localeCompare(right.companyName);
        if (companyOrder !== 0) return companyOrder;
        return left.agentName.localeCompare(right.agentName);
      });

    res.json(items);
  });

  router.get("/companies/:companyId/org", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const tree = await filterAgentsForActor(req, await svc.orgForCompany(companyId), companyId);
    const leanTree = tree.map((node) => toLeanOrgNode(node as Record<string, unknown>));
    res.json(leanTree);
  });

  router.get("/companies/:companyId/org.svg", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const style = (ORG_CHART_STYLES.includes(req.query.style as OrgChartStyle) ? req.query.style : "warmth") as OrgChartStyle;
    const tree = await filterAgentsForActor(req, await svc.orgForCompany(companyId), companyId);
    const leanTree = tree.map((node) => toLeanOrgNode(node as Record<string, unknown>));
    const svg = renderOrgChartSvg(leanTree as unknown as OrgNode[], style);
    res.setHeader("Content-Type", "image/svg+xml");
    res.setHeader("Cache-Control", "no-cache");
    res.send(svg);
  });

  router.get("/companies/:companyId/org.png", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const style = (ORG_CHART_STYLES.includes(req.query.style as OrgChartStyle) ? req.query.style : "warmth") as OrgChartStyle;
    const tree = await filterAgentsForActor(req, await svc.orgForCompany(companyId), companyId);
    const leanTree = tree.map((node) => toLeanOrgNode(node as Record<string, unknown>));
    const png = await renderOrgChartPng(leanTree as unknown as OrgNode[], style);
    res.setHeader("Content-Type", "image/png");
    res.setHeader("Cache-Control", "no-cache");
    res.send(png);
  });

  router.get("/companies/:companyId/agent-configurations", async (req, res) => {
    const companyId = req.params.companyId as string;
    await assertCanReadConfigurations(req, companyId);
    const rows = await svc.list(companyId);
    res.json(rows.map((row) => redactAgentConfiguration(row)));
  });

  router.get("/agents/me", async (req, res) => {
    if (req.actor.type !== "agent" || !req.actor.agentId) {
      res.status(401).json({ error: "Agent authentication required" });
      return;
    }
    const agent = await svc.getById(req.actor.agentId);
    if (!agent) {
      res.status(404).json({ error: "Agent not found" });
      return;
    }
    const trustPreset = await resolveAgentSelfTrustPreset(req, agent);
    if (trustPreset.kind === "denied") {
      res.status(403).json({ error: trustPreset.detail });
      return;
    }
    if (trustPreset.kind === "low_trust_review") {
      res.json(buildLowTrustSelfView(agent));
      return;
    }
    res.json(await buildAgentDetail(agent));
  });

  router.get("/agents/me/inbox-lite", async (req, res) => {
    if (req.actor.type !== "agent" || !req.actor.agentId || !req.actor.companyId) {
      res.status(401).json({ error: "Agent authentication required" });
      return;
    }

    const issuesSvc = issueService(db);
    const recoveryActionsSvc = issueRecoveryActionService(db);
    const rows = await issuesSvc.list(req.actor.companyId, {
      assigneeAgentId: req.actor.agentId,
      status: "todo,in_progress,blocked",
      includeRoutineExecutions: true,
      limit: ISSUE_LIST_DEFAULT_LIMIT,
    });
    const issueIds = rows.map((issue) => issue.id);
    const [dependencyReadiness, recoveryActionByIssue] = await Promise.all([
      issuesSvc.listDependencyReadiness(req.actor.companyId, issueIds),
      recoveryActionsSvc.listActiveForIssues(req.actor.companyId, issueIds),
    ]);

    res.json(
      rows.map((issue) => ({
        id: issue.id,
        identifier: issue.identifier,
        title: issue.title,
        status: issue.status,
        priority: issue.priority,
        projectId: issue.projectId,
        goalId: issue.goalId,
        parentId: issue.parentId,
        updatedAt: issue.updatedAt,
        activeRun: issue.activeRun,
        activeRecoveryAction: recoveryActionByIssue.get(issue.id) ?? null,
        dependencyReady: dependencyReadiness.get(issue.id)?.isDependencyReady ?? true,
        unresolvedBlockerCount: dependencyReadiness.get(issue.id)?.unresolvedBlockerCount ?? 0,
        unresolvedBlockerIssueIds: dependencyReadiness.get(issue.id)?.unresolvedBlockerIssueIds ?? [],
      })),
    );
  });

  router.get("/agents/me/inbox/mine", async (req, res) => {
    if (req.actor.type !== "agent" || !req.actor.agentId || !req.actor.companyId) {
      res.status(401).json({ error: "Agent authentication required" });
      return;
    }

    const query = agentMineInboxQuerySchema.parse(req.query);
    const issuesSvc = issueService(db);
    const rows = await issuesSvc.list(req.actor.companyId, {
      touchedByUserId: query.userId,
      inboxArchivedByUserId: query.userId,
      status: query.status,
      limit: ISSUE_LIST_DEFAULT_LIMIT,
    });

    res.json(rows);
  });

  router.get("/agents/:id", async (req, res) => {
    const id = req.params.id as string;
    const agent = await svc.getById(id);
    if (!agent) {
      res.status(404).json({ error: "Agent not found" });
      return;
    }
    assertCompanyAccess(req, agent.companyId);
    if (!(await assertAgentReadAllowed(req, res, agent))) return;
    const isSelf = req.actor.type === "agent" && req.actor.agentId === id;
    if (isSelf) {
      const trustPreset = await resolveAgentSelfTrustPreset(req, agent);
      if (trustPreset.kind === "denied") {
        res.status(403).json({ error: trustPreset.detail });
        return;
      }
      if (trustPreset.kind === "low_trust_review") {
        res.json(buildLowTrustSelfView(agent));
        return;
      }
    }
    const canReadSensitiveDetail = isSelf
      ? true
      : await actorCanReadConfigurationsForCompany(req, agent.companyId);
    if (!canReadSensitiveDetail) {
      res.json(await buildAgentDetail(agent, { restricted: true }));
      return;
    }
    res.json(await buildAgentDetail(agent));
  });

  router.get("/agents/:id/configuration", async (req, res) => {
    const id = req.params.id as string;
    const agent = await svc.getById(id);
    if (!agent) {
      res.status(404).json({ error: "Agent not found" });
      return;
    }
    await assertCanReadConfigurations(req, agent.companyId);
    res.json(redactAgentConfiguration(agent));
  });

  router.get("/agents/:id/config-revisions", async (req, res) => {
    const id = req.params.id as string;
    const agent = await svc.getById(id);
    if (!agent) {
      res.status(404).json({ error: "Agent not found" });
      return;
    }
    await assertCanReadConfigurations(req, agent.companyId);
    const revisions = await svc.listConfigRevisions(id);
    res.json(revisions.map((revision) => redactConfigRevision(revision)));
  });

  router.get("/agents/:id/config-revisions/:revisionId", async (req, res) => {
    const id = req.params.id as string;
    const revisionId = req.params.revisionId as string;
    const agent = await svc.getById(id);
    if (!agent) {
      res.status(404).json({ error: "Agent not found" });
      return;
    }
    await assertCanReadConfigurations(req, agent.companyId);
    const revision = await svc.getConfigRevision(id, revisionId);
    if (!revision) {
      res.status(404).json({ error: "Revision not found" });
      return;
    }
    res.json(redactConfigRevision(revision));
  });

  router.post("/agents/:id/config-revisions/:revisionId/rollback", async (req, res) => {
    const id = req.params.id as string;
    const revisionId = req.params.revisionId as string;
    const existing = await svc.getById(id);
    if (!existing) {
      res.status(404).json({ error: "Agent not found" });
      return;
    }
    await assertCanUpdateAgent(req, existing);

    const actor = getActorInfo(req);
    const updated = await svc.rollbackConfigRevision(id, revisionId, {
      agentId: actor.agentId,
      userId: actor.actorType === "user" ? actor.actorId : null,
    });
    if (!updated) {
      res.status(404).json({ error: "Revision not found" });
      return;
    }

    await logActivity(db, {
      companyId: updated.companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      runId: actor.runId,
      action: "agent.config_rolled_back",
      entityType: "agent",
      entityId: updated.id,
      details: { revisionId },
    });

    res.json(updated);
  });

  router.get("/agents/:id/runtime-state", async (req, res) => {
    assertBoard(req);
    const id = req.params.id as string;
    const agent = await svc.getById(id);
    if (!agent) {
      res.status(404).json({ error: "Agent not found" });
      return;
    }
    await assertBoardCanManageAgentsForCompany(req, agent.companyId);
    assertCompanyAccess(req, agent.companyId);

    const state = await heartbeat.getRuntimeState(id);
    res.json(state);
  });

  router.get("/agents/:id/task-sessions", async (req, res) => {
    assertBoard(req);
    const id = req.params.id as string;
    const agent = await svc.getById(id);
    if (!agent) {
      res.status(404).json({ error: "Agent not found" });
      return;
    }
    await assertBoardCanManageAgentsForCompany(req, agent.companyId);
    assertCompanyAccess(req, agent.companyId);

    const sessions = await heartbeat.listTaskSessions(id);
    res.json(
      sessions.map((session) => ({
        ...session,
        sessionParamsJson: redactEventPayload(session.sessionParamsJson ?? null),
      })),
    );
  });

  router.post("/agents/:id/runtime-state/reset-session", validate(resetAgentSessionSchema), async (req, res) => {
    assertBoard(req);
    const id = req.params.id as string;
    const agent = await svc.getById(id);
    if (!agent) {
      res.status(404).json({ error: "Agent not found" });
      return;
    }
    await assertBoardCanManageAgentsForCompany(req, agent.companyId);
    assertCompanyAccess(req, agent.companyId);

    const taskKey =
      typeof req.body.taskKey === "string" && req.body.taskKey.trim().length > 0
        ? req.body.taskKey.trim()
        : null;
    const state = await heartbeat.resetRuntimeSession(id, { taskKey });

    await logActivity(db, {
      companyId: agent.companyId,
      actorType: "user",
      actorId: req.actor.userId ?? "board",
      action: "agent.runtime_session_reset",
      entityType: "agent",
      entityId: id,
      details: { taskKey: taskKey ?? null },
    });

    res.json(state);
  });

  router.post("/companies/:companyId/agent-hires", validate(createAgentHireSchema), async (req, res) => {
    const companyId = req.params.companyId as string;
    await assertCanCreateAgentsForCompany(req, companyId);
    const sourceIssueIds = parseSourceIssueIds(req.body);
    const {
      desiredSkills: requestedDesiredSkills,
      instructionsBundle,
      sourceIssueId: _sourceIssueId,
      sourceIssueIds: _sourceIssueIds,
      ...hireInput
    } = req.body;
    hireInput.adapterType = assertKnownAdapterType(hireInput.adapterType);
    const rawHireAdapterConfig = (hireInput.adapterConfig ?? {}) as Record<string, unknown>;
    assertNoNewAgentLegacyPromptTemplate(
      hireInput.adapterType,
      rawHireAdapterConfig,
    );
    assertNoAgentAdapterConfigMutation(req, rawHireAdapterConfig);
    assertNoAgentRuntimeConfigAdapterConfigMutation(req, hireInput.runtimeConfig);
    const hiredAgentId = randomUUID();
    const requestedAdapterConfig = applyCodexLocalKeyIsolation(
      companyId,
      hiredAgentId,
      hireInput.adapterType,
      applyCreateDefaultsByAdapterType(
        hireInput.adapterType,
        rawHireAdapterConfig,
      ),
    );
    const desiredSkillAssignment = await resolveDesiredSkillAssignment(
      companyId,
      hireInput.adapterType,
      requestedAdapterConfig,
      normalizeDesiredSkillSelections(Array.isArray(requestedDesiredSkills) ? requestedDesiredSkills : undefined),
    );
    const normalizedAdapterConfig = await normalizeMediatedAdapterConfigForPersistence({
      companyId,
      adapterType: hireInput.adapterType,
      adapterConfig: desiredSkillAssignment.adapterConfig,
    });
    const normalizedRuntimeConfig = await normalizeRuntimeConfigAdapterConfigsForPersistence(
      companyId,
      hireInput.adapterType,
      normalizeNewAgentRuntimeConfig(hireInput.runtimeConfig),
      normalizedAdapterConfig,
    );
    const normalizedHireInput = {
      ...hireInput,
      adapterConfig: normalizedAdapterConfig,
      runtimeConfig: normalizedRuntimeConfig,
    };

    const company = await db
      .select()
      .from(companies)
      .where(eq(companies.id, companyId))
      .then((rows) => rows[0] ?? null);
    if (!company) {
      res.status(404).json({ error: "Company not found" });
      return;
    }

    const requiresApproval = company.requireBoardApprovalForNewAgents;
    const status = requiresApproval ? "pending_approval" : "idle";
    const createdAgent = await svc.create(companyId, {
      id: hiredAgentId,
      ...normalizedHireInput,
      status,
      spentMonthlyCents: 0,
      lastHeartbeatAt: null,
    });
    const agent = await materializeDefaultInstructionsBundleForNewAgent(createdAgent, instructionsBundle);

    let approval: Awaited<ReturnType<typeof approvalsSvc.getById>> | null = null;
    const actor = getActorInfo(req);

    if (requiresApproval) {
      const requestedAdapterType = normalizedHireInput.adapterType ?? agent.adapterType;
      const requestedAdapterConfig =
        redactEventPayload(
          (agent.adapterConfig ?? normalizedHireInput.adapterConfig) as Record<string, unknown>,
        ) ?? {};
      const requestedRuntimeConfig =
        redactEventPayload(
          (normalizedHireInput.runtimeConfig ?? agent.runtimeConfig) as Record<string, unknown>,
        ) ?? {};
      const requestedMetadata =
        redactEventPayload(
          ((normalizedHireInput.metadata ?? agent.metadata ?? {}) as Record<string, unknown>),
        ) ?? {};
      approval = await approvalsSvc.create(companyId, {
        type: "hire_agent",
        requestedByAgentId: actor.actorType === "agent" ? actor.actorId : null,
        requestedByUserId: actor.actorType === "user" ? actor.actorId : null,
        status: "pending",
        payload: {
          name: normalizedHireInput.name,
          role: normalizedHireInput.role,
          title: normalizedHireInput.title ?? null,
          icon: normalizedHireInput.icon ?? null,
          reportsTo: normalizedHireInput.reportsTo ?? null,
          capabilities: normalizedHireInput.capabilities ?? null,
          adapterType: requestedAdapterType,
          adapterConfig: requestedAdapterConfig,
          runtimeConfig: requestedRuntimeConfig,
          budgetMonthlyCents:
            typeof normalizedHireInput.budgetMonthlyCents === "number"
              ? normalizedHireInput.budgetMonthlyCents
              : agent.budgetMonthlyCents,
          desiredSkills: desiredSkillAssignment.desiredSkills,
          metadata: requestedMetadata,
          agentId: agent.id,
          requestedByAgentId: actor.actorType === "agent" ? actor.actorId : null,
          requestedConfigurationSnapshot: {
            adapterType: requestedAdapterType,
            adapterConfig: requestedAdapterConfig,
            runtimeConfig: requestedRuntimeConfig,
            desiredSkills: desiredSkillAssignment.desiredSkills,
          },
        },
        decisionNote: null,
        decidedByUserId: null,
        decidedAt: null,
        updatedAt: new Date(),
      });

      if (sourceIssueIds.length > 0) {
        await issueApprovalsSvc.linkManyForApproval(approval.id, sourceIssueIds, {
          agentId: actor.actorType === "agent" ? actor.actorId : null,
          userId: actor.actorType === "user" ? actor.actorId : null,
        });
      }
    }

    await logActivity(db, {
      companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      runId: actor.runId,
      action: "agent.hire_created",
      entityType: "agent",
      entityId: agent.id,
      details: {
        name: agent.name,
        role: agent.role,
        requiresApproval,
        approvalId: approval?.id ?? null,
        issueIds: sourceIssueIds,
        desiredSkills: desiredSkillAssignment.desiredSkills,
      },
    });
    const telemetryClient = getTelemetryClient();
    if (telemetryClient) {
      trackAgentCreated(telemetryClient, { agentRole: agent.role, agentId: agent.id });
    }

    await applyDefaultAgentTaskAssignGrant(
      companyId,
      agent.id,
      actor.actorType === "user" ? actor.actorId : null,
    );

    if (approval) {
      await logActivity(db, {
        companyId,
        actorType: actor.actorType,
        actorId: actor.actorId,
        agentId: actor.agentId,
        runId: actor.runId,
        action: "approval.created",
        entityType: "approval",
        entityId: approval.id,
        details: { type: approval.type, linkedAgentId: agent.id },
      });
    }

    res.status(201).json({ agent, approval });
  });

  router.post("/companies/:companyId/agents", validate(createAgentSchema), async (req, res) => {
    const companyId = req.params.companyId as string;
    await assertCanCreateAgentsForCompany(req, companyId);

    const company = await db
      .select()
      .from(companies)
      .where(eq(companies.id, companyId))
      .then((rows) => rows[0] ?? null);
    if (!company) {
      res.status(404).json({ error: "Company not found" });
      return;
    }
    if (company.requireBoardApprovalForNewAgents) {
      throw conflict(
        "Direct agent creation requires board approval. Use POST /api/companies/:companyId/agent-hires to create a pending hire approval.",
      );
    }

    const {
      desiredSkills: requestedDesiredSkills,
      instructionsBundle,
      ...createInput
    } = req.body;
    createInput.adapterType = assertKnownAdapterType(createInput.adapterType);
    const rawCreateAdapterConfig = (createInput.adapterConfig ?? {}) as Record<string, unknown>;
    assertNoNewAgentLegacyPromptTemplate(
      createInput.adapterType,
      rawCreateAdapterConfig,
    );
    assertNoAgentAdapterConfigMutation(req, rawCreateAdapterConfig);
    assertNoAgentRuntimeConfigAdapterConfigMutation(req, createInput.runtimeConfig);
    const agentId = randomUUID();
    const requestedAdapterConfig = applyCodexLocalKeyIsolation(
      companyId,
      agentId,
      createInput.adapterType,
      applyCreateDefaultsByAdapterType(
        createInput.adapterType,
        rawCreateAdapterConfig,
      ),
    );
    const desiredSkillAssignment = await resolveDesiredSkillAssignment(
      companyId,
      createInput.adapterType,
      requestedAdapterConfig,
      normalizeDesiredSkillSelections(Array.isArray(requestedDesiredSkills) ? requestedDesiredSkills : undefined),
    );
    const normalizedAdapterConfig = await normalizeMediatedAdapterConfigForPersistence({
      companyId,
      adapterType: createInput.adapterType,
      adapterConfig: desiredSkillAssignment.adapterConfig,
    });
    const normalizedRuntimeConfig = await normalizeRuntimeConfigAdapterConfigsForPersistence(
      companyId,
      createInput.adapterType,
      normalizeNewAgentRuntimeConfig(createInput.runtimeConfig),
      normalizedAdapterConfig,
    );
    await assertAgentEnvironmentSelection(companyId, createInput.adapterType, createInput.defaultEnvironmentId);
    await assertAgentDefaultEnvironmentSelection(companyId, createInput.defaultEnvironmentId, {
      allowedDrivers: allowedEnvironmentDriversForAgent(createInput.adapterType),
      allowedSandboxProviders: allowedSandboxProvidersForAgent(createInput.adapterType),
    });

    const createdAgent = await svc.create(companyId, {
      id: agentId,
      ...createInput,
      adapterConfig: normalizedAdapterConfig,
      runtimeConfig: normalizedRuntimeConfig,
      status: "idle",
      spentMonthlyCents: 0,
      lastHeartbeatAt: null,
    });
    const agent = await materializeDefaultInstructionsBundleForNewAgent(createdAgent, instructionsBundle);

    const actor = getActorInfo(req);
    await logActivity(db, {
      companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      runId: actor.runId,
      action: "agent.created",
      entityType: "agent",
      entityId: agent.id,
      details: {
        name: agent.name,
        role: agent.role,
        desiredSkills: desiredSkillAssignment.desiredSkills,
      },
    });
    const telemetryClient = getTelemetryClient();
    if (telemetryClient) {
      trackAgentCreated(telemetryClient, { agentRole: agent.role, agentId: agent.id });
    }

    await applyDefaultAgentTaskAssignGrant(
      companyId,
      agent.id,
      req.actor.type === "board" ? (req.actor.userId ?? null) : null,
    );

    if (agent.budgetMonthlyCents > 0) {
      await budgets.upsertPolicy(
        companyId,
        {
          scopeType: "agent",
          scopeId: agent.id,
          amount: agent.budgetMonthlyCents,
          windowKind: "calendar_month_utc",
        },
        actor.actorType === "user" ? actor.actorId : null,
      );
    }

    res.status(201).json(agent);
  });

  router.patch("/agents/:id/permissions", validate(updateAgentPermissionsSchema), async (req, res) => {
    const id = req.params.id as string;
    const existing = await svc.getById(id);
    if (!existing) {
      res.status(404).json({ error: "Agent not found" });
      return;
    }
    assertCompanyAccess(req, existing.companyId);

    if (req.actor.type === "agent") {
      const actorAgent = req.actor.agentId ? await svc.getById(req.actor.agentId) : null;
      if (!actorAgent || actorAgent.companyId !== existing.companyId) {
        res.status(403).json({ error: "Forbidden" });
        return;
      }
      if (actorAgent.role !== "ceo") {
        res.status(403).json({ error: "Only CEO can manage permissions" });
        return;
      }
    } else {
      await assertBoardCanManageAgentsForCompany(req, existing.companyId);
    }

    const agent = await svc.updatePermissions(id, req.body);
    if (!agent) {
      res.status(404).json({ error: "Agent not found" });
      return;
    }

    const effectiveCanAssignTasks =
      agent.role === "ceo" || Boolean(agent.permissions?.canCreateAgents) || req.body.canAssignTasks;
    await access.ensureMembership(agent.companyId, "agent", agent.id, "member", "active");
    await access.setPrincipalPermission(
      agent.companyId,
      "agent",
      agent.id,
      "tasks:assign",
      effectiveCanAssignTasks,
      req.actor.type === "board" ? (req.actor.userId ?? null) : null,
    );

    const actor = getActorInfo(req);
    await logActivity(db, {
      companyId: agent.companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      runId: actor.runId,
      action: "agent.permissions_updated",
      entityType: "agent",
      entityId: agent.id,
      details: {
        canCreateAgents: agent.permissions?.canCreateAgents ?? false,
        canCreateSkills: agent.permissions?.canCreateSkills ?? true,
        canAssignTasks: effectiveCanAssignTasks,
        trustPreset: agent.permissions?.trustPreset ?? "standard",
      },
    });

    res.json(await buildAgentDetail(agent));
  });

  router.patch("/agents/:id/instructions-path", validate(updateAgentInstructionsPathSchema), async (req, res) => {
    if (req.actor.type !== "board") {
      throw forbidden("Only board-authenticated callers can manage instructions path or bundle configuration");
    }

    const id = req.params.id as string;
    const existing = await svc.getById(id);
    if (!existing) {
      res.status(404).json({ error: "Agent not found" });
      return;
    }

    await assertCanManageInstructionsPath(req, existing);

    const existingAdapterConfig = asRecord(existing.adapterConfig) ?? {};
    const explicitKey = asNonEmptyString(req.body.adapterConfigKey);
    const defaultKey = resolveInstructionsPathKey(existing.adapterType);
    const adapterConfigKey = explicitKey ?? defaultKey;
    if (!adapterConfigKey) {
      res.status(422).json({
        error: `No default instructions path key for adapter type '${existing.adapterType}'. Provide adapterConfigKey.`,
      });
      return;
    }

    const nextAdapterConfig: Record<string, unknown> = { ...existingAdapterConfig };
    if (req.body.path === null) {
      delete nextAdapterConfig[adapterConfigKey];
    } else {
      nextAdapterConfig[adapterConfigKey] = resolveInstructionsFilePath(req.body.path, existingAdapterConfig);
    }

    const syncedAdapterConfig = syncInstructionsBundleConfigFromFilePath(existing, nextAdapterConfig);
    const normalizedAdapterConfig = await secretsSvc.normalizeAdapterConfigForPersistence(
      existing.companyId,
      syncedAdapterConfig,
      { strictMode: strictSecretsMode },
    );
    const actor = getActorInfo(req);
    const agent = await svc.update(
      id,
      { adapterConfig: normalizedAdapterConfig },
      {
        recordRevision: {
          createdByAgentId: actor.agentId,
          createdByUserId: actor.actorType === "user" ? actor.actorId : null,
          source: "instructions_path_patch",
        },
      },
    );
    if (!agent) {
      res.status(404).json({ error: "Agent not found" });
      return;
    }

    const updatedAdapterConfig = asRecord(agent.adapterConfig) ?? {};
    const pathValue = asNonEmptyString(updatedAdapterConfig[adapterConfigKey]);

    await logActivity(db, {
      companyId: agent.companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      runId: actor.runId,
      action: "agent.instructions_path_updated",
      entityType: "agent",
      entityId: agent.id,
      details: {
        adapterConfigKey,
        path: pathValue,
        cleared: req.body.path === null,
      },
    });

    res.json({
      agentId: agent.id,
      adapterType: agent.adapterType,
      adapterConfigKey,
      path: pathValue,
    });
  });

  router.get("/agents/:id/instructions-bundle", async (req, res) => {
    const id = req.params.id as string;
    const existing = await svc.getById(id);
    if (!existing) {
      res.status(404).json({ error: "Agent not found" });
      return;
    }
    await assertCanReadAgent(req, existing);
    res.json(await instructions.getBundle(existing));
  });

  router.patch("/agents/:id/instructions-bundle", validate(updateAgentInstructionsBundleSchema), async (req, res) => {
    const id = req.params.id as string;
    const existing = await svc.getById(id);
    if (!existing) {
      res.status(404).json({ error: "Agent not found" });
      return;
    }
    await assertCanManageInstructionsPath(req, existing);

    const actor = getActorInfo(req);
    const { bundle, adapterConfig } = await instructions.updateBundle(existing, req.body);
    const normalizedAdapterConfig = await secretsSvc.normalizeAdapterConfigForPersistence(
      existing.companyId,
      adapterConfig,
      { strictMode: strictSecretsMode },
    );
    await svc.update(
      id,
      { adapterConfig: normalizedAdapterConfig },
      {
        recordRevision: {
          createdByAgentId: actor.agentId,
          createdByUserId: actor.actorType === "user" ? actor.actorId : null,
          source: "instructions_bundle_patch",
        },
      },
    );

    await logActivity(db, {
      companyId: existing.companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      runId: actor.runId,
      action: "agent.instructions_bundle_updated",
      entityType: "agent",
      entityId: existing.id,
      details: {
        mode: bundle.mode,
        rootPath: bundle.rootPath,
        entryFile: bundle.entryFile,
        clearLegacyPromptTemplate: req.body.clearLegacyPromptTemplate === true,
      },
    });

    res.json(bundle);
  });

  router.get("/agents/:id/instructions-bundle/file", async (req, res) => {
    const id = req.params.id as string;
    const existing = await svc.getById(id);
    if (!existing) {
      res.status(404).json({ error: "Agent not found" });
      return;
    }
    await assertCanReadAgent(req, existing);

    const relativePath = typeof req.query.path === "string" ? req.query.path : "";
    if (!relativePath.trim()) {
      res.status(422).json({ error: "Query parameter 'path' is required" });
      return;
    }

    res.json(await instructions.readFile(existing, relativePath));
  });

  router.put("/agents/:id/instructions-bundle/file", validate(upsertAgentInstructionsFileSchema), async (req, res) => {
    const id = req.params.id as string;
    const existing = await svc.getById(id);
    if (!existing) {
      res.status(404).json({ error: "Agent not found" });
      return;
    }
    await assertCanManageInstructionsPath(req, existing);

    const actor = getActorInfo(req);
    const result = await instructions.writeFile(existing, req.body.path, req.body.content, {
      clearLegacyPromptTemplate: req.body.clearLegacyPromptTemplate,
    });
    const normalizedAdapterConfig = await secretsSvc.normalizeAdapterConfigForPersistence(
      existing.companyId,
      result.adapterConfig,
      { strictMode: strictSecretsMode },
    );
    await svc.update(
      id,
      { adapterConfig: normalizedAdapterConfig },
      {
        recordRevision: {
          createdByAgentId: actor.agentId,
          createdByUserId: actor.actorType === "user" ? actor.actorId : null,
          source: "instructions_bundle_file_put",
        },
      },
    );

    await logActivity(db, {
      companyId: existing.companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      runId: actor.runId,
      action: "agent.instructions_file_updated",
      entityType: "agent",
      entityId: existing.id,
      details: {
        path: result.file.path,
        size: result.file.size,
        clearLegacyPromptTemplate: req.body.clearLegacyPromptTemplate === true,
      },
    });

    res.json(result.file);
  });

  router.delete("/agents/:id/instructions-bundle/file", async (req, res) => {
    const id = req.params.id as string;
    const existing = await svc.getById(id);
    if (!existing) {
      res.status(404).json({ error: "Agent not found" });
      return;
    }
    await assertCanManageInstructionsPath(req, existing);

    const relativePath = typeof req.query.path === "string" ? req.query.path : "";
    if (!relativePath.trim()) {
      res.status(422).json({ error: "Query parameter 'path' is required" });
      return;
    }

    const actor = getActorInfo(req);
    const result = await instructions.deleteFile(existing, relativePath);
    await logActivity(db, {
      companyId: existing.companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      runId: actor.runId,
      action: "agent.instructions_file_deleted",
      entityType: "agent",
      entityId: existing.id,
      details: {
        path: relativePath,
      },
    });

    res.json(result.bundle);
  });

  router.post("/agents/:id/persona", async (req, res) => {
    const id = req.params.id as string;
    const existing = await svc.getById(id);
    if (!existing) {
      res.status(404).json({ error: "Agent not found" });
      return;
    }
    await assertCanUpdateAgent(req, existing);
    const body = (req.body ?? {}) as Record<string, unknown>;
    const useNow = body.useNow === true;
    const placeName = typeof body.placeName === "string" ? body.placeName.trim() : "";
    const coordinateSystem = body.coordinateSystem === "TROPICAL" ? "TROPICAL" : "SIDEREAL";
    const filePathRaw = typeof body.filePath === "string" ? body.filePath.trim() : "SOUL.template.md";
    const filePath = filePathRaw.length > 0 ? filePathRaw : "SOUL.template.md";

    let birthDateTime: string | null = null;
    let latitude: number | null = null;
    let longitude: number | null = null;

    if (useNow) {
      const now = new Date();
      birthDateTime = now.toISOString();
      latitude = typeof body.latitude === "number" ? body.latitude : typeof body.latitude === "string" ? Number(body.latitude) : 28.6139;
      longitude = typeof body.longitude === "number" ? body.longitude : typeof body.longitude === "string" ? Number(body.longitude) : 77.209;
      if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) latitude = 28.6139;
      if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) longitude = 77.209;
    } else {
      const rawDt = typeof body.birthDateTime === "string" ? body.birthDateTime.trim() : "";
      if (!rawDt) {
        res.status(422).json({ error: "birthDateTime is required (ISO)" });
        return;
      }
      const d = new Date(rawDt);
      if (Number.isNaN(d.getTime())) {
        res.status(422).json({ error: "birthDateTime is not a valid date" });
        return;
      }
      birthDateTime = d.toISOString();
      const lat = typeof body.latitude === "number" ? body.latitude : Number(body.latitude);
      const lng = typeof body.longitude === "number" ? body.longitude : Number(body.longitude);
      if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
        res.status(422).json({ error: "latitude must be -90..90" });
        return;
      }
      if (!Number.isFinite(lng) || lng < -180 || lng > 180) {
        res.status(422).json({ error: "longitude must be -180..180" });
        return;
      }
      latitude = lat;
      longitude = lng;
    }

    // Persist natal fields on agent — drizzle timestamp expects Date, not string
    const natalUpdate: Record<string, unknown> = {
      natalBirthDateTime: birthDateTime ? new Date(birthDateTime) : null,
      natalLatitude: latitude,
      natalLongitude: longitude,
      natalCoordinateSystem: coordinateSystem,
    };
    // Store raw birth data for later vector computation / audit
    const natalChartRaw: Record<string, unknown> = {
      birthDateTime,
      latitude,
      longitude,
      placeName: placeName || null,
      coordinateSystem,
      generatedAt: new Date().toISOString(),
      generatedBy: "persona_ui",
    };

    // Try to compute vectors via astrologics MCP if reachable; otherwise store raw and defer
    let natalChartVectors: Record<string, unknown> | null = null;
    let personaBody = "";
    const agentName = existing.name || "Agent";
    const dateLabel = new Date(birthDateTime!).toLocaleString("en-IN", { timeZone: "UTC", dateStyle: "long", timeStyle: "short" });
    const placeLabel = placeName ? `${placeName} (${latitude.toFixed(4)}, ${longitude.toFixed(4)})` : `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`;

    // Attempt vector computation via Astrologics MCP (best-effort, no error if down)
    // Prefer simple REST /api/personality-vectors (added to mcp-server), fall back to MCP JSON-RPC
    try {
      const baseFromEnv = process.env.ASTROLOGICS_MCP_URL?.replace(/\/mcp\/?$/, "") ?? "http://127.0.0.1:8766";
      const restUrl = `${baseFromEnv.replace(/\/$/, "")}/api/personality-vectors`;
      const controller = new AbortController();
      const t = setTimeout(() => controller.abort(), 5000);
      const resp = await fetch(restUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ birthDateTime, latitude, longitude, coordinateSystem }),
        signal: controller.signal,
      } as RequestInit);
      clearTimeout(t);
      if (resp.ok) {
        const parsed = (await resp.json()) as Record<string, unknown>;
        if (parsed.aggregate) natalChartVectors = parsed as Record<string, unknown>;
      } else {
        // Fallback: try legacy MCP JSON-RPC at /mcp
        const mcpUrl = process.env.ASTROLOGICS_MCP_URL ?? "http://127.0.0.1:8766/mcp";
        const mcpPayload = {
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: { name: "compute_personality_vectors", arguments: { birthDateTime, latitude, longitude, coordinateSystem } },
        };
        const c2 = new AbortController();
        const t2 = setTimeout(() => c2.abort(), 4000);
        const r2 = await fetch(mcpUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
          body: JSON.stringify(mcpPayload),
          signal: c2.signal,
        } as RequestInit);
        clearTimeout(t2);
        if (r2.ok) {
          const j = (await r2.json()) as Record<string, unknown>;
          const maybeContent = (j as Record<string, unknown>).result as Record<string, unknown> | undefined;
          const contentArr = maybeContent?.content as Array<Record<string, unknown>> | undefined;
          const text = contentArr?.[0]?.text as string | undefined;
          if (text) {
            try {
              const parsed2 = JSON.parse(text) as Record<string, unknown>;
              if (parsed2.aggregate) natalChartVectors = parsed2 as Record<string, unknown>;
            } catch { /* ignore */ }
          }
        }
      }
    } catch {
      // MCP not reachable — keep vectors null for lazy compute (placeholder template)
    }

    if (natalChartVectors) {
      (natalChartRaw as Record<string, unknown>).vectorsComputed = true;
    }

    await svc.update(
      id,
      {
        ...natalUpdate,
        natalChartRaw,
        ...(natalChartVectors ? { natalChartVectors: (natalChartVectors as Record<string, unknown>).aggregate as Record<string, number> } : {}),
      },
      {
        recordRevision: {
          createdByAgentId: getActorInfo(req).agentId,
          createdByUserId: getActorInfo(req).actorType === "user" ? getActorInfo(req).actorId : null,
          source: "persona_generation",
        },
      },
    );

    // Build persona file — SOUL.template.md with astrology placeholders + birth data
    if (natalChartVectors) {
      const agg = (natalChartVectors as Record<string, unknown>).aggregate as Record<string, number> | undefined;
      const dom = (natalChartVectors as Record<string, unknown>).dominantAxes as Array<Record<string, unknown>> | undefined;
      const derived = (natalChartVectors as Record<string, unknown>).derivedMetrics as Record<string, number> | undefined;
      const top = Array.isArray(dom) ? dom.slice(0, 6).map((d) => `- **${String(d.axis)}** (${String((d as Record<string, unknown>).label ?? d.axis)}): ${Number((d as Record<string, unknown>).value).toFixed(3)}`).join("\n") : "";
      const aggEntries = agg ? Object.entries(agg).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])).slice(0, 12).map(([k, v]) => `| ${k} | ${v.toFixed(3)} |`).join("\n") : "";
      personaBody = `# ${agentName} — Soul Template

> Generated ${new Date().toISOString()} for ${agentName}
> Birth: ${dateLabel} UTC — ${placeLabel} — ${coordinateSystem}

## Personality Profile (from natal chart)

Dominant axes:
${top || "- (no dominant axes)"}

| Axis | Value |
|------|-------|
${aggEntries || "| — | — |"}
${derived ? `\n**Derived:** symbolicPressure ${Number(derived.symbolicPressure).toFixed(3)}, tension ${Number(derived.tensionLevel).toFixed(3)}, integrationDifficulty ${Number(derived.integrationDifficulty).toFixed(3)}, manifestation ${Number(derived.manifestationStrength).toFixed(3)}` : ""}

> This block was expanded at generation time from 52-axis vectors. A {{ASTROLOGY_CHART}} placeholder is also kept below for Hermes boot-time re-expansion if you prefer template mode.

{{ASTROLOGY_CHART}}

## Birth Data (for reference)

- **Date/Time (UTC):** ${birthDateTime}
- **Place:** ${placeLabel}
- **System:** ${coordinateSystem}

## Agent

You are {{AGENT_NAME}}, ${existing.role ?? "agent"} at this company. Operate through Paperclip.

## Raw Vectors

\`\`\`json
${JSON.stringify({ aggregate: agg, dominantAxes: dom, derivedMetrics: derived }, null, 2)}
\`\`\`

> Full vectors stored on the agent (agents.natal_chart_vectors / natal_chart_raw) for Hermes boot-time {{ASTROLOGY_CHART}} expansion.
`;
    } else {
      personaBody = `# ${agentName} — Soul Template

> Birth: ${dateLabel} UTC — ${placeLabel} — ${coordinateSystem}
> Generated ${new Date().toISOString()} (vectors pending — will resolve on next Hermes boot)

{{ASTROLOGY_CHART}}

## Birth Data

- **Date/Time (UTC):** ${birthDateTime}
- **Place:** ${placeLabel}
- **System:** ${coordinateSystem}
- **Agent:** {{AGENT_NAME}} (${existing.role ?? "agent"})

## Instructions

You are {{AGENT_NAME}}. This template's {{ASTROLOGY_CHART}} placeholder is expanded by Hermes at boot from the agent's natal vectors (agents.natal_chart_vectors). If vectors are missing, the block is stripped.

Edit below to add role-specific voice and constraints.

## Raw

\`\`\`json
${JSON.stringify(natalChartRaw, null, 2)}
\`\`\`
`;
    }

    const actor = getActorInfo(req);
    const saved = await instructions.writeFile(existing, filePath, personaBody);
    if (saved.adapterConfig) {
      try {
        await svc.update(id, { adapterConfig: saved.adapterConfig } as Record<string, unknown>, {
          recordRevision: {
            createdByAgentId: actor.agentId,
            createdByUserId: actor.actorType === "user" ? actor.actorId : null,
            source: "persona_ensure_bundle",
          },
        });
      } catch {
        // non-fatal
      }
    }

    // Seed AGENTS.md preamble from natal dominant axes (once, editable after)
    if (natalChartVectors) {
      try {
        const domForLens = (natalChartVectors as Record<string, unknown>).dominantAxes as Array<Record<string, unknown>> | undefined;
        const topLens = Array.isArray(domForLens) ? domForLens.slice(0, 3).map((d) => `${String(d.axis)} ${Number((d as Record<string, unknown>).value).toFixed(2)}`).join(" · ") : "";
        const lensBlock = `<!-- natal-lens -->\n> Agent lens (natal): ${topLens || "balanced"} — seeded from ${placeLabel} ${dateLabel} UTC. Edit or remove this block.\n<!-- /natal-lens -->\n\n`;
        let existingAgentsMd: string | null = null;
        try {
          const f = await instructions.readFile(existing, "AGENTS.md");
          existingAgentsMd = f.content;
        } catch {
          existingAgentsMd = null;
        }
        if (existingAgentsMd !== null) {
          if (!existingAgentsMd.includes("<!-- natal-lens -->")) {
            await instructions.writeFile(existing, "AGENTS.md", lensBlock + existingAgentsMd);
          }
        } else {
          // No AGENTS.md yet — create it with lens + placeholder
          await instructions.writeFile(existing, "AGENTS.md", `${lensBlock}# AGENTS\n\nOperational instructions for ${agentName}.\n`);
        }
      } catch {
        // non-fatal — persona file already saved
      }
    }

    await logActivity(db, {
      companyId: existing.companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      runId: actor.runId,
      action: "agent.persona_generated",
      entityType: "agent",
      entityId: existing.id,
      details: { birthDateTime, latitude, longitude, placeName, coordinateSystem, filePath, hasVectors: !!natalChartVectors },
    });

    res.json({ agentId: id, file: saved.file, bundle: saved.bundle, natalChartVectors, natalChartRaw });
  });

  router.post("/agents/:id/knowledge-graph/refresh", async (req, res) => {
    const id = req.params.id as string;
    const existing = await svc.getById(id);
    if (!existing) {
      res.status(404).json({ error: "Agent not found" });
      return;
    }
    await assertCanReadAgent(req, existing);
    const bundle = await instructions.getBundle(existing);
    const files = bundle.files.filter((f) => f.markdown);
    const contents = await Promise.all(
      files.map(async (f) => {
        try {
          const d = await instructions.readFile(existing, f.path);
          return { path: f.path, content: d.content };
        } catch {
          return { path: f.path, content: "" };
        }
      }),
    );
    // ── Manual diary regions (agent-owned; refresh preserves byte-identical).
    // Postgres rows win when present (the memory system of record);
    // otherwise the file's own regions are used, so hosts without pgvector
    // keep working unchanged. See services/knowledge-graph-diary.ts.
    const existingKg = contents.find((c) => c.path.toLowerCase() === "knowledge_graph.md");
    const existingKgText = existingKg?.content ?? "";
    let selfBody: string | null = null;
    let housesBody: string | null = null;
    let daySections: Map<string, string> = new Map();
    let dbSourced = false;
    try {
      if (await memories.tableAvailable()) {
        const rendered = await memories.renderDiary({ companyId: existing.companyId, agentId: existing.id });
        if (rendered.hasRows) {
          selfBody = rendered.selfBody;
          housesBody = rendered.housesBody;
          daySections = rendered.daySections;
          // File-era `distilled:` markers still count toward the prune gate.
          const fileParsed = parseDiaryRegions(existingKgText);
          const fileDistilled = fileParsed.selfBody ? kgDistilledDates(fileParsed.selfBody) : new Set<string>();
          for (const d of fileDistilled) rendered.distilledDates.add(d);
          if (rendered.distilledDates.size > 0 && selfBody) {
            const missing = [...rendered.distilledDates].filter((d) => !selfBody!.includes(`distilled: ${d}`));
            if (missing.length > 0) selfBody = `${selfBody}\n${missing.map((d) => `distilled: ${d}`).join("\n")}\n`;
          }
          dbSourced = true;
        }
      }
    } catch {
      // fall through to file regions
    }
    if (!dbSourced) {
      const parsed = parseDiaryRegions(existingKgText);
      selfBody = parsed.selfBody;
      housesBody = parsed.housesBody;
      daySections = parsed.daySections;
    }
    const today = kgTodayUtc();
    const { prunedDays, pendingDistill } = applyPruneGate(daySections, selfBody, today);
    const manualBlock = buildManualBlock(selfBody, daySections, existing.name, housesBody);

    // Build nodes from files + explicit [[links]]
    const nodes = contents.map((c, i) => ({ id: `n${i+1}`, path: c.path, content: c.content }));
    const rawEdges: Array<{ from: string; to: string; reason: string }> = [];
    const pathToId = new Map(nodes.map((n) => [n.path.toLowerCase(), n.id]));
    // also map basename without extension
    for (const n of nodes) {
      const base = n.path.replace(/\.md$/i, "").toLowerCase();
      if (!pathToId.has(base)) pathToId.set(base, n.id);
    }
    for (const n of nodes) {
      // Fresh regex per file — the old shared /g regex leaked lastIndex
      // across files and silently skipped matches.
      const linkRe = /\[\[([A-Za-z0-9_\-.\/]+)(?:#[^\]]+)?\]\]/g;
      let m: RegExpExecArray | null;
      while ((m = linkRe.exec(n.content)) !== null) {
        const raw = m[1].trim().toLowerCase();
        const targetId = pathToId.get(raw) ?? pathToId.get(raw.replace(/\.md$/i, "")) ?? null;
        if (targetId && targetId !== n.id) {
          rawEdges.push({ from: n.id, to: targetId, reason: `explicit [[${m[1]}]] in ${n.path}` });
        }
      }
    }
    // Add co-occurrence edges: files sharing same directory
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i].path.split("/").slice(0, -1).join("/");
        const b = nodes[j].path.split("/").slice(0, -1).join("/");
        if (a && a === b) {
          if (!rawEdges.some((e) => (e.from === nodes[i].id && e.to === nodes[j].id) || (e.from === nodes[j].id && e.to === nodes[i].id))) {
            rawEdges.push({ from: nodes[i].id, to: nodes[j].id, reason: `same dir ${a || "/"}`});
          }
        }
      }
    }
    // Collapse duplicate from→to pairs (repeated links drew on top of each
    // other: "3 nodes · 15 edges"). Most-referenced links sort first so the
    // 30-edge cap keeps meaning, not recency.
    const edgeCounts = new Map<string, { from: string; to: string; reason: string; count: number }>();
    for (const e of rawEdges) {
      const key = `${e.from}→${e.to}`;
      const hit = edgeCounts.get(key);
      if (hit) hit.count += 1;
      else edgeCounts.set(key, { ...e, count: 1 });
    }
    const edges = [...edgeCounts.values()]
      .sort((a, b) => b.count - a.count)
      .map((e) => (e.count > 1 ? { ...e, reason: `${e.reason} (×${e.count})` } : e));
    // Distillation-pipeline Mermaid: wake stream → daily ledger → 12 houses
    // → Self. File tables below stay file-scoped (the canvas parses them).
    const mermaidLabel = (raw: string) => raw.replace(/%%\{init/g, "%% init").replace(/"/g, "'").replace(/\[/g, "(").replace(/\]/g, ")").replace(/\{/g, "(").replace(/\}/g, ")").replace(/\n/g, " ").trim().slice(0, 42) || "node";
    const pipeDays = [...daySections.keys()].sort().slice(-3);
    const pipeDayId = (date: string) => `dd${date.replace(/-/g, "")}`;
    const countBullets = (body: string) => body.split("\n").filter((l) => l.trim().startsWith("- ")).length;
    // 1. Real-time wake stream: "- HH:MM UTC wake" bullets, chronological.
    const pipeWakes: Array<{ t: string; day: string }> = [];
    for (const date of pipeDays) {
      const body = daySections.get(date) ?? "";
      for (const line of body.split("\n")) {
        const wm = /^-\s*(\d{2}:\d{2})\s+UTC wake/i.exec(line.trim());
        if (wm) pipeWakes.push({ t: wm[1], day: date });
      }
    }
    const shownWakes = pipeWakes.slice(-6);
    // 3. Houses referenced via `house: N` tags in recent days (top 6).
    const houseCounts = new Map<number, number>();
    for (const date of pipeDays) {
      const body = daySections.get(date) ?? "";
      const hre = /house:\s*(\d{1,2})/gi;
      let hm: RegExpExecArray | null;
      while ((hm = hre.exec(body)) !== null) {
        const n = parseInt(hm[1], 10);
        if (n >= 1 && n <= 12) houseCounts.set(n, (houseCounts.get(n) ?? 0) + 1);
      }
    }
    const pipeHouses = [...houseCounts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0] - b[0])
      .slice(0, 6)
      .map(([n]) => n);
    const houseName = (n: number) => KG_HOUSES.find((h) => h.n === n)?.name ?? `House ${n}`;
    const mermaidLines = ["```mermaid", "graph TD"];
    mermaidLines.push(`  subgraph RawLogs ["1. Real-Time Wake Stream"]`);
    shownWakes.forEach((w, i) => mermaidLines.push(`    w${i + 1}["${w.t} UTC Wake"]`));
    mermaidLines.push(`  end`);
    mermaidLines.push(`  subgraph DailyLog ["2. Daily Ledger (LOG_YYYY_MM_DD.md)"]`);
    for (const date of pipeDays) {
      const n = countBullets(daySections.get(date) ?? "");
      mermaidLines.push(`    ${pipeDayId(date)}["${date} — ${n} entr${n === 1 ? "y" : "ies"}"]`);
    }
    mermaidLines.push(`    tagger["House Domain Tagging Engine"]`);
    mermaidLines.push(`  end`);
    mermaidLines.push(`  subgraph TwelveHouses ["3. 12 House Domains (Life Framework)"]`);
    if (pipeHouses.length > 0) {
      for (const n of pipeHouses) {
        mermaidLines.push(`    h${n}["House ${n}: ${mermaidLabel(houseName(n))}"]`);
      }
    } else {
      mermaidLines.push(`    hnone["Twelve Houses — no tags yet"]`);
    }
    mermaidLines.push(`  end`);
    mermaidLines.push(`  subgraph LongTermMemory ["4. Long-Term State"]`);
    mermaidLines.push(`    selfnode["Self Long-Term Memory"]`);
    mermaidLines.push(`  end`);
    shownWakes.forEach((w, i) => mermaidLines.push(`    w${i + 1} --> ${pipeDayId(w.day)}`));
    for (const date of pipeDays) {
      mermaidLines.push(`    ${pipeDayId(date)} --> tagger`);
    }
    for (const n of pipeHouses) {
      mermaidLines.push(`    tagger -->|"tag: house_${n}"| h${n}`);
    }
    mermaidLines.push(`  TwelveHouses -. "Distill at 00:00 UTC" .-> selfnode`);
    mermaidLines.push(`  classDef rawStyle fill:#0f172a,stroke:#38bdf8,color:#f8fafc;`);
    mermaidLines.push(`  classDef dailyStyle fill:#1e1b4b,stroke:#818cf8,color:#f8fafc;`);
    mermaidLines.push(`  classDef houseStyle fill:#064e3b,stroke:#34d399,color:#f8fafc;`);
    mermaidLines.push(`  classDef selfStyle fill:#312e81,stroke:#a78bfa,color:#f8fafc;`);
    if (shownWakes.length > 0) {
      mermaidLines.push(`  class ${shownWakes.map((_, i) => `w${i + 1}`).join(",")} rawStyle;`);
    }
    mermaidLines.push(`  class ${pipeDays.map((d) => pipeDayId(d)).join(",")},tagger dailyStyle;`);
    if (pipeHouses.length > 0) {
      mermaidLines.push(`  class ${pipeHouses.map((n) => `h${n}`).join(",")} houseStyle;`);
    } else {
      mermaidLines.push(`  class hnone houseStyle;`);
    }
    mermaidLines.push(`  class selfnode selfStyle;`);
    mermaidLines.push("```");
    const now = new Date().toISOString();
    const generatedBlock = `${KG_GENERATED_START}
# Knowledge Graph — ${existing.name}

> Generated ${now} from ${nodes.length} markdown files, ${edges.length} edges (deduped). Manual diary regions above ([[Self]] + dated UTC day sections) are agent-owned — refresh never touches them. Link with [[SOUL.template.md]] / [[AGENTS.md]] style links for explicit edges.

${mermaidLines.join("\n")}

## Nodes

| id | file | edges |
|---|---|---|
${nodes.map((n) => `| ${n.id} | ${n.path} | ${edges.filter((e) => e.from === n.id || e.to === n.id).length} |`).join("\n")}

## Edges

| from | to | reason |
|---|---|---|
${edges.length ? edges.map((e) => `| ${e.from} | ${e.to} | ${e.reason} |`).join("\n") : "| — | — | no edges yet — add [[links]] in your markdown |"}

> Auto-edges from co-location + explicit [[links]]. Re-run Refresh after editing markdown.
${KG_GENERATED_END}`;
    const md = `${manualBlock}\n\n${generatedBlock}\n`;
    const saved = await instructions.writeFile(existing, "KNOWLEDGE_GRAPH.md", md);
    await logActivity(db, {
      companyId: existing.companyId,
      actorType: getActorInfo(req).actorType,
      actorId: getActorInfo(req).actorId,
      agentId: getActorInfo(req).agentId,
      runId: getActorInfo(req).runId,
      action: "agent.knowledge_graph_refreshed",
      entityType: "agent",
      entityId: existing.id,
      details: { nodes: nodes.length, edges: edges.length, prunedDays, pendingDistill },
    });
    res.json({ file: saved.file, bundle: saved.bundle, nodes: nodes.length, edges: edges.length, prunedDays, pendingDistill });
  });

  // ── Agent memories (Postgres + pgvector replaces .md memoir files) ─────
  // Diary API: agents write here; KNOWLEDGE_GRAPH.md is the generated
  // projection rendered by the refresh route. 503 + {fallback:"file-diary"}
  // when the table is absent (hosts without pgvector) so callers fall back
  // to file behavior instead of failing the wake.
  const memoriesAvailableOr503 = async (res: Response): Promise<boolean> => {
    try {
      if (await memories.tableAvailable()) return true;
    } catch {
      // fall through to 503
    }
    res.status(503).json({ error: "Agent memory table unavailable on this host", fallback: "file-diary" });
    return false;
  };

  router.post("/agents/:id/memories/entries", validate(appendAgentMemorySchema), async (req, res) => {
    const id = req.params.id as string;
    const existing = await svc.getById(id);
    if (!existing) {
      res.status(404).json({ error: "Agent not found" });
      return;
    }
    await assertCanManageInstructionsPath(req, existing);
    if (!(await memoriesAvailableOr503(res))) return;
    let occurredAt: Date | null = null;
    if (typeof req.body.occurredAt === "string" && req.body.occurredAt) {
      const parsed = new Date(req.body.occurredAt);
      if (Number.isNaN(parsed.getTime())) {
        res.status(422).json({ error: "occurredAt must be a valid date" });
        return;
      }
      occurredAt = parsed;
    }
    const row = await memories.appendEntry({
      companyId: existing.companyId,
      agentId: existing.id,
      kind: req.body.kind ?? "day_entry",
      text: req.body.text,
      occurredAt,
      metadata: (req.body.metadata ?? {}) as Record<string, unknown>,
    });
    await logActivity(db, {
      companyId: existing.companyId,
      actorType: getActorInfo(req).actorType,
      actorId: getActorInfo(req).actorId,
      agentId: getActorInfo(req).agentId,
      runId: getActorInfo(req).runId,
      action: "agent.memory_appended",
      entityType: "agent",
      entityId: existing.id,
      details: { kind: req.body.kind ?? "day_entry", deduplicated: row === null },
    });
    res.json({ memory: row, deduplicated: row === null });
  });

  router.post("/agents/:id/memories/rules", validate(createAgentRuleSchema), async (req, res) => {
    const id = req.params.id as string;
    const existing = await svc.getById(id);
    if (!existing) {
      res.status(404).json({ error: "Agent not found" });
      return;
    }
    await assertCanManageInstructionsPath(req, existing);
    if (!(await memoriesAvailableOr503(res))) return;
    const row = await memories.upsertRule({
      companyId: existing.companyId,
      agentId: existing.id,
      text: req.body.text,
      priority: req.body.priority,
      supersedes: req.body.supersedes,
    });
    await logActivity(db, {
      companyId: existing.companyId,
      actorType: getActorInfo(req).actorType,
      actorId: getActorInfo(req).actorId,
      agentId: getActorInfo(req).agentId,
      runId: getActorInfo(req).runId,
      action: "agent.memory_rule_written",
      entityType: "agent",
      entityId: existing.id,
      details: { priority: req.body.priority ?? 50, supersedes: req.body.supersedes ?? null },
    });
    res.json({ rule: row });
  });

  router.put("/agents/:id/memories/self", validate(upsertAgentSelfSchema), async (req, res) => {
    const id = req.params.id as string;
    const existing = await svc.getById(id);
    if (!existing) {
      res.status(404).json({ error: "Agent not found" });
      return;
    }
    await assertCanManageInstructionsPath(req, existing);
    if (!(await memoriesAvailableOr503(res))) return;
    const row = await memories.upsertSelf({
      companyId: existing.companyId,
      agentId: existing.id,
      text: req.body.text,
    });
    await logActivity(db, {
      companyId: existing.companyId,
      actorType: getActorInfo(req).actorType,
      actorId: getActorInfo(req).actorId,
      agentId: getActorInfo(req).agentId,
      runId: getActorInfo(req).runId,
      action: "agent.memory_self_updated",
      entityType: "agent",
      entityId: existing.id,
      details: {},
    });
    res.json({ memory: row });
  });

  router.put("/agents/:id/memories/houses", validate(upsertAgentHousesSchema), async (req, res) => {
    const id = req.params.id as string;
    const existing = await svc.getById(id);
    if (!existing) {
      res.status(404).json({ error: "Agent not found" });
      return;
    }
    await assertCanManageInstructionsPath(req, existing);
    if (!(await memoriesAvailableOr503(res))) return;
    const rows = await memories.upsertHouses({
      companyId: existing.companyId,
      agentId: existing.id,
      houses: req.body.houses,
    });
    res.json({ houses: rows });
  });

  router.post("/agents/:id/memories/distill", validate(recordAgentDistilledSchema), async (req, res) => {
    const id = req.params.id as string;
    const existing = await svc.getById(id);
    if (!existing) {
      res.status(404).json({ error: "Agent not found" });
      return;
    }
    await assertCanManageInstructionsPath(req, existing);
    if (!(await memoriesAvailableOr503(res))) return;
    const row = await memories.recordDistilled({
      companyId: existing.companyId,
      agentId: existing.id,
      date: req.body.date,
    });
    res.json({ memory: row, deduplicated: row === null });
  });

  router.get("/agents/:id/memories/search", async (req, res) => {
    const id = req.params.id as string;
    const existing = await svc.getById(id);
    if (!existing) {
      res.status(404).json({ error: "Agent not found" });
      return;
    }
    await assertCanReadAgent(req, existing);
    if (!(await memoriesAvailableOr503(res))) return;
    const parsed = searchAgentMemoriesSchema.safeParse({
      q: typeof req.query.q === "string" ? req.query.q : "",
      kinds: typeof req.query.kinds === "string"
        ? req.query.kinds.split(",").map((s) => s.trim()).filter(Boolean)
        : undefined,
      k: typeof req.query.k === "string" ? Number(req.query.k) : undefined,
      maxChars: typeof req.query.maxChars === "string" ? Number(req.query.maxChars) : undefined,
    });
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid search parameters" });
      return;
    }
    const results = await memories.search({
      companyId: existing.companyId,
      agentId: existing.id,
      query: parsed.data.q,
      kinds: parsed.data.kinds,
      limit: parsed.data.k,
      maxChars: parsed.data.maxChars,
    });
    // Standing rules ride in their own bucket — first-class retrieval that
    // never score-competes with episodic hits.
    const rules = await memories.activeRules({
      companyId: existing.companyId,
      agentId: existing.id,
      query: parsed.data.q,
    });
    res.json({ results, rules });
  });

  router.post("/agents/:id/memories/re-embed", async (req, res) => {
    const id = req.params.id as string;
    const existing = await svc.getById(id);
    if (!existing) {
      res.status(404).json({ error: "Agent not found" });
      return;
    }
    await assertCanManageInstructionsPath(req, existing);
    if (!(await memoriesAvailableOr503(res))) return;
    const limit = typeof req.query.limit === "string" ? Number(req.query.limit) : undefined;
    const result = await memories.reembedPending({
      companyId: existing.companyId,
      agentId: existing.id,
      limit: Number.isFinite(limit) ? (limit as number) : undefined,
    });
    res.json(result);
  });

  router.post("/agents/:id/memories/backfill", async (req, res) => {
    const id = req.params.id as string;
    const existing = await svc.getById(id);
    if (!existing) {
      res.status(404).json({ error: "Agent not found" });
      return;
    }
    await assertCanManageInstructionsPath(req, existing);
    if (!(await memoriesAvailableOr503(res))) return;
    const bundle = await instructions.getBundle(existing);
    const files = bundle.files.filter((f) => f.markdown);
    const contents: Record<string, string> = {};
    await Promise.all(
      files.map(async (f) => {
        try {
          const d = await instructions.readFile(existing, f.path);
          contents[f.path] = d.content;
        } catch {
          // skip unreadable files
        }
      }),
    );
    const result = await memories.backfillFromFiles({
      companyId: existing.companyId,
      agentId: existing.id,
      agentName: existing.name,
      files: contents,
    });
    await logActivity(db, {
      companyId: existing.companyId,
      actorType: getActorInfo(req).actorType,
      actorId: getActorInfo(req).actorId,
      agentId: getActorInfo(req).agentId,
      runId: getActorInfo(req).runId,
      action: "agent.memory_backfilled",
      entityType: "agent",
      entityId: existing.id,
      details: result,
    });
    res.json(result);
  });

  // ── Hermes runtime sessions (durable server-side conversation state) ──
  // hermes_server.py keeps live sessions in RAM and PUTs a snapshot here
  // after each turn; on restart it GETs the snapshot back to rehydrate.
  // 503 when the table is absent so Hermes stays memory-only instead of
  // failing the wake.
  const hermesSessionsAvailableOr503 = async (res: Response): Promise<boolean> => {
    try {
      if (await hermesSessions.tableAvailable()) return true;
    } catch {
      // fall through to 503
    }
    res.status(503).json({ error: "Hermes session table unavailable on this host" });
    return false;
  };

  function readHermesSessionId(value: unknown): string | null {
    if (typeof value !== "string") return null;
    const trimmed = value.trim();
    return trimmed.length > 0 && trimmed.length <= 128 ? trimmed : null;
  }

  router.get("/agents/:id/hermes-session", async (req, res) => {
    const id = req.params.id as string;
    const existing = await svc.getById(id);
    if (!existing) {
      res.status(404).json({ error: "Agent not found" });
      return;
    }
    assertCanManageHermesSession(req, existing);
    if (!(await hermesSessionsAvailableOr503(res))) return;
    const sessionId = readHermesSessionId(req.query.sessionId);
    if (!sessionId) {
      res.status(422).json({ error: "sessionId query param is required" });
      return;
    }
    const row = await hermesSessions.get({ companyId: existing.companyId, agentId: existing.id, sessionId });
    if (!row) {
      res.status(404).json({ error: "Hermes session not found" });
      return;
    }
    res.json({ session: row });
  });

  router.put("/agents/:id/hermes-session", validate(upsertHermesSessionSchema), async (req, res) => {
    const id = req.params.id as string;
    const existing = await svc.getById(id);
    if (!existing) {
      res.status(404).json({ error: "Agent not found" });
      return;
    }
    assertCanManageHermesSession(req, existing);
    if (!(await hermesSessionsAvailableOr503(res))) return;
    const { snapshot, error } = normalizeHermesSnapshot(req.body.snapshot);
    if (!snapshot) {
      res.status(422).json({ error: error ?? "Invalid snapshot" });
      return;
    }
    const row = await hermesSessions.upsert({
      companyId: existing.companyId,
      agentId: existing.id,
      sessionId: req.body.sessionId.trim(),
      snapshot,
    });
    res.json({ session: row });
  });

  router.delete("/agents/:id/hermes-session", async (req, res) => {
    const id = req.params.id as string;
    const existing = await svc.getById(id);
    if (!existing) {
      res.status(404).json({ error: "Agent not found" });
      return;
    }
    assertCanManageHermesSession(req, existing);
    if (!(await hermesSessionsAvailableOr503(res))) return;
    const sessionId = readHermesSessionId(req.query.sessionId);
    if (!sessionId) {
      res.status(422).json({ error: "sessionId query param is required" });
      return;
    }
    const removed = await hermesSessions.remove({ companyId: existing.companyId, agentId: existing.id, sessionId });
    if (!removed) {
      res.status(404).json({ error: "Hermes session not found" });
      return;
    }
    res.json({ status: "deleted" });
  });

  router.post("/agents/:id/tool-md/refresh", async (req, res) => {
    const id = req.params.id as string;
    const existing = await svc.getById(id);
    if (!existing) {
      res.status(404).json({ error: "Agent not found" });
      return;
    }
    await assertCanReadAgent(req, existing);
    // Core tools mirror hermes-agent/toolsets.py HERMES_CORE_TOOLS (stable)
    const HERMES_CORE_TOOLS = [
      "web_search", "web_extract",
      "terminal", "process", "read_terminal",
      "read_file", "write_file", "patch", "search_files",
      "vision_analyze", "image_generate",
      "skills_list", "skill_view", "skill_manage",
      "browser_navigate", "browser_snapshot", "browser_click", "browser_type", "browser_scroll", "browser_back", "browser_press", "browser_get_images", "browser_vision", "browser_console", "browser_cdp", "browser_dialog",
      "text_to_speech",
      "todo", "memory",
      "clarify",
      "execute_code", "delegate_task",
      "cronjob",
      "ha_list_entities", "ha_get_state", "ha_list_services", "ha_call_service",
      "computer_use",
    ];
    const HERMES_CONTEXT_TOOLS = [
      "session_search",
      "kanban_show", "kanban_list", "kanban_complete", "kanban_block", "kanban_heartbeat", "kanban_comment", "kanban_create", "kanban_link", "kanban_unblock",
    ];
    const cfg = (existing.adapterConfig ?? {}) as Record<string, unknown>;
    const skillSync = cfg.paperclipSkillSync as Record<string, unknown> | undefined;
    const desiredSkillsRaw = skillSync?.desiredSkills ?? (cfg as Record<string, unknown>).skills;
    const desiredSkills: string[] = Array.isArray(desiredSkillsRaw)
      ? (desiredSkillsRaw as unknown[]).map((v) => {
          if (typeof v === "string") return v;
          if (v && typeof v === "object" && typeof (v as Record<string, unknown>).key === "string") return (v as Record<string, unknown>).key as string;
          if (v && typeof v === "object" && typeof (v as Record<string, unknown>).name === "string") return (v as Record<string, unknown>).name as string;
          return String(v);
        }).filter(Boolean)
      : [];
    // Try to enrich skill names with company skill titles if available
    let skillDetails: Array<{ key: string; title?: string }> = desiredSkills.map((k) => ({ key: k }));
    try {
      const { companySkills } = await import("@paperclipai/db");
      const rows = await db.select({ key: companySkills.key, title: companySkills.name }).from(companySkills).where(eq(companySkills.companyId, existing.companyId));
      const map = new Map(rows.map((r) => [r.key, r.title]));
      skillDetails = desiredSkills.map((k) => ({ key: k, title: (map.get(k) as string | undefined) ?? undefined }));
    } catch { /* best-effort */ }

    const now = new Date().toISOString();
    const md = `# Toolchain — ${existing.name}

> Generated ${now} for ${existing.name} (${existing.adapterType}). Core tools are always available; context tools are gated by session config; skills are per-agent.

## Core Tools (always loaded — ${HERMES_CORE_TOOLS.length})

| Tool | Category |
|------|----------|
${HERMES_CORE_TOOLS.map((t) => `| \`${t}\` | ${t.startsWith("browser_") ? "browser" : t.includes("ha_") ? "homeassistant" : t.startsWith("kanban") ? "kanban" : t.startsWith("skills") ? "skills" : /^(web_|vision|image)/.test(t) ? "web/vision" : /^(read_|write_|patch|search_)/.test(t) ? "file" : "core"} |`).join("\n")}

## Context Tools (gated — ${HERMES_CONTEXT_TOOLS.length})

> Enabled when session config sets \`tools.context_tools_enabled=true\`.

| Tool | Notes |
|------|-------|
${HERMES_CONTEXT_TOOLS.map((t) => `| \`${t}\` | ${t.startsWith("kanban") ? "kanban (needs HERMES_KANBAN_TASK)" : "session/memory"} |`).join("\n")}

## Assigned Skills (${skillDetails.length})

${skillDetails.length ? `| Skill key | Title |
|-----------|-------|
${skillDetails.map((s) => `| \`${s.key}\` | ${s.title ?? "—"} |`).join("\n")}` : "_No skills assigned yet — add via Skills tab or persona generator._"}

## MCP Servers (if configured)

> Astrologics MCP and other per-company MCPs are discovered via \`hermes-agent/config.yaml\` \`mcp_servers\` and are not part of the core toolset — they appear as additional tools when the server is reachable.

| Server | Tools |
|--------|-------|
| astrologics | \`compute_natal_chart\`, \`compute_transits\`, \`compute_personality_vectors\` (52-axis), \`compute_founders_chart\`, \`generate_reading\` |
| trade-mcp / addies / appzeno | per-company domain tools |

> Regenerate via **Refresh** after changing skills or toolsets. This file is stored as \`TOOL.md\` in the instructions bundle and is Hermes-readable.
`;
    const saved = await instructions.writeFile(existing, "TOOL.md", md);
    await logActivity(db, {
      companyId: existing.companyId,
      actorType: getActorInfo(req).actorType,
      actorId: getActorInfo(req).actorId,
      agentId: getActorInfo(req).agentId,
      runId: getActorInfo(req).runId,
      action: "agent.tool_md_refreshed",
      entityType: "agent",
      entityId: existing.id,
      details: { coreTools: HERMES_CORE_TOOLS.length, contextTools: HERMES_CONTEXT_TOOLS.length, skills: skillDetails.length },
    });
    res.json({ file: saved.file, bundle: saved.bundle, coreTools: HERMES_CORE_TOOLS.length, skills: skillDetails.length });
  });

  router.patch("/agents/:id", validate(updateAgentSchema), async (req, res) => {
    const id = req.params.id as string;
    const existing = await svc.getById(id);
    if (!existing) {
      res.status(404).json({ error: "Agent not found" });
      return;
    }
    await assertCanUpdateAgent(req, existing);

    if (hasOwn(req.body as object, "permissions")) {
      res.status(422).json({ error: "Use /api/agents/:id/permissions for permission changes" });
      return;
    }

    const patchData = { ...(req.body as Record<string, unknown>) };
    const replaceAdapterConfig = patchData.replaceAdapterConfig === true;
    delete patchData.replaceAdapterConfig;
    if (hasOwn(patchData, "adapterConfig")) {
      const adapterConfig = asRecord(patchData.adapterConfig);
      if (!adapterConfig) {
        res.status(422).json({ error: "adapterConfig must be an object" });
        return;
      }
      assertNoAgentAdapterConfigMutation(req, adapterConfig);
      const changingInstructionsConfig = adapterConfigTouchesInstructionsConfig(adapterConfig);
      if (changingInstructionsConfig) {
        await assertCanManageInstructionsPath(req, existing);
      }
      patchData.adapterConfig = adapterConfig;
    }

    const requestedAdapterType = hasOwn(patchData, "adapterType")
      ? assertKnownAdapterType(patchData.adapterType as string | null | undefined)
      : existing.adapterType;
    let requestedRuntimeConfig: Record<string, unknown> | null = null;
    if (hasOwn(patchData, "runtimeConfig")) {
      const runtimeConfig = asRecord(patchData.runtimeConfig);
      if (!runtimeConfig) {
        res.status(422).json({ error: "runtimeConfig must be an object" });
        return;
      }
      assertNoAgentRuntimeConfigAdapterConfigMutation(req, runtimeConfig);
      requestedRuntimeConfig = runtimeConfig;
    }
    const touchesAdapterConfiguration =
      hasOwn(patchData, "adapterType") ||
      hasOwn(patchData, "adapterConfig");
    if (touchesAdapterConfiguration) {
      const existingAdapterConfig = asRecord(existing.adapterConfig) ?? {};
      const changingAdapterType =
        typeof patchData.adapterType === "string" && patchData.adapterType !== existing.adapterType;
      const requestedAdapterConfig = hasOwn(patchData, "adapterConfig")
        ? (asRecord(patchData.adapterConfig) ?? {})
        : null;
      if (
        requestedAdapterConfig
        && replaceAdapterConfig
        && KNOWN_INSTRUCTIONS_BUNDLE_KEYS.some((key) =>
          existingAdapterConfig[key] !== undefined && requestedAdapterConfig[key] === undefined,
        )
      ) {
        await assertCanManageInstructionsPath(req, existing);
      }
      let rawEffectiveAdapterConfig = requestedAdapterConfig ?? existingAdapterConfig;
      if (requestedAdapterConfig && !changingAdapterType && !replaceAdapterConfig) {
        rawEffectiveAdapterConfig = { ...existingAdapterConfig, ...requestedAdapterConfig };
      }
      if (changingAdapterType) {
        // Preserve adapter-agnostic keys (env, cwd, etc.) from the existing config
        // when the adapter type changes. Without this, a PATCH that includes
        // adapterConfig but omits these keys would silently drop them.
        const ADAPTER_AGNOSTIC_KEYS = [
          "env", "cwd", "timeoutSec", "graceSec",
          "promptTemplate", "bootstrapPromptTemplate",
        ] as const;
        for (const key of ADAPTER_AGNOSTIC_KEYS) {
          if (rawEffectiveAdapterConfig[key] === undefined && existingAdapterConfig[key] !== undefined) {
            rawEffectiveAdapterConfig = { ...rawEffectiveAdapterConfig, [key]: existingAdapterConfig[key] };
          }
        }
        rawEffectiveAdapterConfig = preserveInstructionsBundleConfig(
          existingAdapterConfig,
          rawEffectiveAdapterConfig,
        );
      }
      const effectiveAdapterConfig = applyCodexLocalKeyIsolation(
        existing.companyId,
        existing.id,
        requestedAdapterType,
        applyCreateDefaultsByAdapterType(
          requestedAdapterType,
          rawEffectiveAdapterConfig,
        ),
      );
      const normalizedEffectiveAdapterConfig = await normalizeMediatedAdapterConfigForPersistence({
        companyId: existing.companyId,
        adapterType: requestedAdapterType,
        adapterConfig: effectiveAdapterConfig,
      });
      patchData.adapterConfig = syncInstructionsBundleConfigFromFilePath(existing, normalizedEffectiveAdapterConfig);
    }
    if (requestedRuntimeConfig) {
      const baseAdapterConfig = asRecord(patchData.adapterConfig) ?? asRecord(existing.adapterConfig) ?? {};
      patchData.runtimeConfig = await normalizeRuntimeConfigAdapterConfigsForPersistence(
        existing.companyId,
        requestedAdapterType,
        requestedRuntimeConfig,
        baseAdapterConfig,
      );
    }
    if (touchesAdapterConfiguration || Object.prototype.hasOwnProperty.call(patchData, "defaultEnvironmentId")) {
      await assertAgentDefaultEnvironmentSelection(
        existing.companyId,
        Object.prototype.hasOwnProperty.call(patchData, "defaultEnvironmentId")
          ? (typeof patchData.defaultEnvironmentId === "string" ? patchData.defaultEnvironmentId : null)
          : existing.defaultEnvironmentId,
        {
          allowedDrivers: allowedEnvironmentDriversForAgent(requestedAdapterType),
          allowedSandboxProviders: allowedSandboxProvidersForAgent(requestedAdapterType),
        },
      );
    }

    const actor = getActorInfo(req);
    const agent = await svc.update(id, patchData, {
      recordRevision: {
        createdByAgentId: actor.agentId,
        createdByUserId: actor.actorType === "user" ? actor.actorId : null,
        source: "patch",
      },
    });
    if (!agent) {
      res.status(404).json({ error: "Agent not found" });
      return;
    }

    await logActivity(db, {
      companyId: agent.companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      runId: actor.runId,
      action: "agent.updated",
      entityType: "agent",
      entityId: agent.id,
      details: summarizeAgentUpdateDetails(patchData),
    });

    res.json(agent);
  });

  router.post("/agents/:id/pause", async (req, res) => {
    assertBoard(req);
    const id = req.params.id as string;
    if (!(await getAccessibleAgent(req, res, id))) {
      return;
    }
    const agent = await svc.pause(id);
    if (!agent) {
      res.status(404).json({ error: "Agent not found" });
      return;
    }

    await heartbeat.cancelActiveForAgent(id);

    await logActivity(db, {
      companyId: agent.companyId,
      actorType: "user",
      actorId: req.actor.userId ?? "board",
      action: "agent.paused",
      entityType: "agent",
      entityId: agent.id,
    });

    res.json(agent);
  });

  router.post("/agents/:id/resume", async (req, res) => {
    assertBoard(req);
    const id = req.params.id as string;
    const existing = await getAccessibleAgent(req, res, id);
    if (!existing) {
      return;
    }
    if (existing.orgChainHealth?.status === "invalid_org_chain") {
      res.status(409).json({
        error: existing.orgChainHealth?.repairGuidance ?? "Repair this agent's reporting chain before resuming it",
      });
      return;
    }
    const agent = await svc.resume(id);
    if (!agent) {
      res.status(404).json({ error: "Agent not found" });
      return;
    }

    await logActivity(db, {
      companyId: agent.companyId,
      actorType: "user",
      actorId: req.actor.userId ?? "board",
      action: "agent.resumed",
      entityType: "agent",
      entityId: agent.id,
    });

    res.json(agent);
  });

  router.post("/agents/:id/clear-error", async (req, res) => {
    assertBoard(req);
    const id = req.params.id as string;
    const existing = await getAccessibleAgent(req, res, id);
    if (!existing) {
      return;
    }
    if (existing.orgChainHealth?.status === "invalid_org_chain") {
      res.status(409).json({
        error: existing.orgChainHealth?.repairGuidance ?? "Repair this agent's reporting chain before clearing its error",
      });
      return;
    }

    const agent = await svc.clearError(id);
    if (!agent) {
      res.status(404).json({ error: "Agent not found" });
      return;
    }

    await logActivity(db, {
      companyId: agent.companyId,
      actorType: "user",
      actorId: req.actor.userId ?? "board",
      action: "agent.error_cleared",
      entityType: "agent",
      entityId: agent.id,
    });

    res.json(agent);
  });

  router.post("/agents/:id/approve", async (req, res) => {
    assertBoard(req);
    const id = req.params.id as string;
    const existing = await getAccessibleAgent(req, res, id);
    if (!existing) {
      return;
    }
    if (existing.status !== "pending_approval") {
      res.status(409).json({ error: "Only pending approval agents can be approved" });
      return;
    }

    // Resolve the linked hire approval (clears it from the inbox) and run the
    // shared approval side effects: agent activation, budget policy, and the
    // hire-approved notification. Fall back to direct activation if no open
    // approval record exists (e.g. agents created before approvals were tracked).
    const decidedByUserId = req.actor.userId ?? "board";
    const openApproval = await approvalsSvc.findOpenHireApprovalForAgent(existing.companyId, id);

    let agent: Awaited<ReturnType<typeof svc.getById>> | null = null;
    if (openApproval) {
      await approvalsSvc.approve(openApproval.id, decidedByUserId);
      agent = await svc.getById(id);
    } else {
      const approval = await svc.activatePendingApproval(id);
      if (!approval) {
        res.status(404).json({ error: "Agent not found" });
        return;
      }
      if (!approval.activated) {
        res.status(409).json({ error: "Only pending approval agents can be approved" });
        return;
      }
      agent = approval.agent;
    }

    if (!agent) {
      res.status(404).json({ error: "Agent not found" });
      return;
    }

    await logActivity(db, {
      companyId: agent.companyId,
      actorType: "user",
      actorId: req.actor.userId ?? "board",
      action: "agent.approved",
      entityType: "agent",
      entityId: agent.id,
      details: { source: "agent_detail", approvalId: openApproval?.id ?? null },
    });

    res.json(agent);
  });

  router.post("/agents/:id/terminate", async (req, res) => {
    assertBoard(req);
    const id = req.params.id as string;
    const existing = await getAccessibleAgent(req, res, id);
    if (!existing) {
      return;
    }

    // Terminating an agent that is still awaiting approval is the agent-detail
    // equivalent of rejecting the hire. When a linked hire approval is still
    // open, delegate to approvalsSvc.reject(), which both resolves the approval
    // (clearing the inbox "Approve/Reject" card) and terminates the agent.
    // Mirror the approve path's branch-or-fallback so we never terminate twice:
    // reject() already calls agentsSvc.terminate() internally.
    let agent: Awaited<ReturnType<typeof svc.terminate>> = null;
    if (existing.status === "pending_approval") {
      const openApproval = await approvalsSvc.findOpenHireApprovalForAgent(existing.companyId, id);
      if (openApproval) {
        await approvalsSvc.reject(openApproval.id, req.actor.userId ?? "board");
        agent = await svc.getById(id);
      }
    }
    if (!agent) {
      agent = await svc.terminate(id);
    }
    if (!agent) {
      res.status(404).json({ error: "Agent not found" });
      return;
    }

    const companyAgentRows = await db
      .select({
        id: agentsTable.id,
        companyId: agentsTable.companyId,
        name: agentsTable.name,
        reportsTo: agentsTable.reportsTo,
        status: agentsTable.status,
      })
      .from(agentsTable)
      .where(eq(agentsTable.companyId, agent.companyId));
    const invalidOrgChainDescendantIds = listInvalidOrgChainDescendantIds(id, companyAgentRows);
    const cancellation = await heartbeat.cancelInvocationsForAgents(
      [id, ...invalidOrgChainDescendantIds],
      "Cancelled because the agent was terminated or became invalid-org-chain under a terminated manager",
    );

    await logActivity(db, {
      companyId: agent.companyId,
      actorType: "user",
      actorId: req.actor.userId ?? "board",
      action: "agent.terminated",
      entityType: "agent",
      entityId: agent.id,
      details: {
        invalidOrgChain: {
          descendantCount: invalidOrgChainDescendantIds.length,
          descendantIds: invalidOrgChainDescendantIds,
          state: invalidOrgChainDescendantIds.length > 0 ? "descendants_invalid_under_terminated_manager" : "none",
        },
        cancellation: {
          agentIds: cancellation.agentIds,
          runsCancelled: cancellation.runsCancelled,
          wakeupsCancelled: cancellation.wakeupsCancelled,
        },
      },
    });

    res.json(agent);
  });

  router.delete("/agents/:id", async (req, res) => {
    assertBoard(req);
    const id = req.params.id as string;
    if (!(await getAccessibleAgent(req, res, id))) {
      return;
    }
    const agent = await svc.remove(id);
    if (!agent) {
      res.status(404).json({ error: "Agent not found" });
      return;
    }

    await logActivity(db, {
      companyId: agent.companyId,
      actorType: "user",
      actorId: req.actor.userId ?? "board",
      action: "agent.deleted",
      entityType: "agent",
      entityId: agent.id,
    });

    res.json({ ok: true });
  });

  router.get("/agents/:id/keys", async (req, res) => {
    assertBoard(req);
    const id = req.params.id as string;
    const agent = await getAccessibleAgent(req, res, id);
    if (!agent) {
      return;
    }
    const keys = await svc.listKeys(id);
    res.json(keys);
  });

  router.post("/agents/:id/keys", validate(createAgentKeySchema), async (req, res) => {
    assertBoard(req);
    const id = req.params.id as string;
    const agent = await getAccessibleAgent(req, res, id);
    if (!agent) {
      return;
    }
    const key = await svc.createApiKey(id, req.body.name);

    await logActivity(db, {
      companyId: agent.companyId,
      actorType: "user",
      actorId: req.actor.userId ?? "board",
      action: "agent.key_created",
      entityType: "agent",
      entityId: agent.id,
      details: { keyId: key.id, name: key.name },
    });

    res.status(201).json(key);
  });

  router.delete("/agents/:id/keys/:keyId", async (req, res) => {
    assertBoard(req);
    const id = req.params.id as string;
    const keyId = req.params.keyId as string;
    const agent = await getAccessibleAgent(req, res, id);
    if (!agent) {
      return;
    }

    const key = await svc.getKeyById(keyId);
    if (!key || key.agentId !== agent.id) {
      res.status(404).json({ error: "Key not found" });
      return;
    }

    const revoked = await svc.revokeKey(agent.id, keyId);
    if (!revoked) {
      res.status(404).json({ error: "Key not found" });
      return;
    }

    await logActivity(db, {
      companyId: agent.companyId,
      actorType: "user",
      actorId: req.actor.userId ?? "board",
      action: "agent.key_revoked",
      entityType: "agent",
      entityId: agent.id,
      details: { keyId: key.id, name: key.name },
    });

    res.json({ ok: true });
  });

  // Shared handler body for the wakeup-style endpoints. The two routes differ
  // only in:
  //  - `source` — the modern /wakeup endpoint reads it from the request body
  //    (timer|assignment|on_demand|automation) while the legacy
  //    /heartbeat/invoke endpoint hardcodes "on_demand", since it has only
  //    ever produced on-demand invocations.
  //  - skipped-response shape — the modern endpoint surfaces the rich
  //    SkippedWakeupResponse; the legacy endpoint stays on the simpler
  //    { status: "skipped" } shape for backward compat.
  type HeartbeatSource = "timer" | "assignment" | "on_demand" | "automation";
  type WakeupRouteOpts = {
    source: HeartbeatSource | undefined;
    skippedResponse: (agent: NonNullable<Awaited<ReturnType<typeof svc.getById>>>) => unknown | Promise<unknown>;
  };
  const handleWakeupRoute = async (
    req: Request,
    res: Response,
    opts: WakeupRouteOpts,
  ): Promise<void> => {
    const id = req.params.id as string;
    const agent = await svc.getById(id);
    if (!agent) {
      res.status(404).json({ error: "Agent not found" });
      return;
    }
    assertCompanyAccess(req, agent.companyId);

    if (req.actor.type === "agent") {
      if (req.actor.agentId !== id) {
        res.status(403).json({ error: "Agent can only invoke itself" });
        return;
      }
    } else {
      await assertBoardCanManageAgentsForCompany(req, agent.companyId);
    }
    if (agent.orgChainHealth?.status === "invalid_org_chain") {
      res.status(409).json({
        error: agent.orgChainHealth?.repairGuidance ?? "Repair this agent's reporting chain before starting runs",
      });
      return;
    }

    const run = await heartbeat.wakeup(id, {
      source: opts.source,
      triggerDetail: req.body.triggerDetail ?? "manual",
      reason: req.body.reason ?? null,
      payload: req.body.payload ?? null,
      idempotencyKey: req.body.idempotencyKey ?? null,
      requestedByActorType: req.actor.type === "agent" ? "agent" : "user",
      requestedByActorId: req.actor.type === "agent" ? req.actor.agentId ?? null : req.actor.userId ?? null,
      contextSnapshot: {
        triggeredBy: req.actor.type,
        actorId: req.actor.type === "agent" ? req.actor.agentId : req.actor.userId,
        forceFreshSession: req.body.forceFreshSession === true,
      },
    });

    if (!run) {
      res.status(202).json(await opts.skippedResponse(agent));
      return;
    }

    const actor = getActorInfo(req);
    await logActivity(db, {
      companyId: agent.companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      runId: actor.runId,
      action: "heartbeat.invoked",
      entityType: "heartbeat_run",
      entityId: run.id,
      details: { agentId: id },
    });

    res.status(202).json(run);
  };

  router.post("/agents/:id/wakeup", validate(wakeAgentSchema), async (req, res) => {
    await handleWakeupRoute(req, res, {
      source: req.body.source,
      skippedResponse: (agent) => buildSkippedWakeupResponse(agent, req.body.payload ?? null),
    });
  });

  router.post("/agents/:id/heartbeat/invoke", async (req, res) => {
    // Legacy endpoint. Hardcodes `source: "on_demand"` (the prior behavior
    // before the wakeup/invoke convergence). Reads scope fields directly off
    // the body without `validate(wakeAgentSchema)` because callers — including
    // the e2e suite — post an empty body, and the schema rejects undefined
    // / missing bodies. Only forwards fields the caller actually supplied so
    // an empty body produces the original fixed-arg `heartbeat.invoke()`
    // shape exactly.
    const id = req.params.id as string;
    const agent = await svc.getById(id);
    if (!agent) {
      res.status(404).json({ error: "Agent not found" });
      return;
    }
    assertCompanyAccess(req, agent.companyId);

    if (req.actor.type === "agent") {
      if (req.actor.agentId !== id) {
        res.status(403).json({ error: "Agent can only invoke itself" });
        return;
      }
    } else {
      await assertBoardCanManageAgentsForCompany(req, agent.companyId);
    }
    if (agent.orgChainHealth?.status === "invalid_org_chain") {
      res.status(409).json({
        error: agent.orgChainHealth?.repairGuidance ?? "Repair this agent's reporting chain before starting runs",
      });
      return;
    }

    const body = (req.body ?? {}) as Partial<{
      reason: unknown;
      payload: unknown;
      idempotencyKey: unknown;
      forceFreshSession: unknown;
      triggerDetail: unknown;
    }>;
    const contextSnapshot: Record<string, unknown> = {
      triggeredBy: req.actor.type,
      actorId: req.actor.type === "agent" ? req.actor.agentId : req.actor.userId,
    };
    if (body.forceFreshSession === true) {
      contextSnapshot.forceFreshSession = true;
    }
    const wakeOpts: Parameters<typeof heartbeat.wakeup>[1] = {
      source: "on_demand",
      triggerDetail: typeof body.triggerDetail === "string" ? body.triggerDetail as "manual" | "system" | "ping" | "callback" : "manual",
      requestedByActorType: req.actor.type === "agent" ? "agent" : "user",
      requestedByActorId: req.actor.type === "agent" ? req.actor.agentId ?? null : req.actor.userId ?? null,
      contextSnapshot,
    };
    if (typeof body.reason === "string" && body.reason.length > 0) {
      wakeOpts.reason = body.reason;
    }
    if (body.payload && typeof body.payload === "object" && !Array.isArray(body.payload)) {
      wakeOpts.payload = body.payload as Record<string, unknown>;
    }
    if (typeof body.idempotencyKey === "string" && body.idempotencyKey.length > 0) {
      wakeOpts.idempotencyKey = body.idempotencyKey;
    }
    const run = await heartbeat.wakeup(id, wakeOpts);

    if (!run) {
      res.status(202).json({ status: "skipped" });
      return;
    }

    const actor = getActorInfo(req);
    await logActivity(db, {
      companyId: agent.companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      runId: actor.runId,
      action: "heartbeat.invoked",
      entityType: "heartbeat_run",
      entityId: run.id,
      details: { agentId: id },
    });

    res.status(202).json(run);
  });

  router.post("/agents/:id/claude-login", async (req, res) => {
    assertBoard(req);
    const id = req.params.id as string;
    const agent = await svc.getById(id);
    if (!agent) {
      res.status(404).json({ error: "Agent not found" });
      return;
    }
    await assertBoardCanManageAgentsForCompany(req, agent.companyId);
    assertCompanyAccess(req, agent.companyId);
    if (agent.adapterType !== "claude_local") {
      res.status(400).json({ error: "Login is only supported for claude_local agents" });
      return;
    }

    const config = asRecord(agent.adapterConfig) ?? {};
    const { config: runtimeConfig } = await secretsSvc.resolveAdapterConfigForRuntime(agent.companyId, config);
    const result = await runClaudeLogin({
      runId: `claude-login-${randomUUID()}`,
      agent: {
        id: agent.id,
        companyId: agent.companyId,
        name: agent.name,
        adapterType: agent.adapterType,
        adapterConfig: agent.adapterConfig,
      },
      config: runtimeConfig,
    });

    res.json(result);
  });

  router.get("/companies/:companyId/heartbeat-runs", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const agentId = req.query.agentId as string | undefined;
    const limitParam = req.query.limit as string | undefined;
    const limit = limitParam ? Math.max(1, Math.min(1000, parseInt(limitParam, 10) || 200)) : undefined;
    const summary = req.query.summary === "true" || req.query.summary === "1";
    const runs = await heartbeat.list(companyId, agentId, limit, { summary });
    res.json(runs);
  });

  router.get("/companies/:companyId/live-runs", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);

    // `minCount` is a padding floor for callers that want a minimum number of
    // recent runs to render (e.g. dashboard cards). It must default to 0 so
    // callers asking for "live runs" get only actually-live runs — otherwise
    // every caller with no minCount param gets up to 50 historical runs
    // padded in and renders bogus "live" counts.
    const minCount = readLiveRunsQueryInt(req.query.minCount, 50, 0);
    const limit = readLiveRunsQueryInt(req.query.limit, 50, 50);

    const columns = {
      id: heartbeatRuns.id,
      companyId: heartbeatRuns.companyId,
      status: heartbeatRuns.status,
      invocationSource: heartbeatRuns.invocationSource,
      triggerDetail: heartbeatRuns.triggerDetail,
      contextCommentId: sql<string | null>`${heartbeatRuns.contextSnapshot} ->> 'commentId'`.as("contextCommentId"),
      contextWakeCommentId: sql<string | null>`${heartbeatRuns.contextSnapshot} ->> 'wakeCommentId'`.as("contextWakeCommentId"),
      startedAt: heartbeatRuns.startedAt,
      finishedAt: heartbeatRuns.finishedAt,
      createdAt: heartbeatRuns.createdAt,
      agentId: heartbeatRuns.agentId,
      agentName: agentsTable.name,
      adapterType: agentsTable.adapterType,
      logBytes: heartbeatRuns.logBytes,
      livenessState: heartbeatRuns.livenessState,
      livenessReason: heartbeatRuns.livenessReason,
      continuationAttempt: heartbeatRuns.continuationAttempt,
      lastUsefulActionAt: heartbeatRuns.lastUsefulActionAt,
      nextAction: heartbeatRuns.nextAction,
      lastOutputAt: heartbeatRuns.lastOutputAt,
      lastOutputSeq: heartbeatRuns.lastOutputSeq,
      lastOutputStream: heartbeatRuns.lastOutputStream,
      lastOutputBytes: heartbeatRuns.lastOutputBytes,
      processStartedAt: heartbeatRuns.processStartedAt,
      issueId: sql<string | null>`${heartbeatRuns.contextSnapshot} ->> 'issueId'`.as("issueId"),
    };

    const liveRunsQuery = db
      .select(columns)
      .from(heartbeatRuns)
      .innerJoin(agentsTable, eq(heartbeatRuns.agentId, agentsTable.id))
      .where(
        and(
          eq(heartbeatRuns.companyId, companyId),
          inArray(heartbeatRuns.status, ["queued", "running"]),
        ),
      )
      .orderBy(desc(heartbeatRuns.createdAt));

    const liveRuns = await liveRunsQuery.limit(limit);
    const targetRunCount = Math.min(minCount, limit);

    if (targetRunCount > 0 && liveRuns.length < targetRunCount) {
      const activeIds = liveRuns.map((r) => r.id);
      const recentRuns = await db
        .select(columns)
        .from(heartbeatRuns)
        .innerJoin(agentsTable, eq(heartbeatRuns.agentId, agentsTable.id))
        .where(
          and(
            eq(heartbeatRuns.companyId, companyId),
            not(inArray(heartbeatRuns.status, ["queued", "running"])),
            ...(activeIds.length > 0 ? [not(inArray(heartbeatRuns.id, activeIds))] : []),
          ),
        )
        .orderBy(desc(heartbeatRuns.createdAt))
        .limit(targetRunCount - liveRuns.length);

      const rows = [...liveRuns, ...recentRuns];
      res.json(await Promise.all(rows.map(async (run) => ({
        ...heartbeat.decorateActiveRunStatus(run),
        outputSilence: await heartbeat.buildRunOutputSilence(run),
      }))));
      return;
    }

    res.json(await Promise.all(liveRuns.map(async (run) => ({
      ...heartbeat.decorateActiveRunStatus(run),
      outputSilence: await heartbeat.buildRunOutputSilence(run),
    }))));
  });

  router.get("/heartbeat-runs/:runId", async (req, res) => {
    const runId = req.params.runId as string;
    const run = await heartbeat.getRun(runId);
    if (!run) {
      res.status(404).json({ error: "Heartbeat run not found" });
      return;
    }
    assertCompanyAccess(req, run.companyId);
    const retryExhaustedReason = await heartbeat.getRetryExhaustedReason(runId);
    const decoratedRun = heartbeat.decorateActiveRunStatus(run);
    res.json(
      redactCurrentUserValue(
        { ...decoratedRun, retryExhaustedReason, outputSilence: await heartbeat.buildRunOutputSilence(run) },
        await getCurrentUserRedactionOptions(),
      ),
    );
  });

  router.post("/heartbeat-runs/:runId/cancel", async (req, res) => {
    assertBoard(req);
    const runId = req.params.runId as string;
    const existing = await heartbeat.getRun(runId);
    if (existing) {
      assertCompanyAccess(req, existing.companyId);
    }
    const run = await heartbeat.cancelRun(runId);

    if (run) {
      await logActivity(db, {
        companyId: run.companyId,
        actorType: "user",
        actorId: req.actor.userId ?? "board",
        action: "heartbeat.cancelled",
        entityType: "heartbeat_run",
        entityId: run.id,
        details: { agentId: run.agentId },
      });
    }

    res.json(run);
  });

  router.post("/heartbeat-runs/:runId/watchdog-decisions", async (req, res) => {
    const runId = req.params.runId as string;
    const existing = await heartbeat.getRun(runId);
    if (!existing) {
      res.status(404).json({ error: "Heartbeat run not found" });
      return;
    }
    assertCompanyAccess(req, existing.companyId);
    const decision = typeof req.body?.decision === "string" ? req.body.decision : "";
    if (!["snooze", "continue", "dismissed_false_positive"].includes(decision)) {
      res.status(400).json({ error: "Unsupported watchdog decision" });
      return;
    }
    const evaluationIssueId = typeof req.body?.evaluationIssueId === "string" ? req.body.evaluationIssueId : null;
    const reason = typeof req.body?.reason === "string" ? req.body.reason.slice(0, 4000) : null;
    const snoozedUntil = decision === "snooze"
      ? new Date(String(req.body?.snoozedUntil ?? ""))
      : null;
    if (decision === "snooze" && (!snoozedUntil || Number.isNaN(snoozedUntil.getTime()) || snoozedUntil <= new Date())) {
      res.status(400).json({ error: "snoozedUntil must be a future ISO datetime" });
      return;
    }

    const row = await recovery.recordWatchdogDecision({
      runId: existing.id,
      actor: req.actor,
      decision: decision as "snooze" | "continue" | "dismissed_false_positive",
      evaluationIssueId,
      reason,
      snoozedUntil,
      createdByRunId: req.actor.runId ?? null,
    });

    res.json(row);
  });

  router.get("/heartbeat-runs/:runId/events", async (req, res) => {
    const runId = req.params.runId as string;
    const run = await heartbeat.getRun(runId);
    if (!run) {
      res.status(404).json({ error: "Heartbeat run not found" });
      return;
    }
    assertCompanyAccess(req, run.companyId);

    const afterSeq = Number(req.query.afterSeq ?? 0);
    const limit = Number(req.query.limit ?? 200);
    const events = await heartbeat.listEvents(runId, Number.isFinite(afterSeq) ? afterSeq : 0, Number.isFinite(limit) ? limit : 200);
    const currentUserRedactionOptions = await getCurrentUserRedactionOptions();
    const redactedEvents = events.map((event) =>
      redactCurrentUserValue({
        ...event,
        payload: redactEventPayload(event.payload),
      }, currentUserRedactionOptions),
    );
    res.json(redactedEvents);
  });

  router.get("/heartbeat-runs/:runId/log", async (req, res) => {
    const runId = req.params.runId as string;
    const run = await heartbeat.getRunLogAccess(runId);
    if (!run) {
      res.status(404).json({ error: "Heartbeat run not found" });
      return;
    }
    assertCompanyAccess(req, run.companyId);

    const offset = Number(req.query.offset ?? 0);
    const limitBytes = readRunLogLimitBytes(req.query.limitBytes);
    const result = await heartbeat.readLog(run, {
      offset: Number.isFinite(offset) ? offset : 0,
      limitBytes,
    });

    res.set("Cache-Control", "no-cache, no-store");
    res.json(result);
  });

  router.get("/heartbeat-runs/:runId/workspace-operations", async (req, res) => {
    const runId = req.params.runId as string;
    const run = await heartbeat.getRun(runId);
    if (!run) {
      res.status(404).json({ error: "Heartbeat run not found" });
      return;
    }
    assertCompanyAccess(req, run.companyId);

    const context = asRecord(run.contextSnapshot);
    const executionWorkspaceId = asNonEmptyString(context?.executionWorkspaceId);
    const operations = await workspaceOperations.listForRun(runId, executionWorkspaceId);
    res.json(redactCurrentUserValue(operations, await getCurrentUserRedactionOptions()));
  });

  router.get("/workspace-operations/:operationId/log", async (req, res) => {
    const operationId = req.params.operationId as string;
    const operation = await workspaceOperations.getById(operationId);
    if (!operation) {
      res.status(404).json({ error: "Workspace operation not found" });
      return;
    }
    assertCompanyAccess(req, operation.companyId);

    const offset = Number(req.query.offset ?? 0);
    const limitBytes = readRunLogLimitBytes(req.query.limitBytes);
    const result = await workspaceOperations.readLog(operationId, {
      offset: Number.isFinite(offset) ? offset : 0,
      limitBytes,
    });

    res.set("Cache-Control", "no-cache, no-store");
    res.json(result);
  });

  router.get("/issues/:issueId/live-runs", async (req, res) => {
    const rawId = req.params.issueId as string;
    const issueSvc = issueService(db);
    const identifier = normalizeIssueIdentifier(rawId);
    const issue = identifier ? await issueSvc.getByIdentifier(identifier) : await issueSvc.getById(rawId);
    if (!issue) {
      res.status(404).json({ error: "Issue not found" });
      return;
    }
    assertCompanyAccess(req, issue.companyId);

    const liveRuns = await db
      .select({
        id: heartbeatRuns.id,
        status: heartbeatRuns.status,
        invocationSource: heartbeatRuns.invocationSource,
        triggerDetail: heartbeatRuns.triggerDetail,
        contextCommentId: sql<string | null>`${heartbeatRuns.contextSnapshot} ->> 'commentId'`.as("contextCommentId"),
        contextWakeCommentId: sql<string | null>`${heartbeatRuns.contextSnapshot} ->> 'wakeCommentId'`.as("contextWakeCommentId"),
        startedAt: heartbeatRuns.startedAt,
        finishedAt: heartbeatRuns.finishedAt,
        createdAt: heartbeatRuns.createdAt,
        agentId: heartbeatRuns.agentId,
        agentName: agentsTable.name,
        adapterType: agentsTable.adapterType,
        logBytes: heartbeatRuns.logBytes,
        livenessState: heartbeatRuns.livenessState,
        livenessReason: heartbeatRuns.livenessReason,
        continuationAttempt: heartbeatRuns.continuationAttempt,
        lastUsefulActionAt: heartbeatRuns.lastUsefulActionAt,
        nextAction: heartbeatRuns.nextAction,
        lastOutputAt: heartbeatRuns.lastOutputAt,
        lastOutputSeq: heartbeatRuns.lastOutputSeq,
        lastOutputStream: heartbeatRuns.lastOutputStream,
        lastOutputBytes: heartbeatRuns.lastOutputBytes,
        processStartedAt: heartbeatRuns.processStartedAt,
      })
      .from(heartbeatRuns)
      .innerJoin(agentsTable, eq(heartbeatRuns.agentId, agentsTable.id))
      .where(
        and(
          eq(heartbeatRuns.companyId, issue.companyId),
          inArray(heartbeatRuns.status, ["queued", "running"]),
          sql`${heartbeatRuns.contextSnapshot} ->> 'issueId' = ${issue.id}`,
        ),
      )
      .orderBy(desc(heartbeatRuns.createdAt));

    res.json(await Promise.all(liveRuns.map(async (run) => ({
      ...heartbeat.decorateActiveRunStatus(run, { companyId: issue.companyId, issueId: issue.id }),
      outputSilence: await heartbeat.buildRunOutputSilence({ ...run, companyId: issue.companyId }),
    }))));
  });

  router.get("/issues/:issueId/active-run", async (req, res) => {
    const rawId = req.params.issueId as string;
    const issueSvc = issueService(db);
    const identifier = normalizeIssueIdentifier(rawId);
    const issue = identifier ? await issueSvc.getByIdentifier(identifier) : await issueSvc.getById(rawId);
    if (!issue) {
      res.status(404).json({ error: "Issue not found" });
      return;
    }
    assertCompanyAccess(req, issue.companyId);

    let run = issue.executionRunId ? await heartbeat.getRunIssueSummary(issue.executionRunId) : null;
    if (
      run &&
      (
        (run.status !== "queued" && run.status !== "running") ||
        run.issueId !== issue.id
      )
    ) {
      run = null;
    }

    if (!run && issue.assigneeAgentId && issue.status === "in_progress") {
      const candidateRun = await heartbeat.getActiveRunIssueSummaryForAgent(issue.assigneeAgentId);
      const candidateIssueId = asNonEmptyString(candidateRun?.issueId);
      if (candidateRun && candidateIssueId === issue.id) {
        run = candidateRun;
      }
    }
    if (!run) {
      res.json(null);
      return;
    }

    const agent = await svc.getById(run.agentId);
    if (!agent) {
      res.json(null);
      return;
    }

    const decoratedRun = heartbeat.decorateActiveRunStatus(run, { companyId: issue.companyId, issueId: issue.id });
    res.json({
      ...decoratedRun,
      agentId: agent.id,
      agentName: agent.name,
      adapterType: agent.adapterType,
      outputSilence: await heartbeat.buildRunOutputSilence({ ...run, companyId: issue.companyId }),
    });
  });

  return router;
}
