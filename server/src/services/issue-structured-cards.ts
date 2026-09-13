import { and, desc, eq } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { issueStructuredCards } from "@paperclipai/db";

export function issueStructuredCardService(db: Db) {
  return {
    async create(input: {
      companyId: string;
      issueId: string;
      agentId: string | null;
      runId: string | null;
      scenarioCode: string;
      payload: Record<string, unknown>;
      soulEnabled: boolean;
    }) {
      const [row] = await db
        .insert(issueStructuredCards)
        .values({
          companyId: input.companyId,
          issueId: input.issueId,
          agentId: input.agentId,
          runId: input.runId,
          scenarioCode: input.scenarioCode,
          soulEnabled: input.soulEnabled,
          payload: input.payload as Record<string, unknown>,
        })
        .returning();
      return row!;
    },

    async getLatest(issueId: string) {
      const rows = await db
        .select()
        .from(issueStructuredCards)
        .where(eq(issueStructuredCards.issueId, issueId))
        .orderBy(desc(issueStructuredCards.createdAt))
        .limit(1);
      return rows[0] ?? null;
    },

    async list(issueId: string, limit = 50) {
      return db
        .select()
        .from(issueStructuredCards)
        .where(eq(issueStructuredCards.issueId, issueId))
        .orderBy(desc(issueStructuredCards.createdAt))
        .limit(limit);
    },

    async getById(id: string) {
      const rows = await db.select().from(issueStructuredCards).where(eq(issueStructuredCards.id, id)).limit(1);
      return rows[0] ?? null;
    },
  };
}
