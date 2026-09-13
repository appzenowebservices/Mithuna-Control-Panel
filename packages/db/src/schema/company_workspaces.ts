import {
  boolean,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { companies } from "./companies.js";

export const companyWorkspaces = pgTable(
  "company_workspaces",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    sourceType: text("source_type").notNull().default("local_path"),
    cwd: text("cwd"),
    repoUrl: text("repo_url"),
    repoRef: text("repo_ref"),
    defaultRef: text("default_ref"),
    visibility: text("visibility").notNull().default("default"),
    setupCommand: text("setup_command"),
    cleanupCommand: text("cleanup_command"),
    sharedWorkspaceKey: text("shared_workspace_key"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    isPrimary: boolean("is_primary").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyIdx: index("company_workspaces_company_idx").on(table.companyId),
    companyPrimaryIdx: index("company_workspaces_company_primary_idx").on(table.companyId, table.isPrimary),
    companySourceTypeIdx: index("company_workspaces_company_source_type_idx").on(table.companyId, table.sourceType),
    companySharedKeyIdx: index("company_workspaces_company_shared_key_idx").on(table.companyId, table.sharedWorkspaceKey),
    companyRepoRefIdx: uniqueIndex("company_workspaces_company_repo_ref_idx").on(table.companyId, table.repoUrl, table.repoRef),
  }),
);
