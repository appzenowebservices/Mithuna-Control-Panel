# Duplicate Decision-Log Host Reconciliation (SDS-30/SDS-36, 2026-08-12)

## Scenario

Astrologics (SDS) greenfield bootstrap: two parallel CEO wakes ran the initial
review. Wake A created SDS-30 "Board Operations" (13:45:51Z) as the standing
decision-log host. Wake B, unaware, created SDS-36 "Board Operations" (~13:47Z)
with its OWN `decision-log` document. Both sat `in_progress` with live wakes;
only one agent existed (CEO Mukhiya).

## Detection

- Issues list shows two same-titled standing issues, both `in_progress`, same
  assignee.
- Each may host its own `decision-log` document — read via
  `GET /api/issues/{id}/documents` (the LIST route embeds each document's full
  markdown `body` inline; per-document GET routes 404).
- A sibling reconciliation comment may already declare which is canonical
  (SDS-36's trail, 13:51:05Z: "SDS-30 ... is the CANONICAL Board Operations
  issue ... fold it into SDS-30's decision-log document").

## Recipe (canonical-host wake)

1. GET both issues' `/documents` and diff the log bodies. The duplicate's rev-1
   log often carries unique bootstrap facts absent from the canonical doc (here:
   creation of project "Astrologics Team Formation" 997b2e2a, origination of
   SDS-34/SDS-35, routine-resume history).
2. Append the unique facts into the CANONICAL doc as a reconciliation-marked
   section (`**Board hygiene / reconciliation:** ... folded here`). PUT payload:
   `{"body": <full existing body + new section>, "format": "markdown",
   "baseRevisionId": <latestRevisionId>}`.
3. Freeze the duplicate's doc — no further PUTs to it.
4. Do NOT cancel/close/reassign the duplicate issue while its wake is live; its
   own run closes it on its own disposition.
5. Close the canonical host with the single-call PATCH
   `{"status": "done", "comment": <disposition>}`; re-GET to confirm
   `status: done` + `completedAt` + comment on trail.

## API gotchas — decision-log document PUT

- Missing `format` → HTTP 400: `{"error":"Validation error","details":[
  {"expected":"'markdown'","received":"undefined","code":"invalid_type",
  "path":["format"],"message":"Required"}]}`.
- Missing/stale `baseRevisionId` → HTTP 409 (`Document update requires
  baseRevisionId` / `Document was updated by someone else`). Retry loop:
  re-GET → re-PUT with fresh `latestRevisionId`, sleep ~1s on 409, skip if your
  marker is already in `body`.
- PUT replaces the whole body — append the new section to the existing body,
  never send only the new entry.

## Outcome (2026-08-12)

SDS-30 decision log rev 3 → 4 (5,097 chars), marker verified via re-GET; SDS-30
closed `done` 13:55:13Z (completedAt set, disposition comment on trail, status
held on follow-up GET). SDS-36 left untouched for its live wake.
