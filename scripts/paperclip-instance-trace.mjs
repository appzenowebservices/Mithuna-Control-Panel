#!/usr/bin/env node
/**
 * Paperclip instance flow tracer - adds pino-based logging to trace the agent → project → workspace flow.
 * 
 * Logs are written to stdout (colored) and to data/logs/server.log.
 */

console.log("\n========================================");
console.log("   PAPERCLIP INSTANCE FLOW TRACER");
console.log("========================================\n");

console.log("INSTANCE FOLDER STRUCTURE (instances/default):\n");
console.log("  projects/               Managed project workspaces");
console.log("  workspaces/             Agent working directories");
console.log("  runtime-services/       Runtime service registry (port->pid maps)");
console.log("  db/                     Embedded PGlite database files");
console.log("  logs/                   server.log, pino logs");
console.log("  data/storage/           File storage");
console.log("  data/backups/           Database backups");
console.log("  secrets/master.key        Encryption key\n");

console.log("WORKSPACE MODES:\n");
console.log("  shared_workspace    → uses project workspace directly (instances/default/projects/)");
console.log("  isolated_workspace  → creates git worktree (repo/.paperclip/worktrees/<branch>)\n");

console.log("LOG POINTS ADDED (pino structured logs):\n");

console.log("1. server/src/services/projects.ts:551");
console.log("   - 'projectService.createProject' on project creation");

console.log("\n2. server/src/services/execution-workspaces.ts:741");
console.log("   - 'executionWorkspaces.create' on workspace record creation");

console.log("\n3. server/src/services/workspace-runtime.ts:1226");
console.log("   - 'realizeExecutionWorkspace: provisioning git worktree workspace'");

console.log("\n4. server/src/services/workspace-runtime.ts:1272");
console.log("   - 'realizeExecutionWorkspace: resolved worktree location' (path, branch, repo)");

console.log("\n5. server/src/services/workspace-runtime.ts:1436");
console.log("   - 'realizeExecutionWorkspace: git worktree provisioned' (final path)");

console.log("\n6. server/src/services/workspace-runtime.ts:1455");
console.log("   - 'ensurePersistedExecutionWorkspaceAvailable: checking persisted workspace'");

console.log("\n----------------------------------------");
console.log("Watch logs with:\n");
console.log("  pnpm dev");
console.log("\n# In another terminal:");
console.log("  tail -f data/logs/server.log | grep -E 'realizeExecutionWorkspace|projectService'\n");
console.log("----------------------------------------\n");

console.log("FLOW CHAIN:");
console.log("  [Project] → codebase (repo + local folder)");
console.log("       ↓");
console.log("  [Agent] → connects via adapter (hermes_http)");
console.log("       ↓");
console.log("  [Issue] → creates execution workspace record");
console.log("       ↓");
console.log("  [Git Worktree] → cloned from project workspace");
console.log("       ↓");
console.log("  [Workspace] → agent works in this folder");
console.log("       ↓");
console.log("  [Runtime] → services (dev server, etc.) start here\n");