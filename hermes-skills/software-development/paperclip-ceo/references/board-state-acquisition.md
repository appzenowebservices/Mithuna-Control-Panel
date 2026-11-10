# Paperclip Board State Acquisition — Verified API Recipes

Session-verified endpoints against a local_trusted Paperclip server (default `http://localhost:3100`, no auth header needed in local_trusted mode). All endpoints under `/api`, all JSON.

## Discovery when PAPERCLIP_* env vars are missing

Manual/local sessions often lack `PAPERCLIP_AGENT_ID`, `PAPERCLIP_COMPANY_ID`, `PAPERCLIP_API_KEY`. Read them from `~/.paperclip/context.json`:

```json
{ "version": 2, "currentProfile": "default",
  "profiles": { "default": { "apiBase": "http://localhost:3100", "companyId": "<uuid>" } } }
```

Health check: `GET /api/health` → `{"status":"ok","deploymentMode":"local_trusted","bootstrapStatus":"ready"}`.

## State endpoints

| Need | Endpoint |
|---|---|
| Dashboard counts | `GET /api/companies/{CID}/dashboard` (agents, tasks.open/inProgress/blocked, costs, pendingApprovals) |
| Agents roster | `GET /api/companies/{CID}/agents` (id, name, role, status, reportsTo, teamId, adapterType) |
| Agent detail | `GET /api/agents/{id}` (budget, permissions, runtimeConfig, adapterConfig) |
| Adapter shapes | `GET /api/companies/{CID}/agent-configurations` |
| Issues (full list) | `GET /api/companies/{CID}/issues?limit=200` — each item carries `blockedBy`/`blocks` (id, identifier, title, status, priority, assignee), `parentId`, `goalId`, `projectId`. **`?key=` query param is IGNORED** (verified 2026-08-11 XXX-73 — returns the full list; filter client-side by `identifier`). **Items carry the full completeness/liveness block** — `status`, `completedAt`, `executionRunId`, `checkoutRunId`, `activeRun`, `activeRecoveryAction`, `monitorAttemptCount`, `monitorNextCheckAt`, `monitorWakeRequestedAt` — so one fetch asserts the wake-audit checklist ("no queued/running run, no recovery action, no monitor pending") across many issues at once, no heartbeat-runs dive. Before restoring a flipped disposition require `activeRun`/`activeRecoveryAction`/`monitorNextCheckAt` all null AND `executionRunId`/`checkoutRunId` null (XXX-73/XXX-63 restores, 2026-08-11), then re-GET after the PATCH to confirm `completedAt` re-stamped |
| Issue comments | `GET /api/issues/{id}/comments` — includes sys-generated recovery comments |
| Goals | `GET /api/goals/{id}`; `PATCH /api/goals/{id}` with `{"ownerAgentId": "..."}` to claim ownership |
| Projects | `GET /api/companies/{CID}/projects` (status, leadAgentId, workspaceId) |
| Routines | `GET /api/companies/{CID}/routines`; `GET /api/routines/{id}` (cronExpression, status, lastResult, trigger lastFiredAt) |
| Heartbeat run liveness | `GET /api/companies/{CID}/heartbeat-runs?limit=15` — status `succeeded`/`failed` + error text (`fetch failed`, `Process lost -- server may have restarted`) |
| Skills catalog | `GET /api/companies/{CID}/skills` — keys like `paperclipai/paperclip/creative-artist-ui` |
| Agent icons | `GET /api/llms/agent-icons.txt` (plain text list) |
| Issue documents | `GET /api/issues/{id}/documents`; `GET /api/issues/{id}/documents/{key}`; `PUT /api/issues/{id}/documents/{key}` with `{title, format, body, baseRevisionId}` |
| Company | `GET /api/companies/{CID}` (issuePrefix, requireBoardApprovalForNewAgents, budgetMonthlyCents) |

## Mutations

- Claim goal: `PATCH /api/goals/{id}` `{"ownerAgentId": "<agent-id>"}`
- Update issue: `PATCH /api/issues/{id}` `{"status": "...", "comment": "..."}`; updatable: title, description, priority, assigneeAgentId, projectId, goalId, parentId, blockedByIssueIds (array REPLACES the set)
- Add comment: `POST /api/issues/{id}/comments` `{"body": "..."}`
- Create issue: `POST /api/companies/{CID}/issues` `{title, description, status, priority, assigneeAgentId, goalId, parentId, blockedByIssueIds}`
- **Assignee verification (XXX-99/100, 2026-08-11):** POST/PATCH with `assigneeAgentId` can leave the *resolved* `assignee` object `null` in `GET /api/issues/{id}` responses — the raw `assigneeAgentId` field is authoritative, not the nested `assignee`. If `assignee` reads null, check `assigneeAgentId` before assuming the assignment failed; PATCH again only if that field is also missing. Also observed: creation-time `assigneeAgentId` did not stick for review issues created via POST — PATCH the assignee after creation and verify the raw field.
| Hire agent: `POST /api/companies/{CID}/agent-hires` `{name, role, title, icon, reportsTo, capabilities, adapterType, adapterConfig, runtimeConfig, desiredSkills, sourceIssueId}` — response may include `approval` if governed. **Route note (2026-08-11):** GET on this path 404s ("API route not found") — POST-only. Schema = `createAgentSchema` + `sourceIssueId`/`sourceIssueIds` (packages/shared/src/validators/agent.ts); roles enum includes `cmo`; `desiredSkills` accepts plain catalog-key strings. Required when company has `requireBoardApprovalForNewAgents: true` (direct `POST /companies/{CID}/agents` 403s). |
- Decision log: `PUT /api/issues/{boardIssueId}/documents/decision-log` `{title: "Decision Log", format: "markdown", body: "# Decision Log — <Company>\n\n## <date>\n- ...", baseRevisionId: "<latestRevisionId>"}`

### Decision-log PUT is optimistic-concurrency (verified 2026-08-11, XXX-72)

`baseRevisionId` is **mandatory**: a PUT without it 409s with `{"error":"Document update requires baseRevisionId"}`. And under concurrent CEO wakes the doc is written continuously, so even a freshly-read revision can 409 with `{"error":"Document was updated by someone else"}` — the revision moves between your GET and your PUT. Working recipe:

1. `GET /api/issues/{id}/documents/decision-log` → read `latestRevisionId`.
2. Check your addendum marker (e.g. `"XXX-72, addendum"`) is NOT already in `body` — if it is, another parallel run already logged it; no-op.
3. `PUT` with `baseRevisionId: <latestRevisionId>` from step 1.
4. On 409, sleep ~1s and re-GET (fresh revision), retry. Wins within a few attempts; don't treat the conflict as failure — it means another CEO wake is writing the same log, which is expected.

**Issue identifiers skip under concurrency:** the company `issueCounter` advances per creation, and parallel runs create issues in between — observed counter jump 73 → 76 (XXX-74/75 created by concurrent wakes). Never assume the next identifier; read it from the POST response (`d.get('identifier')`).

## Stale-duplicate detection recipe (cadence pile)

Observed: 48 blocked issues, 46 of them identical "Strategic Review" titles assigned to CEO, every one `blockedBy: []`, every one with a single sys comment "Paperclip automatically retried continuation for this assigned in_progress issue … Moving it to blocked". Root cause: a `*/5 * * * *` routine whose runs died with `fetch failed`/`Process lost`; each failure auto-blocked the fresh issue and the next fire created another. The routine was `paused` with trigger lastResult "Skipped because a live execution issue already exists" — the cadence self-limits while a live issue exists, so the pile only grows while runs fail.

Disposition: cancel the stale duplicates (they are assigned to you — not cross-team), keep the current cadence issue, close the superseded in_progress original with a disposition comment. Do not treat as productivity flags — verify via heartbeat-runs first.

## Heartbeat-run `contextSnapshot` — mapping runs to issues (verified 2026-08-11)

Top-level `issueId` on heartbeat runs is usually `null` (queued entries especially), but every run's `contextSnapshot` carries the full wake mapping:

```json
{"issueId": "<uuid>", "taskId": "<uuid>", "taskKey": "<uuid>", "commentId": "<uuid>", "wakeCommentId": "<uuid>", "wakeReason": "issue_commented"}
```

Filter with `uid in str(r["contextSnapshot"])` to find every run that woke on a given issue, and read `wakeCommentId` to see exactly WHICH comment spawned it. Observed `wakeReason` values: `issue_commented` (wake on a new comment) and `issue_reopened_via_comment` (a comment on a re-opened issue spawns a fresh run).

**Critical implication: posting a comment on an issue is itself a wake trigger.** An audit/verification comment you post mid-verification will spawn a NEW agent run whose `wakeCommentId` is your comment (XXX-25, 2026-08-11: audit comment 16:24:42Z → new run created 16:24:45Z, started 16:26:24Z). So after posting any comment, re-check the feed: if a run spawned by your own comment is running/queued, you are NOT the sole run for that issue — stand down (no re-PATCH, no further comments, or you enter a comment→wake→comment loop). Also note the wake-delivery flip to `todo` can predate your comment by seconds, making the audit comment stale on arrival — verify the issue state again after commenting if the comment's claims matter.

## Windows / git-bash quirks

- `python` writing to `/tmp/...` fails (git-bash path vs Windows python): use a relative local file (`curl -s ... -o issues_dump.json`) or `$TEMP`.
- **Posting JSON payloads (verified 2026-08-11, XXX-95):** inline `curl -d '{...}'` with multi-line JSON gets mangled — backticks in the body trigger bash command substitution and quotes break the string. And `curl --data-binary @file` can fail to read a git-bash relative path (`error encountered when reading a file`). Reliable recipe: write the payload to a file with `write_file`, then POST via Python `urllib.request` with `json.dumps(payload).encode()` + `Content-Type: application/json`, catching `HTTPError` to read the error body. Windows Python also cannot `open()` MSYS paths (`/c/Users/...`) — use `C:/Users/...` or relative paths.
- Use `urllib.request` with `timeout=` in Python probes; some endpoints (skills catalog) can hang without it.
- `GET /api/llms/agent-icons.txt` returns plain text, not JSON — do not `json.load` it.
