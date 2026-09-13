# Synchronization Barrier

## Overview

The `workspace_finalize` synchronization barrier ensures dependent issues don't wake up and see stale workspace state after an adapter run.

## Problem

When multiple issues share an execution workspace:

1. Issue A executes and modifies files in a remote workspace
2. Changes are synced back to the local worktree after execution
3. Issue B (dependent on A) might wake up and read workspace state BEFORE the sync completes

## Solution

The heartbeat records `workspace_finalize=succeeded` only after `adapter.execute()` returns cleanly (meaning restore completed). Dependent issues check this barrier before:

- Accepting `request_confirmation` interactions
- Accepting `request_checkbox_confirmation` interactions
- Waking up due to blocker resolution

## Usage

```typescript
import { isWorkspaceFinalized, assertIssueWorkspaceFinalizedForAccept } from "./synchronization_Barrier/service.js";

// Check if workspace is finalized for a specific run
const isFinalized = await isWorkspaceFinalized(db, companyId, executionWorkspaceId, runId);

// Assert and throw if not finalized (used in issue interactions)
await assertIssueWorkspaceFinalizedForAccept(db, companyId, issueId, sourceRunId);
```

## Exports

| Function | Purpose |
|----------|---------|
| `recordWorkspaceFinalize()` | Records the finalize operation during adapter execution |
| `isWorkspaceFinalized()` | Checks if a workspace has been finalized for a specific run |
| `assertIssueWorkspaceFinalizedForAccept()` | Throws if workspace not finalized (used by interactions) |
| `listUnfinalizedExecutionWorkspaceIds()` | Lists workspaces that haven't been finalized |

## Related

- [Execution Workspaces and Runtime Services](../../paperclip/docs/guides/board-operator/execution-workspaces-and-runtime-services.md)
- [Creating an Adapter](../../paperclip/docs/adapters/creating-an-adapter.md)