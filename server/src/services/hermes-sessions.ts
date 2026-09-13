// Durable Hermes runtime sessions.
//
// hermes_server.py keeps live sessions in process RAM (the hot cache). After
// each completed turn it PUTs a snapshot to the routes in agents.ts backed by
// this service; on restart / new task session it GETs the snapshot back to
// rehydrate conversation history. Rows are scoped (company, agent, sessionId)
// and expire after HERMES_SESSION_TTL_DAYS (lazy-expiry on read).

import { and, eq, lt, sql } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { hermesSessions } from "@paperclipai/db";

export const HERMES_SESSION_TTL_DAYS = 30;
export const HERMES_SESSION_MAX_HISTORY = 500;
export const HERMES_SESSION_MAX_SNAPSHOT_BYTES = 2_000_000;

export type HermesSessionRow = typeof hermesSessions.$inferSelect;

let tableAvailableCache: { at: number; value: boolean } | null = null;

async function tableExists(db: Db): Promise<boolean> {
  const now = Date.now();
  if (tableAvailableCache && now - tableAvailableCache.at < 60000) return tableAvailableCache.value;
  try {
    const rows = await db.execute(sql`SELECT to_regclass('public.hermes_sessions') AS t`);
    const value = (rows as unknown as Array<{ t: string | null }>)[0]?.t === "hermes_sessions";
    tableAvailableCache = { at: now, value };
    return value;
  } catch {
    tableAvailableCache = { at: now, value: false };
    return false;
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Normalize + bound an incoming snapshot (pure — unit-tested). */
export function normalizeHermesSnapshot(input: unknown): { snapshot?: Record<string, unknown>; error?: string } {
  if (!isPlainObject(input)) return { error: "snapshot must be an object" };
  const snapshot: Record<string, unknown> = { ...input };
  const rawHistory = Array.isArray(snapshot.conversation_history) ? snapshot.conversation_history : [];
  const history = rawHistory.filter(isPlainObject).slice(-HERMES_SESSION_MAX_HISTORY);
  snapshot.conversation_history = history;
  if (typeof snapshot.model !== "string") delete snapshot.model;
  if (typeof snapshot.provider !== "string") delete snapshot.provider;
  if (!Array.isArray(snapshot.skills)) delete snapshot.skills;
  let bytes = 0;
  try {
    bytes = Buffer.byteLength(JSON.stringify(snapshot), "utf8");
  } catch {
    return { error: "snapshot is not JSON-serializable" };
  }
  if (bytes > HERMES_SESSION_MAX_SNAPSHOT_BYTES) {
    return { error: `snapshot too large (${bytes} bytes, max ${HERMES_SESSION_MAX_SNAPSHOT_BYTES})` };
  }
  return { snapshot };
}

export function isHermesSessionExpired(updatedAt: Date, maxAgeDays = HERMES_SESSION_TTL_DAYS): boolean {
  return Date.now() - updatedAt.getTime() > maxAgeDays * 24 * 60 * 60 * 1000;
}

/** Cutoff instant for expiry queries (pure — unit-tested). */
export function hermesSessionExpiryCutoff(maxAgeDays = HERMES_SESSION_TTL_DAYS): Date {
  return new Date(Date.now() - maxAgeDays * 24 * 60 * 60 * 1000);
}

/** Delete this agent's rows older than the TTL. Runs on every upsert so
 * abandoned sessions can't accumulate — no scheduler needed. */
export async function pruneExpiredHermesSessions(
  db: Db,
  input: { companyId: string; agentId: string; maxAgeDays?: number },
): Promise<number> {
  const cutoff = hermesSessionExpiryCutoff(input.maxAgeDays);
  const rows = await db
    .delete(hermesSessions)
    .where(
      and(
        eq(hermesSessions.companyId, input.companyId),
        eq(hermesSessions.agentId, input.agentId),
        lt(hermesSessions.updatedAt, cutoff),
      ),
    )
    .returning({ id: hermesSessions.id });
  return rows.length;
}

export function hermesSessionService(db: Db) {
  return {
    tableAvailable: () => tableExists(db),

    async get(input: { companyId: string; agentId: string; sessionId: string; maxAgeDays?: number }): Promise<HermesSessionRow | null> {
      const rows = await db
        .select()
        .from(hermesSessions)
        .where(
          and(
            eq(hermesSessions.companyId, input.companyId),
            eq(hermesSessions.agentId, input.agentId),
            eq(hermesSessions.sessionId, input.sessionId),
          ),
        )
        .limit(1);
      const row = rows[0] ?? null;
      if (!row) return null;
      if (isHermesSessionExpired(row.updatedAt, input.maxAgeDays)) {
        await db.delete(hermesSessions).where(eq(hermesSessions.id, row.id));
        return null;
      }
      return row;
    },

    async upsert(input: {
      companyId: string;
      agentId: string;
      sessionId: string;
      snapshot: Record<string, unknown>;
    }): Promise<HermesSessionRow> {
      const existing = await db
        .select({ id: hermesSessions.id })
        .from(hermesSessions)
        .where(
          and(
            eq(hermesSessions.companyId, input.companyId),
            eq(hermesSessions.agentId, input.agentId),
            eq(hermesSessions.sessionId, input.sessionId),
          ),
        )
        .limit(1);
      if (existing[0]) {
        const rows = await db
          .update(hermesSessions)
          .set({ snapshotJson: input.snapshot, updatedAt: new Date() })
          .where(eq(hermesSessions.id, existing[0].id))
          .returning();
        try {
          await pruneExpiredHermesSessions(db, { companyId: input.companyId, agentId: input.agentId });
        } catch {
          // janitor must never fail the save
        }
        return rows[0];
      }
      const rows = await db
        .insert(hermesSessions)
        .values({
          companyId: input.companyId,
          agentId: input.agentId,
          sessionId: input.sessionId,
          snapshotJson: input.snapshot,
        })
        .returning();
      try {
        await pruneExpiredHermesSessions(db, { companyId: input.companyId, agentId: input.agentId });
      } catch {
        // janitor must never fail the save
      }
      return rows[0];
    },

    async remove(input: { companyId: string; agentId: string; sessionId: string }): Promise<boolean> {
      const rows = await db
        .delete(hermesSessions)
        .where(
          and(
            eq(hermesSessions.companyId, input.companyId),
            eq(hermesSessions.agentId, input.agentId),
            eq(hermesSessions.sessionId, input.sessionId),
          ),
        )
        .returning({ id: hermesSessions.id });
      return rows.length > 0;
    },
  };
}
