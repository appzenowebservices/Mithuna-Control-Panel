import { pgTable, uuid, text, timestamp, jsonb, uniqueIndex, index } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";
import { agents } from "./agents.js";

// Durable Hermes runtime sessions. hermes_server.py keeps live sessions in
// process RAM (fast hot cache); after each completed turn it PUTs a snapshot
// here, and on process restart / new task session it GETs the snapshot back
// to rehydrate conversation history. One row per (company, agent, sessionId);
// rows older than the TTL are treated as expired and lazily deleted on read.
export const hermesSessions = pgTable(
  "hermes_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    agentId: uuid("agent_id").notNull().references(() => agents.id),
    sessionId: text("session_id").notNull(),
    snapshotJson: jsonb("snapshot_json").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyAgentSessionUniqueIdx: uniqueIndex("hermes_sessions_company_agent_session_uniq").on(
      table.companyId,
      table.agentId,
      table.sessionId,
    ),
    companyAgentUpdatedIdx: index("hermes_sessions_company_agent_updated_idx").on(
      table.companyId,
      table.agentId,
      table.updatedAt,
    ),
  }),
);
