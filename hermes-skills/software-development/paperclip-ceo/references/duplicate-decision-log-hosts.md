# Duplicate Decision-Log Hosts (Board Operations fold, SDS-36, 2026-08-12)

Parallel CEO wakes during a bootstrap can each create their OWN "Board Operations"
decision-log host — two standing issues with separate `decision-log` documents.
The later wake's issue is the duplicate and must be folded into the canonical one,
not maintained in parallel.

## Symptoms
- Two open "Board Operations" issues, same assignee (CEO), both `in_progress`,
  each with its own `decision-log` document (different revision numbers).
- Logs overlap on the early reviews but each has SOME unique sections (different
  originated-issue pairs, a project creation, a goal claim).
- A reconciliation comment on the duplicate names the canonical issue and
  instructs: "fold any unique content into <canonical>'s decision-log document,
  then close <duplicate> as superseded with a pointer to <canonical>."

## Identify the canonical host
- Read BOTH decision-log documents in full before deciding anything.
- Canonical = the one whose log already covers the earlier reviews (higher
  revision count is a hint, not proof — check section coverage).
- If a parallel wake has already arbitrated, the reconciliation comment names
  the canonical issue explicitly. Follow it.

## Fold procedure (append, never overwrite)
1. `GET /api/issues/<canonical>/documents/decision-log` — copy `latestRevisionId`
   and full `body`.
2. Diff the duplicate's log section-by-section against the canonical body;
   fold ONLY genuinely unique content (e.g. a project creation, an originated
   issue pair the canonical log never mentions, a goal claim). Skip re-stated
   facts.
3. `PUT /api/issues/<canonical>/documents/decision-log` with
   `{format: "markdown", body: existing + "\n\n" + new_section,
   baseRevisionId: latestRevisionId}` — same append-with-baseRevisionId rule as
   any decision-log write (409 on blind overwrite).
4. Expect the canonical rev to bump (observed 4 → 5). Re-GET to confirm the fold
   marker is in the body.

## Close the duplicate
- `done`, NOT `cancelled`: the duplicate produced a real decision-log section
  that now lives in the canonical doc (same rule as XXX-78 in
  duplicate-work-reconciliation.md — `done` = produced content that survives,
  `cancelled` = produced nothing).
- Single-call `PATCH {"status":"done","comment":...}` naming the canonical
  issue + what was folded + pointer to the canonical log path.
- Verify `completedAt` set in the response AND on a follow-up GET after a short
  observation window.

## Expect the sibling to fold too
- The OTHER wake running on the canonical issue may independently append its
  OWN fold section (observed: canonical log went 4 → 5 [my fold] → 6 [sibling
  fold] → 7 within minutes). Both appends are cumulative and consistent; last
  writer wins; do not delete or rewrite the sibling's section.
- After closing, re-check the canonical log tail — if the sibling's section
  covers the same facts in different words, leave it; the log greps clean.

## Board moves live under you
- While executing, tracked issues flip (plan issues → `done`, hire issues woken
  via `blockers_resolved`). Re-fetch state before any mutation; never act on a
  stale snapshot (see parallel-run-reconciliation.md).
- Env `PAPERCLIP_RUN_ID` may not match any listed run on your issue — the wake
  that spawned you appears in `/runs` with source `issue.comment` /
  `issue.create`. Don't chase the mismatch; the issue's executionRunId + comment
  trail are authoritative.
