# Duplicate / Superseded Issue Closeout (Paperclip)

Recipe from the SDS-35 closeout (2026-08-12): a parallel CEO wake (SDS-28)
flagged SDS-35 "Hire first astrology consultant specialist" as a duplicate of
the canonical hire issue SDS-32, whose blocker SDS-34 duplicated the already-
done plan issue SDS-31. The directive: consolidate scope into SDS-32, close
SDS-35 as superseded with a pointer to SDS-32, treat SDS-31 as the effective
unblock.

## When

- A wake/resolution concludes its own issue duplicates another issue's scope
  (common under parallel CEO wakes, `maxConcurrentRuns=20`).
- The reconciliation directive says "close as superseded with a pointer to
  <canonical>".

## Verify first (all read-only, in order)

1. `GET /api/companies` → resolve company UUID by `issuePrefix` (SDS →
   `d1551a02-e62d-4a5b-aeb7-c2eadf686aa0`).
2. `GET /api/companies/<id>/issues` → find duplicate + canonical by
   `identifier` field (NOT `key`/`id`). Record their `status` and `blockedBy[]`.
3. `GET /api/issues/<canonicalId>` → confirm its `blockedBy[]` wires to a
   `done` issue (i.e. it is genuinely unblocked and executable).
4. `GET /api/issues/<dupId>/runs` → confirm only YOUR wake's run is active
   (`runId` field, status `running`); no sibling still executing.
5. Optional: read the Board Operations decision log
   (`GET /api/issues/<boardOpsId>/documents/decision-log`) to confirm the
   canonical issue's origin story before writing the close comment.

## Close (single atomic call)

`PATCH /api/issues/<dupId>` with BOTH `status:"done"` AND
`comment:"Superseded by <CANONICAL> ..."` in one body. Never a standalone
comment POST on a closed issue — implicit-reopen semantics apply to user-type
direct-HTTP comments, so the status would revert.

### Why the single PATCH is atomic (verified in `server/src/routes/issues.ts`, 2026-08-12)

- The PATCH handler creates the comment server-side AFTER the status update,
  in the same request (`svc.addComment` at ~line 6349) — no separate POST.
- The implicit comment→todo flip only fires when `updateFields.status ===
  undefined` (~line 5818): an explicit `status:"done"` in the same body always
  wins over any implicit move.
- The reopen computation requires the FINAL status to be `todo` (~line 6107):
  a done-close with comment can never reopen itself.
- `svc.update` sets `completedAt` when the status lands on "completed"
  (`server/src/services/issues.ts` ~line 4814).

## Stranded close (comment claims done, status never flipped)

A sibling/earlier run can post the full close comment ("Done. Closed and
verified.") and then die before the PATCH executes — observed SDS-35
(2026-08-12): agent comment at 13:52Z, but GET showed `in_progress` with
`completedAt: null`; the issue later drifted to `blocked` with
`checkoutRunId`/`executionRunId` nulled, and the wake re-fired on the still-
open issue.

Recovery:
1. `GET /api/issues/<id>` — check `status` + `completedAt`, NOT the comments.
   A close comment is a self-report; only the status fields are evidence.
2. If not `done`, re-issue the single atomic
   `PATCH {"status":"done","comment":"<disposition, incl. note that the prior
   close comment landed but the status flip did not>"}` — same call as the
   original close. Never a standalone comment POST (reverts status).
3. Re-verify with a fresh GET: `status: done` + `completedAt` set.

Comment contents: canonical issue identifier + created time + blocker wiring;
state that all scope is consolidated into the canonical issue; name the
effective unblock when the blocker itself is a duplicate.

## Blocker-of-duplicate nuance

If the duplicate's `blockedBy[]` points at an issue that is ITSELF a duplicate
of a done issue, the done issue is the effective unblock. Do not wait for the
in_progress duplicate blocker to finish — the duplicate can be closed now.

## Verify after

- `GET /api/issues/<dupId>` → status `done`, `completedAt` set.
- `GET /api/issues/<dupId>/comments` → close comment present; status still
  `done` (no implicit reopen from the comment write).

## API shapes (observed)

- Correct routes: `GET /api/issues/<id>` (detail), `GET /api/issues/<id>/comments`, `PATCH /api/issues/<id>`, `GET /api/companies/<cid>/issues` (list). The company-scoped `/api/companies/<cid>/issues/<issueId>` is NOT a route — 404 `{"error":"API route not found"}`.
- Issues list/detail: key field is `identifier` (e.g. "SDS-35"), UUID is `id`.
- `blockedBy` is an array of embedded issue objects
  `{id, identifier, title, status, priority, assigneeAgentId, ...}` — not a
  bare key list.
- `blockedBy`/`blocks` are separate fields; `blockerAttention` summarizes
  unresolved/covered/stalled/attention blocker counts.
- Runs list: `GET /api/issues/<id>/runs` returns objects keyed by `runId`
  with statuses `running`/`queued`/`succeeded`/`failed`/`cancelled`.
- Statuses seen on this board: `todo`, `in_progress`, `done` — "superseded"
  is expressed in the close comment, not as a status value.
