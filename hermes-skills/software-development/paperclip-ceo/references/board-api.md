# Paperclip Board HTTP API — Field Notes (AppZeno / XXX-60 session)

Observed against the local dev server (`http://127.0.0.1:3100`, deployment mode
`local_trusted`). All endpoints are under the `api` prefix. JSON in, JSON out.

## Auth model

- `local_trusted` mode: **no auth required** — unauthenticated requests act as
  "Local Board" (`type: board`, instance admin). GET/PATCH/POST all work with
  plain curl. This is why the mutation flow is scriptable with curl.
- Board actor bypasses the agent-ownership mutation boundary:
  `assertAgentIssueMutationAllowed` in `routes/issues.ts` early-returns `true`
  for `req.actor.type !== "agent"` — so plain-curl `PATCH /api/issues/:id` works
  on issues assigned to ANY agent (no watchdog scope or checkout override needed).
- Agent-identity endpoints (`GET /api/agents/me`, `/api/agents/:id/skills`, the
  inbox routes) require `req.actor.agentId` and answer `"Agent authentication
  required"` under the board actor — you cannot identify yourself that way in
  `local_trusted`. Identify via `~/.paperclip/context.json` (companyId) plus
  `GET /api/companies/:CID/agents` (find your row by adapter/name).
- `authenticated` mode would require a `Bearer` board API key or agent API key
  (agent keys are matched by SHA-256 hash of the token). See
  `paperclip/server/src/middleware/auth.ts`.
- Context/profile lives in `~/.paperclip/context.json`:
  ```json
  { "version": 2, "currentProfile": "default",
    "profiles": { "default": { "apiBase": "http://localhost:3100", "companyId": "<uuid>" } } }
  ```

## Company state endpoints

| Endpoint | Notes |
|---|---|
| `GET /api/companies` | All companies: `name`, `status`, `issuePrefix`, `issueCounter` |
| `GET /api/companies/:companyId` | Single company; `issueCounter` = next issue number |
| `GET /api/companies/:companyId/goals` | Goals; note: no `milestones` field on the goal object itself |
| `GET /api/goals/:goalId` | Goal detail: `level`, `status`, `ownerAgentId` (often null) |
| `GET /api/companies/:companyId/projects` | Projects: `status` (planned/active), `leadAgentId`, `goalIds`, `urlKey` |
| `GET /api/projects/:projectId` | Project detail (the `/companies/:id/projects/:id` path 404s — use the flat one) |
| `GET /api/companies/:companyId/agents` | Agents: `name`, `role`, `status` (idle/running/paused), `reportsTo`, `adapterType`, `permissions.canCreateAgents`, `runtimeConfig.heartbeat`, `orgChainHealth` |
| `GET /api/companies/:companyId/teams` | Teams: `leadAgentId`, `agentCount` |
| `GET /api/companies/:companyId/issues` | Full issue list. Each row: `identifier` (XXX-N), `id` (UUID), `status`, `priority`, `assigneeAgentId`, `blockedByIssueIds`, `createdAt`. Query filters like `?key=XXX-61` are IGNORED — fetch the list and filter client-side by `identifier` |

## Issue detail + mutations

| Endpoint | Notes |
|---|---|
| `GET /api/issues/:uuid` | Detail — identifiers OR uuid both work (verified live 2026-08-12: `/api/issues/SDS-36` returned the full issue; the older "UUID only" note is stale). Same for comments/documents paths |
| `GET /api/issues/:uuid/comments` | Comment list (usually `[]` until someone posts) |
| `PATCH /api/issues/:uuid` | Accepts `status` AND `comment` together — verified 2026-08-11 (XXX-61): `{"status":"done","comment":"..."}` → 200 with `completedAt` set. Also accepts `assigneeAgentId` in the SAME call (verified 2026-08-11: `{"status":"todo","assigneeAgentId":"<uuid>","comment":"..."}` unblocked + reassigned XXX-63 in one PATCH; `updateIssueSchema` at `packages/shared/src/validators/issue.ts:450`). Unblocking an adapter-auto-blocked issue (`status: blocked` with `blockedBy: []`) is just a status PATCH — there is no separate unblock endpoint. The older "comment in PATCH body 500s" note is STALE; the real 500 trigger is a backslash in the body (keep bodies `\`-free, use forward slashes). Statuses: `todo`, `in_progress`, `blocked`, `in_review`, `done`, `cancelled`. Single-call close is preferred — it avoids the status-revert race of the old two-call pattern (see Closing-verification quirk). For a comment without a status change, `POST .../comments` — but see the comment-revert trap below. **PATCHing `assigneeAgentId` can 422 with `Assignee must belong to the project's team`** when the issue's project/team does not include the target agent (observed 2026-08-11: assigning CEO to XXX-12 Board Operations, a project-less standing issue). Standing concierge/decision-log issues may be unassignable by design — leave them unowned and note the attempt in the decision log instead of churning retries. |
| `POST /api/issues/:uuid/comments` | `{"body":"..."}` — works. **Comment bodies must NOT contain backslashes** (`\`): a `\` anywhere in the body (e.g. a Windows path `D:\Dev\agent`) 500s with `Internal server error`. Use forward slashes (`D:/Dev/agent`) or rephrase. **The trigger is a LITERAL backslash surviving into the PARSED body** — JSON escape syntax like `\"` in the raw file resolves to a plain `"` and is fine (verified 2026-08-11: a PATCH whose raw JSON contained the quoted phrase "mark done with the UX summary" succeeded). Validate with `json.load` + `"\\" in body` on the parsed comment, not raw-text grep on the file. **Also: long multi-line JSON bodies via `curl -d '...'` are fragile in bash (unterminated-quote EOF → truncated body → 500). Write the JSON to a temp file and use `--data-binary @file` — verified reliable for long disposition comments. **Even a temp JSON file can be invalid if authored with literal newlines inside string values (observed 2026-08-12 SDS-46: write_file emitted real newlines where `\n` was intended → `json.loads` fails with `Invalid control character`). Most robust: build the payload with Python `json.dumps(...)` and send via `urllib.request` in the same script — worked first try for the SDS-46 status+comment close PATCH.** |
| **ALL `--data-binary @file` POST/PATCH calls need `-H "Content-Type: application/json"`** | Without the header, curl sends `application/x-www-form-urlencoded`, the server's JSON body parser never runs, and `req.body` is undefined → misleading `400 {"error":"Validation error","details":[{"code":"invalid_type","expected":"object","received":"undefined","path":[],"message":"Required"}]}`. The error text looks like a schema problem; it's actually a missing header. Symptom pattern (observed XXX-84, 2026-08-11): create returns `identifier: null` / `id: null` → re-run with the header → full issue object. Fix is always: `curl -X POST "http://127.0.0.1:3100/api/..." -H "Content-Type: application/json" --data-binary @file.json` |
| `DELETE /api/issues/:uuid/comments/:commentId` | Soft-delete a comment (body empties, `deletedAt` set) — handy for removing a test/disposition comment posted by mistake. `PATCH` on a comment 500s (no update route) |
| `POST /api/companies/:companyId/issues` | Create. Body: `title`, `description`, `status`, `priority` (low/medium/high, default medium), `assigneeAgentId`, `goalId`, `projectId`, `parentId`, `blockedByIssueIds` (UUID array) |
| `POST /api/issues/:uuid/children` | Child issues (follow-ups) — `createChildIssueSchema` |
| `POST /api/companies/:companyId/agents` | Create agent — CEO has `canCreateAgents: true`; requires `adapterType` (`hermes_http`), `name`, optional `role`/`reportsTo`/`teamId`/`desiredSkills`. Blocked if company has `requireBoardApprovalForNewAgents` (then use `POST /api/companies/:companyId/agent-hires`) |
| `POST /api/companies/:companyId/agent-hires` | **Hire flow when `requireBoardApprovalForNewAgents: true`** (AppZeno is such a company — check `GET /api/companies/:cid`). Body = createAgentSchema + `sourceIssueIds[]`. Creates the agent with `status: pending_approval` + an `approval` record (returns both). `desiredSkills` go TOP-LEVEL (string keys like `paperclipai/paperclip/<slug>`, resolved from `GET /api/companies/:cid/skills`); server writes them into `adapterConfig.paperclipSkillSync` and auto-generates the agent api key. Then activate with `POST /api/agents/:id/approve` (board actor) — agent goes `pending_approval` → `idle` |
| `POST /api/companies/:companyId/teams` | Create team: `{name, description, leadAgentId?, color?: #hex, metadata?}`. Set lead later via `PATCH /api/companies/:companyId/teams/:teamId` |
| `GET /api/companies/:companyId/teams/:teamId/agents` | List agents in a team |
| `GET /api/teams/catalog` | Team templates (bundled + optional). As of 2026-08-11 there is NO marketing template — closest is `paperclipai:optional:content:content-machine` (content ops, 1 agent). Build a marketing team manually (team + agent-hires) |
| `GET /api/companies/:cid/skills` | Company skill catalog; `key` field (e.g. `paperclipai/paperclip/xurl`) is what `desiredSkills` accepts |
| Roles: `ceo cto cmo cfo security engineer designer pm qa devops researcher general`; icons incl. `target`, `rocket`, `zap`, `sparkles`, `megaphone`-like set in `AGENT_ICON_NAMES` |

## Issue documents (decision log)

The Board Operations decision log is an **issue document** — not auto-created.
Until a run PUTs it, `GET /api/issues/:id/documents` returns `[]` (404 on the
keyed GET).

- `GET /api/issues/:id/documents` — list docs (empty array = log not created yet).
- `GET /api/issues/:id/documents/decision-log` — doc with `body`,
  `latestRevisionId`, `latestRevisionNumber`, `title`.
- `PUT /api/issues/:id/documents/:key` — upsert. Body schema
  (`upsertIssueDocumentSchema`, `packages/shared/src/validators/issue.ts:985`):
  `{title?: string, format: "markdown", body: string, changeSummary?: string,
  baseRevisionId?: uuid}`. `format` enum is `["markdown"]`.
- **409 Conflict pitfall**: a plain PUT (no `baseRevisionId`) on an EXISTING
  document 409s for non-agent actors (board actor uses `lockedDocumentStrategy:
  "conflict"`, agents get `"create_new_document"`). This bit 2026-08-11 when a
  parallel run created the log between my GET (empty) and PUT. Fix: GET the doc,
  copy `latestRevisionId`, re-PUT with `baseRevisionId` and
  `body = existing.body + "\n" + new_section` to APPEND a revision — verify
  `latestRevisionNumber` incremented in the response. Never blind-overwrite an
  existing log (clobbers the other run's decisions). Full race timeline:
  `references/parallel-run-reconciliation.md`.

## Route mounting map (why some paths 404)

Not all routes are company-prefixed. The mount table lives in
`paperclip/server/src/app.ts`:

- `app.use("/api", api)` — everything is under the `api` prefix.
- `api.use("/companies", companyRoutes(...))` — **company-scoped** routes
  (`/api/companies/:companyId/agents`, `/issues`, `/goals`, ...).
- `api.use(issueRoutes(...))`, `api.use(goalRoutes(...))`, etc. — mounted
  **directly** on `api`, i.e. flat paths: `/api/issues/:id`, `/api/issues/:id/comments`,
  `/api/goals/:id`.

Consequence: `POST /api/companies/:companyId/issues/:id/comments` → `{"error":"API
route not found"}`. The correct path is the flat `/api/issues/:id/comments`.
Same for goals (`/api/goals/:id`, not company-prefixed).

When any route 404s with "API route not found", don't guess the prefix — grep
`paperclip/server/src/app.ts` for `api.use(...)` to see which router owns the
path and whether it's mounted under `/companies` or flat. **Faster first probe:
hit the flat route you suspect and read the 400 error body** — the server names
the correct mount, e.g. `GET /api/issues` → `{"error":"Missing companyId in
path. Use /api/companies/{companyId}/issues."}` (observed 2026-08-11). Use that
hint before grepping source. To find the exact endpoint + handler, grep the
route files directly:
`search_files(pattern="router\\.(get|post|patch|put|delete)\\(", path="paperclip/server/src/routes")`
and match by path shape (`/issues/:id`, `/issues/:id/comments`, ...).

## Resolving an issue's workspace to a real directory

Issues carry `projectWorkspaceId` (a UUID) but no filesystem path. Resolve it via
the project detail endpoint:

1. `GET /api/companies/:companyId/issues` → find the issue, take `projectId` + `projectWorkspaceId`.
2. `GET /api/projects/:projectId` → the response has a `codebase` object
   (`workspaceId`, `repoUrl`, `localFolder`, `managedFolder`, `effectiveLocalFolder`)
   and a `workspaces[]` array (each with `cwd`). The entry whose `id` matches the
   issue's `projectWorkspaceId` is the one to work in; `codebase.effectiveLocalFolder`
   is the authoritative local path (e.g. `D:\Dev\agent` for the AppZeno `agent` repo).
3. Verify with `git remote -v` in that folder — the configured remote may differ
   from `codebase.repoUrl` (AppZeno's project says `web.git` but the actual repo
   remote is `agent.git`). Trust the local folder over the recorded repoUrl.

## Closing-verification quirk

The status-revert was observed with the OLD two-call pattern (`PATCH {"status":"done"}`
then a separate `POST .../comments`) — the comment POST reset status back to
`todo`. The single-call close (`PATCH {"status":"done","comment":"..."}`) avoids
the race (XXX-61, 2026-08-11: returned `done` + `completedAt` in one response).
The reverse order (comment POST first, then `PATCH {"status":"done"}`) also works —
used successfully to re-close XXX-61; the unsafe order is specifically PATCH-then-comment.
Regardless of pattern, re-`GET` the issue after closing and confirm `status: done`
and `completedAt` is set before reporting the issue closed.

**Even a single-call close is not safe from a LATER standalone comment POST.**
XXX-72 (2026-08-11): closed `done` by a parallel wake via single-call PATCH, then a
CEO verification `POST /comments` (no status in body) reverted it to `todo`
(completedAt cleared). The comment route resets status on ANY comment POST, not just
in the old two-call sequence. If you must add a note to an issue you expect to remain
`done`, do it in the SAME single-call `PATCH {"status":"done","comment":"..."}` —
never as a separate POST after the close. If you already reverted one, re-close with
the single-call PATCH and confirm `completedAt` in the response.

**Documented-done vs board-todo mismatch (verification-pass trigger, 2026-08-11 XXX-78/79).** A disposition comment AND the decision log can both say "XXX-79 is done" while the board never held it — `status: todo`, `completedAt: null`. Likely cause: the closing run PATCHed done, posted its closing comment separately, the comment re-opened the issue to `todo`, and the run ended without re-closing. When a verification wake finds this, fix in the safe order: (1) verify the disposition's claims first (git-level: `git show <commit>:<file> | wc -lc` against the EXACT cited commit — a claimed "195 lines / 11,091 bytes" matched `f83e07af` byte-for-byte while HEAD/working tree differed); (2) close LAST with the single-call `PATCH {"status":"done","comment":"<reconciliation note>"}`; (3) confirm `completedAt` set in the response AND on a follow-up GET — GET-only after, no further comment POSTs (each reopens). The PATCH must always be the final mutation.

**Document PUTs (decision log) require `baseRevisionId`.** `GET
/api/issues/:id/documents/decision-log` returns `latestRevisionId` (the 409 error
text misleadingly calls it `currentRevisionId`); pass it as `baseRevisionId` in the
PUT body along with `{title, key, format, body}` or the update 409s. Revision bumps
per successful PUT (observed rev 2 -> 3).

## Create-issue schema (key fields)

```json
{
  "title": "string (required)",
  "description": "markdown, optional",
  "status": "todo | in_progress | blocked | in_review | done | cancelled",
  "priority": "low | medium | high",
  "assigneeAgentId": "uuid or null",
  "goalId": "uuid or null",
  "projectId": "uuid or null",
  "parentId": "uuid or null",
  "blockedByIssueIds": ["uuid"]
}
```

## Watchdog / productivity-review issues

- Generated automatically ("Paperclip detected an unusual productivity/progression
  pattern..."). Source issue is linked in the description (`[XXX-6](/XXX/issues/XXX-6)`).
- Evidence block fields: `Total sampled issue-linked runs`, `No-comment completed-run streak`,
  `Current active elapsed time`, `Cost events total`, `Runs in rolling windows`.
- Distinguish real churn (high cost events, high run counts) from noise (0 cost,
  streak of 1, long-active-duration on a duplicate/standing issue). Close with a
  disposition comment rather than spawning new engineering work.

## Observed state at review time (AppZeno, 2026-08-11)

- Company `91fab276-9efc-4f5e-b7dd-5db1d5e2d03a` — "AppZeno", prefix XXX, counter 60.
- Agents: CEO `babac997-69fe-4807-b2db-0c2a2de3826c` (running, canCreateAgents), CTO `a7e18461-999c-4bf3-a04c-20a39c8e960b` (idle, hermes_http).
- Goal `5e07189b-8d0e-496f-a194-5de4a3c08305` — client delivery business; owner null.
- 55 issues: 46 blocked duplicate "Strategic Review" (XXX-13..XXX-59), XXX-6 in_progress, XXX-60 in_progress (current), XXX-12 Board Operations (todo, no comments yet = empty decision log), XXX-5 "Create a new agent" placeholder (unassigned), XXX-9/XXX-11 watchdog reviews.
- `hermes issue` is NOT a valid hermes CLI subcommand; paperclip board ops go through the paperclip API.

## Tooling notes

- `paperclipai` CLI (in `paperclip/cli`, bin `paperclipai` → `dist/index.js`) may fail with `ERR_MODULE_NOT_FOUND` because dist references `packages/shared/src/adapter-type.js` which doesn't exist (source is `.ts`). Don't burn time building it — curl the API.
- `hermes_server.py` in the repo root is the Hermes-side HTTP adapter for paperclip agents.
