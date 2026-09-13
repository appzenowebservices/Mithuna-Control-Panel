// Agent memories — Postgres (+ pgvector) replaces .md memoir files.
//
// The instructions-bundle KNOWLEDGE_GRAPH.md becomes a generated projection:
// agents write here (append entry, rewrite Self/houses, record distillations)
// and the refresh route renders the file from these rows. Company+agent
// scoped like everything else. All methods degrade to file-backed behavior
// when the agent_memories table is absent (hosts without pgvector) — callers
// check tableAvailable() first; service methods themselves never throw for
// missing-table (they return empty), only for real DB errors.

import { createHash } from "node:crypto";
import { and, desc, eq, inArray, isNull, ne, or, sql } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { agentMemories } from "@paperclipai/db";
import { KG_HOUSES, parseDiaryRegions } from "./knowledge-graph-diary.js";
import { MEMORY_EMBEDDING_DIMS, activeEmbeddingModel, embedText } from "./memory-embedder.js";

export { MEMORY_EMBEDDING_DIMS };

export type MemoryRow = typeof agentMemories.$inferSelect;

let tableAvailableCache: { at: number; value: boolean } | null = null;

export function contentHashForMemory(kind: string, text: string): string {
  return createHash("sha256").update(`${kind}\n${text}`).digest("hex");
}

/** Split a day-section body into entry bullets (pure — unit-tested). */
export function parseDayBullets(body: string): string[] {
  const out: string[] = [];
  for (const line of body.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("- ") || trimmed === "- _No entries yet._") continue;
    out.push(trimmed);
  }
  return out;
}

async function tableExists(db: Db): Promise<boolean> {
  const now = Date.now();
  if (tableAvailableCache && now - tableAvailableCache.at < 60000) return tableAvailableCache.value;
  try {
    const rows = await db.execute(sql`SELECT to_regclass('public.agent_memories') AS t`);
    const value = (rows as unknown as Array<{ t: string | null }>)[0]?.t === "agent_memories";
    tableAvailableCache = { at: now, value };
    return value;
  } catch {
    tableAvailableCache = { at: now, value: false };
    return false;
  }
}

function embedAndFill(db: Db, id: string, text: string): void {
  // Fire-and-forget: writes never wait on embeddings; FTS covers the gap.
  void (async () => {
    try {
      const result = await embedText(text);
      if (!result) return;
      await db
        .update(agentMemories)
        .set({ embedding: result.vector, embeddingModel: result.model, updatedAt: new Date() })
        .where(eq(agentMemories.id, id));
    } catch {
      // best-effort
    }
  })().catch(() => {});
}

export function agentMemoryService(db: Db) {
  async function existingHashes(agentId: string): Promise<Set<string>> {
    const rows = await db
      .select({ contentHash: agentMemories.contentHash })
      .from(agentMemories)
      .where(eq(agentMemories.agentId, agentId));
    return new Set(rows.map((r) => r.contentHash));
  }

  async function insertRow(input: {
    companyId: string;
    agentId: string;
    kind: string;
    text: string;
    houseNumber?: number | null;
    occurredAt?: Date | null;
    metadata?: Record<string, unknown>;
  }): Promise<MemoryRow | null> {
    const hash = contentHashForMemory(input.kind, input.text);
    const dupe = await db
      .select({ id: agentMemories.id })
      .from(agentMemories)
      .where(and(eq(agentMemories.agentId, input.agentId), eq(agentMemories.contentHash, hash)))
      .limit(1);
    if (dupe.length > 0) return null;
    const [row] = await db
      .insert(agentMemories)
      .values({
        companyId: input.companyId,
        agentId: input.agentId,
        kind: input.kind,
        houseNumber: input.houseNumber ?? null,
        occurredAt: input.occurredAt ?? null,
        text: input.text,
        contentHash: hash,
        metadata: input.metadata ?? {},
      })
      .returning();
    if (row) embedAndFill(db, row.id, row.text);
    return row ?? null;
  }

  return {
    tableAvailable: () => tableExists(db),

    /** Append-only day entry / fact. Returns null when identical row exists. */
    async appendEntry(input: {
      companyId: string;
      agentId: string;
      kind: "day_entry" | "fact";
      text: string;
      occurredAt?: Date | null;
      metadata?: Record<string, unknown>;
    }) {
      return insertRow(input);
    },

    /** Rewrite [[Self]] — replaces the live self row (history stays in day rows). */
    async upsertSelf(input: { companyId: string; agentId: string; text: string }) {
      const existing = await db
        .select({ id: agentMemories.id })
        .from(agentMemories)
        .where(
          and(
            eq(agentMemories.agentId, input.agentId),
            eq(agentMemories.kind, "self"),
          ),
        )
        .orderBy(desc(agentMemories.createdAt))
        .limit(1);
      const hash = contentHashForMemory("self", input.text);
      if (existing.length > 0) {
        const [row] = await db
          .update(agentMemories)
          .set({ text: input.text, contentHash: hash, embedding: null, embeddingModel: null, updatedAt: new Date() })
          .where(eq(agentMemories.id, existing[0].id))
          .returning();
        if (row) embedAndFill(db, row.id, row.text);
        return row ?? null;
      }
      return insertRow({ ...input, kind: "self" });
    },

    /** Rewrite house lines — one live row per house number. */
    async upsertHouses(input: {
      companyId: string;
      agentId: string;
      houses: Array<{ n: number; text: string }>;
    }) {
      const out: MemoryRow[] = [];
      for (const house of input.houses) {
        if (!Number.isInteger(house.n) || house.n < 1 || house.n > 12) continue;
        const existing = await db
          .select({ id: agentMemories.id })
          .from(agentMemories)
          .where(
            and(
              eq(agentMemories.agentId, input.agentId),
              eq(agentMemories.kind, "house"),
              eq(agentMemories.houseNumber, house.n),
            ),
          )
          .orderBy(desc(agentMemories.createdAt))
          .limit(1);
        const hash = contentHashForMemory("house", house.text);
        if (existing.length > 0) {
          const [row] = await db
            .update(agentMemories)
            .set({
              text: house.text,
              contentHash: hash,
              embedding: null,
              embeddingModel: null,
              updatedAt: new Date(),
            })
            .where(eq(agentMemories.id, existing[0].id))
            .returning();
          if (row) {
            embedAndFill(db, row.id, row.text);
            out.push(row);
          }
          continue;
        }
        const row = await insertRow({
          companyId: input.companyId,
          agentId: input.agentId,
          kind: "house",
          text: house.text,
          houseNumber: house.n,
          metadata: { house: house.n },
        });
        if (row) out.push(row);
      }
      return out;
    },

    /** Write a standing stop-rule (pinned, first-class retrieval). Supersedes retires old doctrine. */
    async upsertRule(input: {
      companyId: string;
      agentId: string;
      text: string;
      priority?: number;
      supersedes?: string;
    }) {
      if (input.supersedes) {
        try {
          await db
            .update(agentMemories)
            .set({ pinned: false, updatedAt: new Date() })
            .where(and(eq(agentMemories.id, input.supersedes), eq(agentMemories.agentId, input.agentId)));
        } catch {
          // best-effort revoke
        }
      }
      const row = await insertRow({
        companyId: input.companyId,
        agentId: input.agentId,
        kind: "stop_rule",
        text: input.text,
        metadata: input.supersedes ? { supersedes: input.supersedes } : {},
      });
      if (!row) return null;
      const [pinned] = await db
        .update(agentMemories)
        .set({
          pinned: true,
          priority: Math.max(0, Math.min(100, input.priority ?? 50)),
          updatedAt: new Date(),
        })
        .where(eq(agentMemories.id, row.id))
        .returning();
      if (pinned) embedAndFill(db, pinned.id, pinned.text);
      return pinned ?? row;
    },

    /** Active pinned rules, most query-relevant first (own bucket — never score-competes). */
    async activeRules(input: { companyId: string; agentId: string; query: string; limit?: number }) {
      const rows = await db
        .select()
        .from(agentMemories)
        .where(
          and(
            eq(agentMemories.companyId, input.companyId),
            eq(agentMemories.agentId, input.agentId),
            eq(agentMemories.kind, "stop_rule"),
            eq(agentMemories.pinned, true),
          ),
        )
        .orderBy(desc(agentMemories.priority), desc(agentMemories.createdAt))
        .limit(20);
      const queryWords = new Set(
        String(input.query ?? "")
          .toLowerCase()
          .split(/[^a-z0-9]+/)
          .filter((w) => w.length >= 4),
      );
      const ranked = rows
        .map((row) => {
          const textWords = new Set(
            row.text
              .toLowerCase()
              .split(/[^a-z0-9]+/)
              .filter((w) => w.length >= 4),
          );
          let overlap = 0;
          for (const w of queryWords) if (textWords.has(w)) overlap += 1;
          return { row, overlap };
        })
        .sort((a, b) => b.overlap - a.overlap || b.row.priority - a.row.priority)
        .slice(0, Math.max(1, Math.min(5, input.limit ?? 3)));
      return ranked.map(({ row }) => ({
        id: row.id,
        text: row.text.length > 600 ? `${row.text.slice(0, 600)}…` : row.text,
        priority: row.priority,
      }));
    },

    /** Record that a UTC day was distilled into Self (prune gate input). */
    async recordDistilled(input: { companyId: string; agentId: string; date: string }) {
      return insertRow({
        ...input,
        kind: "distilled",
        text: `distilled: ${input.date}`,
        occurredAt: new Date(`${input.date}T00:00:00.000Z`),
        metadata: { date: input.date },
      });
    },

    /** Hybrid search: vector cosine blended with recency; FTS when unembedded. */
    async search(input: {
      companyId: string;
      agentId: string;
      query: string;
      kinds?: string[];
      limit?: number;
      maxChars?: number;
    }): Promise<Array<{
      id: string;
      kind: string;
      text: string;
      score: number;
      createdAt: string | null;
      metadata: Record<string, unknown>;
    }>> {
      const k = Math.max(1, Math.min(50, input.limit ?? 8));
      const maxChars = Math.max(100, Math.min(4000, input.maxChars ?? 1200));
      const kinds = (input.kinds ?? []).filter((kind) =>
        ["self", "house", "day_entry", "distilled", "fact", "stop_rule"].includes(kind),
      );
      const kindFilter =
        kinds.length > 0
          ? sql`AND kind = ANY(${kinds})`
          : sql``;
      const trim = (text: string) => (text.length > maxChars ? `${text.slice(0, maxChars)}…` : text);

      const embedded = await embedText(input.query).catch(() => null);
      if (embedded) {
        const literal = `[${embedded.vector.join(",")}]`;
        const rows = (await db.execute(sql`
          SELECT id, kind, house_number, occurred_at, text, metadata, created_at,
                 (embedding <=> ${literal}::vector) AS distance
          FROM agent_memories
          WHERE company_id = ${input.companyId} AND agent_id = ${input.agentId}
            AND embedding IS NOT NULL
            ${kindFilter}
          ORDER BY embedding <=> ${literal}::vector
          LIMIT ${Math.min(50, k * 4)}
        `)) as unknown as Array<Record<string, unknown>>;
        const now = Date.now();
        return rows
          .map((row) => {
            const distance = typeof row.distance === "number" ? row.distance : 1;
            const created = row.created_at ? new Date(String(row.created_at)).getTime() : now;
            const ageDays = Number.isFinite(created) ? Math.max(0, (now - created) / 86400000) : 30;
            const score = 0.75 * (1 - Math.min(2, Math.max(0, distance)) / 2) + 0.25 * (1 / (1 + ageDays / 7));
            return {
              id: String(row.id),
              kind: String(row.kind),
              text: trim(String(row.text ?? "")),
              score: Math.round(score * 1000) / 1000,
              createdAt: row.created_at ? String(row.created_at) : null,
              metadata: (row.metadata ?? {}) as Record<string, unknown>,
            };
          })
          .sort((a, b) => b.score - a.score)
          .slice(0, k);
      }

      // Lexical fallback — also the path for rows never embedded.
      const rows = (await db.execute(sql`
        SELECT id, kind, house_number, occurred_at, text, metadata, created_at,
               ts_rank_cd(to_tsvector('english', text), plainto_tsquery('english', ${input.query})) AS rank
        FROM agent_memories
        WHERE company_id = ${input.companyId} AND agent_id = ${input.agentId}
          AND to_tsvector('english', text) @@ plainto_tsquery('english', ${input.query})
          ${kindFilter}
        ORDER BY rank DESC, created_at DESC
        LIMIT ${k}
      `)) as unknown as Array<Record<string, unknown>>;
      return rows.map((row) => ({
        id: String(row.id),
        kind: String(row.kind),
        text: trim(String(row.text ?? "")),
        score: Math.round(Number(row.rank ?? 0) * 1000) / 1000,
        createdAt: row.created_at ? String(row.created_at) : null,
        metadata: (row.metadata ?? {}) as Record<string, unknown>,
      }));
    },

    /** Re-embed rows missing vectors or tagged with a stale strategy model. */
    async reembedPending(input: { companyId: string; agentId: string; limit?: number }) {
      const model = activeEmbeddingModel();
      if (!model) return { embedded: 0, skipped: 0, reason: "embeddings off under active strategy" };
      const batch = Math.max(1, Math.min(500, input.limit ?? 200));
      const rows = await db
        .select({ id: agentMemories.id, text: agentMemories.text, embeddingModel: agentMemories.embeddingModel })
        .from(agentMemories)
        .where(
          and(
            eq(agentMemories.companyId, input.companyId),
            eq(agentMemories.agentId, input.agentId),
            or(isNull(agentMemories.embedding), ne(agentMemories.embeddingModel, model)),
          ),
        )
        .limit(batch);
      let embedded = 0;
      for (const row of rows) {
        try {
          const result = await embedText(row.text);
          if (!result) continue;
          await db
            .update(agentMemories)
            .set({ embedding: result.vector, embeddingModel: result.model, updatedAt: new Date() })
            .where(eq(agentMemories.id, row.id));
          embedded += 1;
        } catch {
          // per-row best-effort
        }
      }
      return { embedded, skipped: rows.length - embedded };
    },

    /** Backfill DB rows from existing bundle files (Self/Houses/days). Idempotent. */
    async backfillFromFiles(input: {
      companyId: string;
      agentId: string;
      agentName: string;
      files: Record<string, string>;
    }): Promise<{ self: number; houses: number; entries: number; skipped: boolean }> {
      const kgEntry = Object.entries(input.files).find(([path]) => path.toLowerCase() === "knowledge_graph.md");
      if (!kgEntry) return { self: 0, houses: 0, entries: 0, skipped: true };
      const { parseDiaryRegions } = await import("./knowledge-graph-diary.js");
      const { selfBody, housesBody, daySections } = parseDiaryRegions(kgEntry[1]);
      const hashes = await existingHashes(input.agentId);
      let self = 0;
      let houses = 0;
      let entries = 0;
      const track = async (row: MemoryRow | null) => {
        if (row) {
          hashes.add(row.contentHash);
          return 1;
        }
        return 0;
      };
      const fresh = (kind: string, text: string) => !hashes.has(contentHashForMemory(kind, text));
      if (selfBody && selfBody.trim() && fresh("self", selfBody.trim())) {
        const row = await insertRow({
          companyId: input.companyId,
          agentId: input.agentId,
          kind: "self",
          text: selfBody.trim(),
          metadata: { source: "backfill" },
        });
        self += await track(row);
      }
      for (const house of KG_HOUSES) {
        const lineRe = new RegExp(`^-\\s*House\\s+${house.n}\\b[^\\n]*`, "im");
        const match = housesBody ? lineRe.exec(housesBody) : null;
        const text = (match ? match[0] : `- House ${house.n} — ${house.name}: ${house.domain}.`).trim();
        if (!fresh("house", text)) continue;
        const row = await insertRow({
          companyId: input.companyId,
          agentId: input.agentId,
          kind: "house",
          text,
          houseNumber: house.n,
          metadata: { house: house.n, source: "backfill" },
        });
        houses += await track(row);
      }
      for (const [date, body] of [...daySections.entries()].sort(([a], [b]) => (a < b ? -1 : 1))) {
        const occurredAt = new Date(`${date}T00:00:00.000Z`);
        for (const trimmed of parseDayBullets(body)) {
          if (!fresh("day_entry", trimmed)) continue;
          const row = await insertRow({
            companyId: input.companyId,
            agentId: input.agentId,
            kind: "day_entry",
            text: trimmed,
            occurredAt,
            metadata: { date, source: "backfill" },
          });
          entries += await track(row);
        }
      }
      return { self, houses, entries, skipped: false };
    },

    /** Render Self + Houses + day sections from DB rows for the refresh route. */
    async renderDiary(input: { companyId: string; agentId: string }): Promise<{
      hasRows: boolean;
      selfBody: string | null;
      housesBody: string | null;
      daySections: Map<string, string>;
      distilledDates: Set<string>;
    }> {
      const rows = await db
        .select()
        .from(agentMemories)
        .where(and(eq(agentMemories.companyId, input.companyId), eq(agentMemories.agentId, input.agentId)))
        .orderBy(desc(agentMemories.createdAt))
        .limit(2000);
      if (rows.length === 0) {
        return { hasRows: false, selfBody: null, housesBody: null, daySections: new Map(), distilledDates: new Set() };
      }
      // Latest row per (kind, house) wins for self/houses; day entries accumulate.
      // Rows arrive newest-first, so the first occurrence wins.
      let selfBody: string | null = null;
      const houseLines = new Map<number, string>();
      const daySections = new Map<string, string[]>();
      const distilledDates = new Set<string>();
      const seenHouses = new Set<number>();
      for (const row of rows) {
        if (row.kind === "self" && selfBody === null) {
          selfBody = row.text;
        } else if (row.kind === "house" && typeof row.houseNumber === "number" && !seenHouses.has(row.houseNumber)) {
          seenHouses.add(row.houseNumber);
          houseLines.set(row.houseNumber, row.text);
        }
      }
      for (const row of rows) {
        if (row.kind !== "day_entry") continue;
        const meta = (row.metadata ?? {}) as Record<string, unknown>;
        const date =
          (typeof meta.date === "string" && meta.date) ||
          (row.occurredAt ? new Date(row.occurredAt).toISOString().slice(0, 10) : null) ||
          new Date(row.createdAt).toISOString().slice(0, 10);
        const list = daySections.get(date) ?? [];
        list.push(row.text);
        daySections.set(date, list);
      }
      for (const row of rows) {
        if (row.kind !== "distilled") continue;
        const meta = (row.metadata ?? {}) as Record<string, unknown>;
        if (typeof meta.date === "string") distilledDates.add(meta.date);
      }
      let housesBody: string | null = null;
      if (houseLines.size > 0) {
        const lines = [
          "",
          "## Twelve Houses",
          "",
          "> Fixed life domains. Tag diary entries like `house: 6`.",
          "",
        ];
        for (const house of KG_HOUSES) {
          lines.push(houseLines.get(house.n) ?? `- House ${house.n} — ${house.name}: ${house.domain}.`);
        }
        housesBody = `${lines.join("\n")}\n`;
      }
      const dayMap = new Map<string, string>();
      for (const [date, lines] of daySections) {
        dayMap.set(date, `\n## ${date}\n\n${lines.join("\n")}\n`);
      }
      return { hasRows: true, selfBody, housesBody, daySections: dayMap, distilledDates };
    },
  };
}

export type AgentMemoryService = ReturnType<typeof agentMemoryService>;
