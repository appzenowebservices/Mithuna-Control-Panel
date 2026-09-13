import {
  type AnyPgColumn,
  pgTable,
  uuid,
  text,
  integer,
  boolean,
  timestamp,
  jsonb,
  index,
  customType,
} from "drizzle-orm/pg-core";
import { companies } from "./companies.js";
import { agents } from "./agents.js";

// pgvector embedding column. Drizzle has no native vector type, so we map
// number[] <-> "[0.1,0.2,...]". The migration creates the `vector` extension
// conditionally (Supabase ships pgvector; hosts without it skip the whole
// agent_memories table and the app falls back to file-backed diary + FTS).
// Fixed 768 dims (Ollama nomic-embed-text; OpenAI text-embedding-3-small
// with Matryoshka `dimensions: 768`).
export const embeddingVector = customType<{ data: number[]; driverData: string }>({
  dataType() {
    return "vector(768)";
  },
  toDriver(value: number[]) {
    return `[${value.join(",")}]`;
  },
  fromDriver(value: unknown) {
    if (typeof value !== "string") return [];
    const inner = value.startsWith("[") && value.endsWith("]") ? value.slice(1, -1) : value;
    if (!inner.trim()) return [];
    return inner.split(",").map((part) => Number(part)).filter((n) => Number.isFinite(n));
  },
});

export const agentMemoryKinds = ["self", "house", "day_entry", "distilled", "fact", "stop_rule"] as const;
export type AgentMemoryKind = (typeof agentMemoryKinds)[number];

export const agentMemories = pgTable(
  "agent_memories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    agentId: uuid("agent_id")
      .notNull()
      .references(() => agents.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    // house number 1-12 when kind = "house", else null.
    houseNumber: integer("house_number"),
    // UTC day (midnight) this memory belongs to, for day_entry/distilled rows.
    occurredAt: timestamp("occurred_at", { withTimezone: true }),
    text: text("text").notNull(),
    // sha256(kind + "\n" + text) — makes writes idempotent per agent.
    contentHash: text("content_hash").notNull(),
    // { issueIds, runId, distilledDates, source } — free-form provenance.
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    embedding: embeddingVector("embedding"),
    // e.g. "nomic-embed-text" | "text-embedding-3-small@768". Null = not embedded yet.
    embeddingModel: text("embedding_model"),
    // Rule salience: stop_rule rows sort by priority desc; pinned rows are
    // always retrieved first in their own bucket. supersedes links a rule
    // version to the row it retires (stale doctrine dies explicitly).
    priority: integer("priority").notNull().default(0),
    pinned: boolean("pinned").notNull().default(false),
    supersedes: uuid("supersedes").references((): AnyPgColumn => agentMemories.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyAgentKindCreatedIdx: index("agent_memories_company_agent_kind_created_idx").on(
      table.companyId,
      table.agentId,
      table.kind,
      table.createdAt,
    ),
    agentOccurredIdx: index("agent_memories_agent_occurred_idx").on(table.agentId, table.occurredAt),
    agentHashIdx: index("agent_memories_agent_hash_idx").on(table.agentId, table.contentHash),
  }),
);
