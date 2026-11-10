# Parallel Cadence Runs — Reconciliation Playbook (XXX-71 / XXX-72, 2026-08-11)

Two Strategic Review runs (XXX-71 and XXX-72) executed the same board in parallel
(`maxConcurrentRuns` 20 on AppZeno). This document records the race timeline and
the fix sequence so future runs recognize the pattern immediately.

## Symptoms observed

1. **Same-issue reassignment race (XXX-63 "write the first blog").**
   - 16:14:21 — run A reassigns CTO (paused) -> CMO, detaches cancelled project.
   - 16:14:42 — run B (XXX-71) reassigns CMO -> CTO (project-team rule rejected CMO).
   - 16:21:10 — run B withdraws its own CTO reassignment (raced run A); CMO stands.
   - 16:22:54 — my run (XXX-72) reassigns to Growth Marketer, **overwriting CMO**.
   - Net: last write wins; three different owners in 8 minutes. Fix: post ONE
     reconciliation comment naming the final owner (Growth Marketer writes,
     CMO reviews via XXX-73) and STOP. Do not re-PATCH to undo — ping-pong
     churns `updatedAt` and confuses watchers.

2. **Decision-log document 409 Conflict.** I `GET /documents` -> `[]`, then
   `PUT /documents/decision-log` -> **409** because run B had created the doc
   in between. Fix: `GET /documents/decision-log`, copy `latestRevisionId`,
   re-`PUT` with `baseRevisionId` and `body = existing + new_section` to append
   a revision (response `latestRevisionNumber` increments; got rev 2). Never
   blind-overwrite an existing log — you clobber the other run's decisions.

3. **Own issue auto-blocked mid-run.** XXX-72 flipped to `blocked` with sys
   comment `process_lost - Process lost -- server may have restarted` at 16:24,
   while my process was still alive and working (an earlier script 409 had made
   the system think execution died). Fix: don't panic, don't treat as real
   block — finish the work, then single-call `PATCH {"status":"done","comment":...}`
   and verify `completedAt` is set.

4. **Watchdog double-close is idempotent.** Both runs closed XXX-11 / XXX-62
   as noise. Second close is harmless (status already `done`); leave it.

5. **Board list vs detail disagree.** XXX-16/XXX-20 flipped `todo` -> `cancelled`
   -> `todo` across fetches within minutes. Detail view is newer; re-fetch before
   acting; never originate work off a stale snapshot.

## Fix sequence (adopt wholesale)

1. Before every mutation, re-`GET /api/issues/:uuid` and compare `updatedAt`
   to your last fetch. If it moved, re-read comments and re-decide.
2. Reassignment races: one reconciliation comment, no re-PATCH.
3. Decision log: GET -> `latestRevisionId` -> PUT with `baseRevisionId` (append).
4. Own issue auto-blocked: complete work, close with single-call PATCH, verify.
5. Concurrent artifact restore: verify on-disk state last (size/content/sha256),
   accept either variant if it satisfies the deliverable.

## Ad-hoc verification recipe (harness request, no canonical test cmd)

Changed a workspace artifact (e.g. restored test.md) and the harness wants
verification evidence:

- Write a focused script under an OS-safe tempfile:
  `tempfile.mkstemp(prefix="hermes-verify-", suffix=".txt")` under
  `C:\Users\<user>\AppData\Local\Temp` (or `tempfile.gettempdir()`).
- Check: file exists, non-empty, content markers, sha256, `git status --short -- <file>`
  (untracked is fine for scratch artifacts), `git log -1 -- <file>` (never committed
  is expected for workspace scratch), and board status re-fetch.
- Clean up the temp file; report explicitly as **ad-hoc verification**, not suite green.
