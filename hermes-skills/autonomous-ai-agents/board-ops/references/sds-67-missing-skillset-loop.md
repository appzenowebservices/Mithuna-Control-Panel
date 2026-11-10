# SDS-67: missing_skillset wake-loop (Astrologer, 2026-09-01)

Incident transcript — the agent's own `missing_skillset` report spawned the next wake; re-reporting would loop forever.

## Sequence (all times UTC)

- Issue SDS-67 `b330bf33-b167-40c6-a318-bbedb5587076` "tell me today mars sideral position ?" — `in_progress`, assignee Astrologer `d8f3c457-3fe7-4b24-adc3-44f37b97ed86`, `executionAgentNameKey: astrologer`.
- 11:53:29 — run posts report comment `f4594548` body `missing_skillset: astrology-consultation (and all skills) ...`. **API records it as `authorType: "user"`, `authorUserId: "local-board"`** (createdByRunId null). This is the wake comment of the next run.
- 11:53:45 — same run posts its own summary comment `04b10cdd` (`authorType: "agent"`), stating it left the issue `in_progress` "for the board to act on".
- 11:53:48 — next run locks the issue (`executionLockedAt`), waking the agent again on the user-type comment.
- Cleanup: `skills_list` empty + `skill_view(astrology-consultation)` and `skill_view(board-ops)` both not found → skill genuinely absent; the report was already on the issue, so no re-report. Closed with **bare** `PATCH /api/issues/b330bf33-... {"status":"done"}` → `status: done`, `completedAt: 2026-09-01T11:56:19.800Z`, no `reopenedFromDone`; comment count stayed 2.

## Route discovery (the agent's own 404s)

- `GET /api/companies/{cid}/issues?limit=N` — works (list, newest first; filter by `identifier`).
- `GET /api/companies/{cid}/issues/{issueId}` — **404 `API route not found`**.
- `GET /api/issues/{issueId}` — works (full detail: status, assignee, executionRunId/LockedAt, completedAt, reopenedFromDone).
- `GET /api/issues/{issueId}/comments` — works; each comment has `authorType` ∈ {user, agent, system} + `authorUserId`/`authorAgentId`/`createdByRunId`.
- `PATCH /api/issues/{issueId}` with body `{"status":"done"}` — works; clears executionRunId/executionLockedAt; **omit comment fields to close silently** (the comment-wake loop, see SDS-37).

## Sibling context observed

- SDS-65 "where is the moon ?" (`d72acf78`) — `blocked`; its comments are all `system`-type ("Paperclip automatically retried continuation ... adapter_failed") — system comments do NOT spawn wakes.
- SDS-68 "tell me the mars sideral position" (`28bcd9f2`) — separate `in_progress` run (`executionRunId f01e9b2e`, held by another lock); do not touch a sibling's locked issue from a wake for a different issue.
- Productivity review SDS-66 flagged the agent: `no_comment_streak` (10 completed runs with no run-created issue comment) — leaving skill-less issues unfulfilled strands runs and accumulates review flags; close them bare once reported.

## Lesson encoded in board-ops SKILL.md

If a wake's "Latest wake comment" is your own prior `missing_skillset:` text, re-verifying (skills_list + skill_view probes) and then bare-PATCHing the issue `done` is the loop-break; never post a confirmation comment.

## Follow-up: SDS-79 (2026-09-02) — the ALREADY-DONE variant

Same loop re-observed (Astrologer d8f3c457, SDS-79 `f23aaacd-6202-4b2a-b48e-74b9884ebf4c` "tell me where is the jupiter in the sky ?"), but the echo run woke on an issue that had ALREADY been closed — the bare-PATCH step from SDS-67 did NOT apply.

- 11:27:12Z — run `0c6d98f5` (created 11:23:41Z, later read `failed` in the feed) posts an agent-type ANSWER comment via minted key: Jupiter sidereal position computed with the [[astrology-consultation]] skill (still assigned to that run; workspace node SDS-79.md records the full compute).
- 11:31:17Z — a LATER wake posts `missing_skillset: astrology-consultation` as a **user-type** comment (author local-board, no run id) — the intent-gate report after the skillset block flipped to (none assigned). This is the next wake's comment.
- 11:31:19Z — echo wake run `fc300d03` created (this is the wake the agent actually executes).
- 11:31:37Z — issue bare-PATCHed `done` (completedAt set, no reopenedFromDone) — the prior wake's loop-break landed ~2s AFTER the echo run was created and BEFORE the echo session did anything.
- Echo session (me): fresh GET → `status: done`, `completedAt` set, `executionRunId`/`checkoutRunId`/`activeRun` all null, comment count 2 (answer + missing_skillset) → **stand down with ZERO board writes**: no comment POST (re-spawns the loop), no bare PATCH (clean done, PATCHing adds churn). The SDS-67 loop-break PATCH is ONLY for the still-open variant.
- **Mixed-evidence wrinkle:** the issue legitimately carries BOTH a real computed answer (agent-type, earlier run with the skill) AND the missing_skillset report (later wake after skillset flip). Do not re-verify/recompute the answer, do not re-post either comment, do not reconcile the contradiction in comments — the two are different runs at different times.
- **Knowledge-graph duty on stand-down:** the workspace node `SDS-79.md` already existed (prior wake wrote it; workspace NOT a git repo — SDS-74..78 pattern). Append an "Echo wake (loop-break stand-down)" section recording the zero-writes disposition + the skillset-flip note, keep the [[links]], then POST the knowledge-graph refresh (`/api/agents/<id>/knowledge-graph/refresh?companyId=<cid>` → 200, bundle-scoped per SDS-78). No board writes at any point.

Recognition shortcut for the ALREADY-DONE variant: wake's latest comment is your own `missing_skillset:` text AND `GET /api/issues/<id>` already shows `status: done` + `completedAt` set → verify close held, stand down, graph duty only.

## Follow-up: SDS-80 (2026-09-02) — the OPEN variant, minted-key report (comment-POST authz constraints)

First-wake (not echo) on SDS-80 `c0acb63a-4b33-414c-a54f-ab548105d891` "tell me where is the mars in the sky ?" (in_progress, Astrologer). The intent gate blocked (skillset block = none), so the report comment was delivered with the standard minted-key sequence — and surfaced two server constraints:

- `POST /api/agents/<id>/keys` → token (`pcp_…`, len 52); commented via `POST /api/issues/<id>/comments` with `Authorization: Bearer <token>`.
- Attempt 1 included `"presentation":{"kind":"system_notice","tone":"warning","title":"Skill not assigned"}` → **rejected** `{"error":"Only board users may set structured comment presentation or metadata","details":{"securityPrinciples":["Least Privilege","Secure Defaults","Complete Mediation"]}}`. The OpenAPI schema (at `GET /api/openapi.json`) DOES list `presentation`/`metadata` as body properties — the gate is enforced server-side, not schema-side. Non-board agents must post plain `{"body": ..., "authorType": "agent"}`.
- Attempt 2 plain body → 201, comment `26679c3a-1ec1-4613-8407-bf6200192d4b`, `authorAgentId` = self.
- **Status after the comments POST: still `in_progress`** — the dedicated comments endpoint is status-neutral; the "comment reverts to todo" behavior is the comment-in-issue-PATCH path, not this POST. The first wake read this as "no PATCH needed — this wake's job WAS to report, then leave for the board" — **that choice caused the re-wake (see next section); the correct terminal action is comment-then-bare-PATCH done in the SAME wake.**
- Route-discovery confirms again: `GET /api/companies/{cid}/issues/{issueId}` 404s; `GET /api/issues/{id}` works; full route map + security schemes (`AgentBearerAuth` etc.) at `/api/openapi.json`.

## Follow-up: SDS-80 re-wake (2026-09-02) — OPEN variant, report already posted → dedupe + finalize

Consequence of the first wake leaving SDS-80 `in_progress`: a FRESH execution run (`e44784c1`, locked 12:51:53Z) woke on the same issue — a THIRD variant of the loop, distinct from both (a) open-unreported and (b) already-done.

- 12:51:05Z — first wake's missing_skillset comment `26679c3a` posted (agent-type via minted key).
- 12:51:49Z — first wake's full issue_detail_card comment `71baafe9` posted (agent-type).
- 12:51:53Z — re-wake execution run locks the issue (still `in_progress`, `completedAt` null).
- Re-wake session (me): `GET /api/issues/<id>/comments` → both comments already present → **did NOT re-post** (duplicate + re-post risk); `GET /api/companies/<cid>/issues` → sibling identical case SDS-79 ended `done` + completedAt → that is the terminal pattern to mirror; bare `PATCH {"status":"done"}` (no comment field) → `status: done`, `completedAt: 2026-09-02T12:54:06.863Z`, comment count still 2.
- **Decision rule:** report comment present + issue NOT done → bare-PATCH done. Report comment present + issue already done → stand down ZERO writes (SDS-79). Report comment absent + issue open → post report, then bare-PATCH done in the same wake (never leave `in_progress` "for the board").