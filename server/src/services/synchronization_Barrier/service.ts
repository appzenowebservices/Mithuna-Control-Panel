import type { Db } from "@paperclipai/db";
import { workspaceOperations, issues } from "@paperclipai/db";
import type { WorkspaceOperationRecorder } from "../workspace-operations.js";
import type { WorkspaceFinalizeStatus } from "./types.js";
import { and, eq, inArray } from "drizzle-orm";
import { conflict } from "../../errors.js";

export async function recordWorkspaceFinalize(
  recorder: WorkspaceOperationRecorder,
  cwd: string | null,
  adapterType: string,
  executionTargetKind: string | null,
  status: "succeeded" | "failed",
  metadata?: Record<string, unknown>,
): Promise<void> {
  await recorder.recordOperation({
    phase: "workspace_finalize",
    cwd,
    metadata: {
      adapterType,
      executionTargetKind: executionTargetKind ?? "local",
      ...metadata,
    },
    run: async () => ({ status }),
  });
}

export async function isWorkspaceFinalized(
  dbOrTx: Pick<Db, "select">,
  companyId: string,
  executionWorkspaceId: string,
  runId: string,
): Promise<boolean> {
  const rows = await dbOrTx
    .select({
      phase: workspaceOperations.phase,
      status: workspaceOperations.status,
      startedAt: workspaceOperations.startedAt,
    })
    .from(workspaceOperations)
    .where(
      and(
        eq(workspaceOperations.companyId, companyId),
        eq(workspaceOperations.executionWorkspaceId, executionWorkspaceId),
        eq(workspaceOperations.heartbeatRunId, runId),
      ),
    );

  let latest: { phase: string; status: string; startedAt: Date } | null = null;
  for (const row of rows) {
    if (!latest || row.startedAt > latest.startedAt) latest = row;
  }

  if (!latest) return true;
  return latest.phase === "workspace_finalize" && latest.status === "succeeded";
}

export async function assertWorkspaceFinalized(
  db: Pick<Db, "select">,
  companyId: string,
  executionWorkspaceId: string,
  issueId: string,
  sourceRunId: string | null,
): Promise<void> {
  if (!sourceRunId) return;

  const isFinalized = await isWorkspaceFinalized(
    db,
    companyId,
    executionWorkspaceId,
    sourceRunId,
  );
  if (isFinalized) return;

  throw new Error(
    `Cannot accept interaction: the run that created this interaction has not finished syncing its workspace. `
    + `Retry once the local worktree has finished syncing.`,
  );
}

export async function listUnfinalizedExecutionWorkspaceIds(
  dbOrTx: Pick<Db, "select">,
  companyId: string,
  executionWorkspaceIds: string[],
): Promise<Set<string>> {
  const unfinalized = new Set<string>();
  if (executionWorkspaceIds.length === 0) return unfinalized;

  const rows = await dbOrTx
    .select({
      executionWorkspaceId: workspaceOperations.executionWorkspaceId,
      phase: workspaceOperations.phase,
      status: workspaceOperations.status,
      startedAt: workspaceOperations.startedAt,
    })
    .from(workspaceOperations)
    .where(
      and(
        eq(workspaceOperations.companyId, companyId),
        inArray(workspaceOperations.executionWorkspaceId, executionWorkspaceIds),
      ),
    );

  const latestByWorkspace = new Map<string, { phase: string; status: string; startedAt: Date }>();
  for (const row of rows) {
    if (!row.executionWorkspaceId) continue;
    const current = latestByWorkspace.get(row.executionWorkspaceId);
    if (!current || row.startedAt > current.startedAt) {
      latestByWorkspace.set(row.executionWorkspaceId, {
        phase: row.phase,
        status: row.status,
        startedAt: row.startedAt,
      });
    }
  }

  for (const workspaceId of executionWorkspaceIds) {
    const latest = latestByWorkspace.get(workspaceId);
    if (!latest) continue;
    if (latest.phase === "workspace_finalize" && latest.status === "succeeded") continue;
    unfinalized.add(workspaceId);
  }

  return unfinalized;
}

export async function assertIssueWorkspaceFinalizedForAccept(
  db: Pick<Db, "select">,
  companyId: string,
  issueId: string,
  sourceRunId: string | null,
): Promise<void> {
  if (!sourceRunId) return;

  const executionWorkspaceId = await db
    .select({ executionWorkspaceId: issues.executionWorkspaceId })
    .from(issues)
    .where(eq(issues.id, issueId))
    .then((rows) => rows[0]?.executionWorkspaceId ?? null);

  if (!executionWorkspaceId) return;

  const isFinalized = await isWorkspaceFinalized(
    db,
    companyId,
    executionWorkspaceId,
    sourceRunId,
  );
  if (isFinalized) return;

  throw conflict(
    "Cannot accept interaction: the run that created this interaction has not finished syncing its workspace. "
    + "Retry once the local worktree has finished syncing.",
    { executionWorkspaceId, sourceRunId },
  );
}