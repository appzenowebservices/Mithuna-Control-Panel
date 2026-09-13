import { createDb } from "../packages/db/src/index.js";
import { loadConfig } from "../server/src/config.js";

async function main() {
  const config = loadConfig();
  const dbUrl =
    process.env.DATABASE_URL?.trim()
    || config.databaseUrl
    || `postgres://paperclip:paperclip@127.0.0.1:${config.embeddedPostgresPort}/paperclip`;

  const db = createDb(dbUrl);

  console.log("Deleting all non-company/user/auth data...");

  // Delete in reverse FK order to avoid constraint violations
  // PGlite doesn't support TRUNCATE TABLE IF EXISTS, so we use DELETE
  const tablesToDelete = [
    // Routines related (leaf tables first)
    "routine_runs",
    "routine_triggers",
    "routine_revisions",
    "routines",
    // Issues related
    "issue_read_states",
    "issue_inbox_archives",
    "issue_execution_decisions",
    "issue_tree_hold_members",
    "issue_tree_holds",
    "issue_thread_interactions",
    "issue_labels",
    "issue_documents",
    "issue_attachments",
    "issue_recovery_actions",
    "issue_plan_decompositions",
    "issue_reference_mentions",
    "issue_watchdogs",
    "issue_comments",
    "issue_approvals",
    "issues",
    // Projects reference goals - delete projects first
    "project_goals",
    "project_memberships",
    "project_workspaces",
    "projects",
    // Goals
    "goals",
    // Agents - deps: activity_log, heartbeat_runs (via wakeup_request_id)
    "heartbeat_runs",
    "heartbeat_run_events",
    "heartbeat_run_watchdog_decisions",
    "agent_runtime_state",
    "agent_task_sessions",
    "agent_wakeup_requests",
    "agent_memberships",
    "agent_api_keys",
    "agents",
    // Heartbeat runs deps
    "activity_log",
    // Other company-scoped
    "approvals",
    "approval_comments",
    "cost_events",
    "finance_events",
    "labels",
    "feedback_votes",
    "feedback_exports",
    "issue_work_products",
    "assets",
    "workspace_operations",
    "workspace_runtime_services",
    "environment_leases",
    "environments",
    "execution_workspaces",
    "join_requests",
    "invites",
    "budget_incidents",
    "budget_policies",
    "company_user_sidebar_preferences",
    "company_memberships",
    "secret_access_events",
    "company_secret_versions",
    "company_secret_bindings",
    "company_secrets",
    "company_secret_provider_configs",
    "principal_permission_grants",
    "plugin_logs",
    "plugin_webhook_deliveries",
    "plugin_job_runs",
    "plugin_jobs",
    "plugin_migrations",
    "plugin_database_namespaces",
    "plugin_entities",
    "plugin_state",
    "plugin_company_settings",
    "plugin_config",
    "plugins",
    "company_skills",
    "teams",
    "company_logos",
    "instance_user_roles",
    "instance_settings",
    "inbox_dismissals",
    "external_object_mentions",
    "external_objects",
    "document_annotation_anchor_snapshots",
    "document_annotation_comments",
    "document_annotation_threads",
    "document_revisions",
    "documents",
    "routine_documents",
  ];

  for (const table of tablesToDelete) {
    try {
      await db.execute(`DELETE FROM "${table}"`);
      console.log(`Deleted: ${table}`);
    } catch (err) {
      console.error(`Error deleting ${table}:`, err);
    }
  }

  console.log("\nKeeping tables: companies, user, session, account, verification");
  console.log("Done!");
}

void main().catch((err) => {
  console.error("Script failed:", err);
  process.exit(1);
});