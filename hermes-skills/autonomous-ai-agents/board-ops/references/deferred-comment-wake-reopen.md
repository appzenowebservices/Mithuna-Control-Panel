# Deferred comment wake reopens a PATCH-closed issue (SDS-41, 2026-08-12)

## Symptom

You closed an issue with the standard single-call `PATCH {"status":"done","comment":"..."}`.
The PATCH response shows `status: done` + `completedAt` set — the close landed. Minutes
later a re-check shows `status: in_progress` (or `todo`) again, `completedAt: null`, and a
NEW `running` run on the runs list: a sibling wake re-executing the issue.

## Root cause

The server's heartbeat runs a **deferred comment wake** mechanism: when an issue's
creation/execution run FAILED or was CANCELLED, a later comment on that issue is treated
as a deferred wake trigger for the failed run — the issue is reopened and a retry run is
spawned. A close comment is still a comment: if it lands on an issue whose original run
failed, the close itself becomes the trigger. This is a THIRD reopen path beyond the two
documented ones (user-type comment implicit reopen; none for agent-context comments) —
the single-call PATCH is atomic, but it does not immunize the issue against the heartbeat's
deferred-wake logic.

## Observable sequence (SDS-41, 2026-08-12, all times UTC)

| Time | Event |
|------|-------|
| 14:00:36 | Issue created (run spawned, source `issue.create`) |
| 14:00:39 | That run FAILED (`failed`, source `issue.create`) — agent never executed the issue |
| 14:05:05 | Manual agent PATCHes done + close comment; activity: `issue.updated` (source `comment`, status `done`) ✓ |
| 14:05:26 | Close comment stored (authorType `user`, id `58239363-...`) |
| 14:05:52 | New retry run spawned (source `issue.comment`) |
| 14:05:54 | Heartbeat `issue.updated`: `source: deferred_comment_wake`, `status: todo`, `reopened: true`, `runId` = the FAILED run's id (`5bafb5db-...`) |
| 14:05:58 | Retry run checks out the issue → `in_progress` |
| 14:07:56 | Retry wake re-closes the issue `done` (fresh `completedAt`) |

Net: the status flap resolves itself in ~2 min; the retry wake re-closes with its own
evidence. But a verification pass that samples the issue during the window (or that
requires "M1 entry is the LAST decision-log section") will false-fail — a sibling CEO wake
appended decision-log rev 10 in the same window, which independently CONFIRMED the close.

## Detection (activity feed is authoritative)

`GET /api/issues/{id}/activity` shows an entry with:
- `actorType: system`, `actorId: heartbeat`, `action: issue.updated`
- `details`: `"source": "deferred_comment_wake"`, `"reopened": true`, `"status": "todo"`,
  and the failed run's id in `details.runId`

Runs list (`GET /api/issues/{id}/runs`): the earlier `failed`/`cancelled` run + a new
`running`/`queued` run whose `contextSnapshot.source` is `issue.comment`.

## Handling

1. Do NOT fight the retry: no status PATCH while it is live (would race the sibling), no
   comment POSTs (they feed the same deferred mechanism), no cancel.
2. Poll the runs list until the retry settles (`succeeded`/`failed`/`cancelled`).
3. Re-verify the final state AFTER it settles: issue `done` + `completedAt` set, close
   comment present. The retry wake re-closes with its own evidence (~2 min, observed).
4. If the retry leaves the issue open (it failed too), THEN apply the stranded-close
   recovery once the run is dead: one atomic `PATCH {"status":"done","comment":"..."}`.
5. Ad-hoc verification scripts should tolerate sibling appends: assert the gate entry is
   PRESENT in the decision log, not that it is the last section; assert final issue state
   after polling runs, not at the first observed `done`.

## Related quirk (same session)

The issue GET's embedded `comments` array lags: right after a successful comment POST,
`GET /api/issues/{id}` showed `comments: []` while `GET /api/issues/{id}/comments`
returned the stored comment. Always use the comments-list endpoint for authoritative
comment evidence.
