# Work-product registration (verified SDS-38, 2026-08-12)

The heartbeat procedure mandates registering deliverables as work products —
"a bare file path in a comment is NOT a completion path." The paperclip
skill's Step-8 example shape does NOT validate on this server; the working
shape below does. Both observations verified live on the Astrologics board.

## Failing shape (per the paperclip skill's Step 8)

```json
POST /api/issues/<issueId>/work-products
{
  "type": "artifact",
  "provider": "paperclip",
  "title": "...",
  "summary": "...",
  "metadata": { "resourceRef": { "kind": "workspace_file", "path": "docs/x.md" } }
}
```

→ `400 Validation error` or `400 Invalid attachment artifact metadata`
(requires `attachmentId` for artifact-type products; bare `path` resourceRef
rejected — `workspaceKind`/`workspaceId`/`relativePath`/`displayPath` all
"Required").

## Working shape (document + workspace provider)

```json
POST /api/issues/<issueId>/work-products
Headers: X-Paperclip-Run-Id: $PAPERCLIP_RUN_ID
{
  "type": "document",
  "provider": "workspace",
  "title": "Human title of the deliverable",
  "status": "ready_for_review",
  "reviewState": "needs_board_review",
  "summary": "One-line summary.",
  "metadata": {
    "resourceRef": {
      "kind": "workspace_file",
      "workspaceKind": "execution_workspace",
      "workspaceId": "<from issue>",
      "relativePath": "docs/astrologics-sample-reading.md",
      "displayPath": "docs/astrologics-sample-reading.md"
    }
  }
}
```

→ 200 with the work-product object (id, companyId, projectId, issueId, ...).

## Git-provider variant + no-workspace fallback (verified SDS-54, 2026-08-13)

`provider: "git"` (instead of `"workspace"`) also validates, and is the
convention SDS-53 used for a committed docs deliverable:

```json
{
  "type": "document",
  "provider": "git",
  "title": "Astrologics consultation SDS-54 — natal chart + transits (wealth focus)",
  "summary": "Committed in a0c52787 (SDS-54). ...",
  "metadata": {
    "resourceRef": {
      "kind": "workspace_file",
      "workspaceKind": "execution_workspace",
      "workspaceId": "01416c47-4001-41d0-976c-2340e9260363",
      "relativePath": "docs/astrologics-consultation-sds54.md",
      "displayPath": "docs/astrologics-consultation-sds54.md"
    }
  }
}
```

→ 200, returned product `status: active` (the `status: "ready_for_review"` /
`reviewState` fields in the workspace-provider shape above are OPTIONAL — a
body without them registers fine).

Key: SDS-54's own issue had NO workspace (`currentExecutionWorkspace: {}`,
`executionWorkspaceId: null`) — the workspaceId above was copied from a
SIBLING issue's existing work product (SDS-53's). The company-shared
execution workspace (Astrologics: `01416c47-4001-41d0-976c-2340e9260363`)
is reusable across issues in the same company; the resourceRef is a pointer
to the committed repo path, so workspaceId identity matters less than the
commit hash cited in the evidence comment.

## Default convention (from SDS-56, 2026-08-14): company execution workspace

Deliverable artifacts now live in the **company execution workspace** (a local
git repo at `homeGround`), per-issue folder `SDS/artifacts/<SDS-NN>/`. This is
the default; the empty-dir/no-workspace fallback above applies only when the
workspace has not been set up yet.

```json
POST /api/issues/<issueId>/work-products
{
  "type": "document",
  "provider": "git",
  "title": "Astrologics consultation SDS-56 - ...",
  "summary": "Committed in <hash> in the company execution workspace (SDS-56). ...",
  "metadata": {
    "resourceRef": {
      "kind": "workspace_file",
      "workspaceKind": "execution_workspace",
      "workspaceId": "e07b53e0-a6de-4430-89a5-fb4069cc90be",
      "relativePath": "SDS/artifacts/SDS-56/astrologics-consultation-sds56.md",
      "displayPath": "SDS/artifacts/SDS-56/astrologics-consultation-sds56.md"
    }
  }
}
```

- `workspaceId` `e07b53e0-a6de-4430-89a5-fb4069cc90be` = Astrologics company
  workspace `homeGround` — verified as the realized run cwd in heartbeat
  snapshots (`PAPERCLIP_WORKSPACE_CWD`). No sibling-workspace copying needed.
- The record file + compute outputs are committed in that workspace repo; the
  **commit hash cited in the close comment is the authoritative locator**,
  same role the docs-in-repo hash used to play.
- `repoUrl` on the workspace is currently unset (local-only git). When a remote
  is attached, board `promotions` (`POST /companies/<companyId>/workspaces/
  <workspaceId>/promotions`) can PR the approved files.

## Retry-wake closeout sequence (SDS-54, 2026-08-13)

When a wake arrives on an issue whose original run failed on infra but the
deliverable is already committed + delivered as a comment (retry run is the
wake): (1) verify the commit exists and the doc carries the required content
markers; (2) register the work product mirroring the sibling issue's
convention (git provider, shared workspaceId); (3) close with a BARE
`PATCH {"status":"done"}` — no comment — because the failed original run
makes any close comment a deferred_comment_wake reopen trigger (SDS-41
pitfall). GET-only after; do not post a confirmation comment.

## Where the workspaceId comes from

- `GET /api/issues/<issueId>` → `currentExecutionWorkspace.id` (or the flat
  `executionWorkspaceId` field). Do NOT assume project workspaces exist —
  `GET /api/projects/<projectId>/workspaces` can return `[]` and
  `/api/issues/<id>/workspaces` / company `/workspaces` are NOT routes. The
  company execution workspace is `GET /api/companies/<companyId>/workspaces`
  → the realized `homeGround` entry (Astrologics = `e07b53e0-a6de-4430-89a5-fb4069cc90be`).
- `relativePath` is relative to the workspace root. Under the new convention it
  is `SDS/artifacts/<SDS-NN>/...` in the company execution workspace (itself a
  local git repo). Legacy repo deliverables committed in the shared workspace
  repo (e.g. `D:\Dev\agent`) use the repo-relative path (`docs/...`). The
  commit hash in the final comment remains the authoritative locator either way.

## Verification

- `GET /api/issues/<issueId>/work-products` → your entries present.
- Link the registered product in the final evidence comment (titles or ids)
  before the status PATCH, and cite the commit hash — the hash is the
  authoritative locator for workspace-repo artifacts.
