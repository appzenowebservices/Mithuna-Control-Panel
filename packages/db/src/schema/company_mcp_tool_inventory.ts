import { pgTable, uuid, text, timestamp, jsonb, uniqueIndex, index } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";

/**
 * Company-level MCP tool inventory cache. Populated from a provider's
 * `tools/list` (or an explicit manifest when the provider cannot be probed).
 * Skill preflight uses it to distinguish "tool is missing" from "inventory has
 * never been synced".
 */
export const companyMcpToolInventory = pgTable(
  "company_mcp_tool_inventory",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
    serverName: text("server_name").notNull(),
    tools: jsonb("tools").$type<string[]>().notNull().default([]),
    source: text("source").notNull().default("manual"),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyServerUniqueIdx: uniqueIndex("company_mcp_tool_inventory_company_server_idx").on(
      table.companyId,
      table.serverName,
    ),
    companyIdx: index("company_mcp_tool_inventory_company_idx").on(table.companyId),
  }),
);
