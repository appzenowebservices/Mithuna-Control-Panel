import {
  type AnyPgColumn,
  pgTable,
  uuid,
  text,
  integer,
  boolean,
  real,
  timestamp,
  jsonb,
  index,
} from "drizzle-orm/pg-core";
import { companies } from "./companies.js";
import { environments } from "./environments.js";

export const agents = pgTable(
  "agents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    teamId: uuid("team_id").references((): AnyPgColumn => teams.id),
    name: text("name").notNull(),
    role: text("role").notNull().default("general"),
    title: text("title"),
    icon: text("icon"),
    status: text("status").notNull().default("idle"),
    reportsTo: uuid("reports_to").references((): AnyPgColumn => agents.id),
    capabilities: text("capabilities"),
    adapterType: text("adapter_type").notNull().default("process"),
    adapterConfig: jsonb("adapter_config").$type<Record<string, unknown>>().notNull().default({}),
    runtimeConfig: jsonb("runtime_config").$type<Record<string, unknown>>().notNull().default({}),
    defaultEnvironmentId: uuid("default_environment_id").references(() => environments.id, { onDelete: "set null" }),
    budgetMonthlyCents: integer("budget_monthly_cents").notNull().default(0),
    spentMonthlyCents: integer("spent_monthly_cents").notNull().default(0),
    pauseReason: text("pause_reason"),
    pausedAt: timestamp("paused_at", { withTimezone: true }),
    errorReason: text("error_reason"),
    permissions: jsonb("permissions").$type<Record<string, unknown>>().notNull().default({}),
    lastHeartbeatAt: timestamp("last_heartbeat_at", { withTimezone: true }),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    // Astrology natal chart — the agent's "soul" computed at hire time.
    // These fields store the birth moment and the52-axis personality vectors
    // that shape the agent's SOUL.md via the astrology MCP server.
    natalBirthDateTime: timestamp("natal_birth_date_time", { withTimezone: true }),
    natalLatitude: real("natal_latitude"),
    natalLongitude: real("natal_longitude"),
    natalCoordinateSystem: text("natal_coordinate_system").default("SIDEREAL"),
    natalChartVectors: jsonb("natal_chart_vectors").$type<Record<string, number>>(),
    natalChartRaw: jsonb("natal_chart_raw").$type<Record<string, unknown>>(),
    soulEnabled: boolean("soul_enabled").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyStatusIdx: index("agents_company_status_idx").on(table.companyId, table.status),
    companyReportsToIdx: index("agents_company_reports_to_idx").on(table.companyId, table.reportsTo),
    companyDefaultEnvironmentIdx: index("agents_company_default_environment_idx").on(table.companyId, table.defaultEnvironmentId),
    companyTeamIdx: index("agents_company_team_idx").on(table.companyId, table.teamId),
  }),
);

import { teams } from "./teams.js";
