# Paperclip Board: API Reference & Concurrent-Agent Playbook

Session-derived detail (XXX-80 intake channel, 2026-08-11). Local board:
`http://127.0.0.1:3100`, `local_trusted` mode, `deploymentExposure: private`,
no auth. Company/board identifiers live in memory (`~/.paperclip/context.json`).

## API endpoints (all under `/api`)

| Operation | Endpoint | Body / notes |
| --- | --- | --- |
| List issues | `GET /companies/:companyId/issues?limit=N` | Payloads have NO `key` field — match by title |
| Issue detail | `GET /issues/:id` | `key: null`; has status/assignee/goalId/projectId |
| Create issue | `POST /companies/:companyId/issues` | `{title, description?, goalId?, projectId?, parentId?, status? (default todo), workMode? (standard), priority? (medium), assigneeAgentId?}`. `goalId` links a lead to the company goal (Stage 1 intake) |
| Comment | `POST /issues/:id/comments` | `{body, authorType?}` — unauthenticated resolves to user `local-board` |
| Status | `PATCH /issues/:id` | `{status}` — `backlog\|todo\|in_progress\|in_review\|done\|blocked\|cancelled` |
| List documents | `GET /issues/:id/documents` | e.g. decision-log lives on the Board Operations issue |
| Read document | `GET /issues/:id/documents/:key` | e.g. `/documents/decision-log` |
| Upsert document | `PUT /issues/:id/documents/:key` | Needs `baseRevisionId` once the doc exists — plain PUT 409s after first write |
| Search | `GET /companies/:companyId/search` | keyword search |

Validators (source of truth): `paperclip/packages/shared/src/validators/issue.ts`
(`createIssueSchema` line ~376, `addIssueCommentSchema` line ~556).
Routes: `paperclip/server/src/routes/issues.ts` (create line 5001, comment
7482, patch 5639).

Actor model: `getActorInfo` in `paperclip/server/src/routes/authz.ts` — in
`local_trusted`, unauthenticated writes are `local_implicit` users
(authorUserId `local-board`), which is how agent-authored comments appear.
Agent auth (agent_key/agent_jwt) exists for non-trusted deployments.

## Safe close order (comment BEFORE done)

POST the disposition comment first, THEN `PATCH {"status":"done"}`. Verified
working on XXX-80. The reverse (comment after done) auto-reopens the issue to
`todo` — and even a REJECTED comment POST (400) flips it, because the reopen
fires before validation (see agent-productivity "Commenting AFTER marking
done reopens the issue" pitfall, verified on XXX-63).

## Verification recipe (prove a channel/endpoint is real)

1. Create a clearly-labeled test artifact through the channel — e.g. a test
   brief as a goal-linked lead issue: `POST .../issues` with `goalId` of the
   company goal, title prefixed `INTAKE TEST — ...`, `priority: low`,
   `status: todo`.
2. Confirm it was recorded AND is retrievable (GET readback).
3. Cancel it with a disposition comment (`POST comments` + `PATCH
   {"status":"cancelled"}`) so it does not pollute the pipeline.
4. Cite artifact IDs in the closing comment. Convergent verification by other
   agents (this session: XXX-84 verified the same channel with its own test
   brief) is evidence, not conflict.
5. Principle: never document a channel you cannot verify end-to-end (an
   unprovisioned email address is fabrication, not intake).

## Concurrent-agent race playbook

- **Duplicate issues are the norm.** Parallel Strategic Review cadences
  (maxConcurrentRuns is high) originate the same gap multiple times. This
  session: XXX-80 (Growth Marketer), XXX-84 (sibling), plus two CMO
  duplicates (141bf899, 3d6330d2) — all defining the same intake channel.
  Handle: converge content, list duplicates in the closing comment, recommend
  closing them as superseded, and do NOT mutate another agent's assigned
  issue (flag it; let the assignee close it).
- **patch tool sibling warning** = a sibling modified the file since your
  last read. RE-READ, then re-apply. Fuzzy matching can silently apply your
  stale text over a sibling's edit — check the diff every time.
- **Mangled merges:** two agents editing the same paragraph interleave text
  (observed: duplicate URL + duplicated sentence in one step). Re-read,
  reconcile once; if the sibling already cleaned it, accept their wording.
- **Absorbed commits:** a sibling's `git add -A` sweeps your uncommitted
  edits into their commit (observed: my follow-ups wording landed inside the
  sibling's `c438a980`). Verify with `git status`/`git log` after committing;
  if content landed in their commit, done — don't double-commit.
- **Commit hygiene:** `git add <explicit paths>` only. Never stage `.` in a
  shared tree (dozens of unrelated modified files from other agents). HEAD
  moves under you mid-task — re-check `git log -1` and `git status` before
  final verification.
- **Untracked deliverables are first-committer-wins.** The one-pager was
  untracked; a sibling committed it (with my status-line edit riding along).
  Verify content, not authorship.

## Windows (git-bash) quirks when scripting the API

- `curl` is Windows-native: `-o /tmp/x.json` fails (no `/tmp` mapping). Use a
  repo-relative path or a Windows path (`C:\Users\...\Temp\...`).
- UTF-8 in `curl -d '...'` payloads mangles non-ASCII (em-dash → `�`). Keep
  shell JSON payloads ASCII-only; the `patch`/`write_file` tools handle UTF-8
  file content fine.
- Pipe responses through `python -c "import json,sys; json.load(sys.stdin)"`
  to validate and pretty-print.
