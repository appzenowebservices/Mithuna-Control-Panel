import { createDb } from "../packages/db/src/index.js";
import { loadConfig } from "../server/src/config.js";

// Usage:
//   pnpm tsx scripts/delete-company.ts <companyId> [moreCompanyIds...]
//
// Deletes a company and every company-scoped row across the schema,
// in FK-safe order (children before parents — most FKs are RESTRICT,
// not cascade), inside a single transaction.
//
// Notes:
// - Run with the Paperclip server stopped (the heartbeat scheduler can
//   otherwise re-create rows mid-delete).
// - Instance-level tables (auth, plugins, plugin_config/state/namespaces,
//   environments, board_api_keys, instance_*, user_sidebar_preferences)
//   are left untouched.
// - DB rows only: stored artifacts on disk / S3 are not removed.
// - company_secret_versions has no company_id but cascades from
//   company_secrets; cli_auth_challenges self-heals via ON DELETE SET NULL.

const TABLES_BY_COMPANY_ID = [
  // Routines (leaves first)
  "routine_documents",
  "routine_runs",
  "routine_triggers",
  "routine_revisions",
  "routines",
  // Documents
  "document_annotation_anchor_snapshots",
  "document_annotation_comments",
  "document_annotation_threads",
  "document_revisions",
  "documents",
  // Issues (children first)
  "issue_tree_hold_members",
  "issue_tree_holds",
  "issue_approvals",
  "issue_documents",
  "issue_attachments",
  "issue_plan_decompositions",
  "issue_reference_mentions",
  "issue_recovery_actions",
  "issue_work_products",
  "issue_watchdogs",
  "issue_execution_decisions",
  "issue_labels",
  "issue_thread_interactions",
  "issue_comments",
  "issue_read_states",
  "issue_inbox_archives",
  "issue_relations",
  "feedback_exports",
  "feedback_votes",
  "external_object_mentions",
  "issues",
  // Projects / goals
  "project_goals",
  "project_memberships",
  "project_workspaces",
  "execution_workspaces",
  "projects",
  "goals",
  // Heartbeat runs (references agents / wakeup requests with RESTRICT)
  "heartbeat_run_events",
  "heartbeat_run_watchdog_decisions",
  "activity_log",
  "agent_task_sessions",
  "heartbeat_runs",
  // Approvals / budgets (reference agents with RESTRICT — before agents)
  "approval_comments",
  "budget_incidents",
  "approvals",
  "budget_policies",
  // Costs / finance (reference agents + runs + issues with RESTRICT)
  "finance_events",
  "cost_events",
  // Assets + joins (reference agents with RESTRICT)
  "company_logos",
  "join_requests",
  "assets",
  // Agents (children first)
  "agent_runtime_state",
  "agent_api_keys",
  "agent_wakeup_requests",
  "agent_config_revisions",
  "agent_memberships",
  "agents",
  // Workspaces / environments
  "workspace_operations",
  "workspace_runtime_services",
  "environment_leases",
  // Secrets (versions cascade from company_secrets)
  "secret_access_events",
  "company_secret_bindings",
  "company_secrets",
  "company_secret_provider_configs",
  // Access / membership
  "invites",
  "inbox_dismissals",
  "principal_permission_grants",
  "company_memberships",
  "company_user_sidebar_preferences",
  // Skills / teams
  "company_skill_comments",
  "company_skill_stars",
  "company_skill_versions",
  "company_skills",
  "team_skills",
  "teams",
  // Plugin company-scoped rows
  "plugin_logs",
  "plugin_webhook_deliveries",
  "plugin_job_runs",
  "plugin_entities",
  "plugin_managed_resources",
  "plugin_company_settings",
  // External objects / labels
  "external_objects",
  "labels",
];

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function main() {
  const companyIds = process.argv.slice(2).filter((arg) => arg.length > 0);
  if (companyIds.length === 0) {
    console.error("Usage: pnpm tsx scripts/delete-company.ts <companyId> [moreCompanyIds...]");
    process.exit(1);
  }
  for (const id of companyIds) {
    if (!UUID_PATTERN.test(id)) {
      console.error(`Not a valid uuid: ${id}`);
      process.exit(1);
    }
  }

  const config = loadConfig();
  const dbUrl =
    process.env.DATABASE_URL?.trim()
    || config.databaseUrl
    || `postgres://paperclip:paperclip@127.0.0.1:${config.embeddedPostgresPort}/paperclip`;

  const db = createDb(dbUrl);

  const idList = companyIds.map((id) => `'${id}'`).join(", ");

  const companyRows = await db.execute(
    `SELECT id, name, issue_prefix FROM companies WHERE id IN (${idList})`,
  ) as unknown as Array<{ id: string; name: string; issue_prefix: string }>;
  const companies = Array.isArray(companyRows) ? companyRows : [];

  if (companies.length !== companyIds.length) {
    const found = new Set(companies.map((c) => c.id));
    const missing = companyIds.filter((id) => !found.has(id));
    console.error(`Unknown company ids: ${missing.join(", ")}`);
    process.exit(1);
  }

  const summary: Array<{ table: string; rows: number }> = [];

  await db.transaction(async (tx) => {
    for (const table of TABLES_BY_COMPANY_ID) {
      const result = await tx.execute(
        `DELETE FROM "${table}" WHERE company_id IN (${idList})`,
      );
      const rows = Number((result as { count?: number | string | null }).count ?? 0);
      summary.push({ table, rows });
    }
    await tx.execute(`DELETE FROM companies WHERE id IN (${idList})`);
  });

  const totalRows = summary.reduce((sum, entry) => sum + entry.rows, 0);
  console.log(`Deleted ${totalRows} company-scoped rows across ${summary.length} tables:`);
  for (const entry of summary) {
    if (entry.rows > 0) console.log(`  ${entry.table}: ${entry.rows}`);
  }

  for (const company of companies) {
    console.log(`\nDeleted company: ${company.name} (${company.id}, prefix "${company.issue_prefix}")`);
  }
  console.log("\nDone!");
}

void main().catch((err) => {
  console.error("Script failed:", err);
  process.exit(1);
});
