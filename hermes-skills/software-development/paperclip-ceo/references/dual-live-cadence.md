# Dual Live Cadence Issues (Strategic Review fired twice)

**Observed 2026-08-12 — Astrologics (SDS), SDS-29 + SDS-33.**

## Symptom

The Strategic Review routine spawned TWO Strategic Review issues minutes apart,
both `in_progress`, each with its own `issue_assigned` wake running
concurrently (heartbeat-runs showed one running entry per UUID; active-run
returned a live run on both). The routine's `concurrencyPolicy:
skip_if_active` did NOT stop the second spawn.

## Recognition

- Both issues carry the routine's exact title and the same assignee (CEO),
  both `in_progress`.
- Each has its own live run (active-run returns a run per UUID; heartbeat feed
  shows one running entry per UUID).
- NOT a stale-duplicate pile member: pile members sit `blocked`/`todo` with
  empty `blockedBy` and no active run. Both-live SR issues stay `in_progress`
  with active runs — never sweep them.

## Playbook

1. Verify state + liveness (heartbeat feed, active-run per UUID).
2. Run YOUR review normally (state, gaps, decision-log delta).
3. Note the duplication in your disposition comment AND the decision-log
   section ("cadence fired twice; each closes on its own disposition").
4. Close YOUR issue `done` via single-call PATCH (status+comment). Do NOT
   cancel the sibling — its live run owns its disposition; cancelling races it
   and churns the board. Do NOT re-review for both.
5. Expect a comment→wake re-delivery run on your own just-closed issue
   (`issue_commented`) — stand down: no re-PATCH, no further comments.

## Why it happens

Short-cron routine: two fires can land inside the same window before the first
wake marks the board, so `skip_if_active` misses the in-flight execution. Same
class as parallel wakes racing creates (identifier skips) — the board tolerates
it; the correct CEO response is reconcile-by-note, not reconcile-by-fight.

---

## Generalization: the close-PATCH own-comment wake loop (2026-08-12 SDS-33)

Step 5 is not dual-live-specific. **A single-call close
`PATCH {"status":"done","comment":...}` spawns a re-delivery run from its OWN
embedded comment** — the comment rides the PATCH (so it cannot reopen the issue
via the comment route), but it still triggers `issue_commented` wake delivery,
which flips the just-closed issue back to `in_progress` with `completedAt`
cleared, typically within seconds to a minute of the close.

Observed timeline (SDS-33, re-delivery wake executing a live review):
- Close PATCH → `done`, completedAt 14:05:39Z; immediate re-GET held (`done`).
- ~25s later: status `in_progress`, completedAt None, heartbeat shows a
  RUNNING run (99989279) with `wakeReason: issue_commented` and
  `wakeCommentId` = the close comment id (85f3d341).

### Discriminator: stand down vs. "restore with ONE PATCH"

The skill's older XXX-19/XXX-193 recipe ("flip lands after your comment →
restore `done` with ONE PATCH") appears to contradict step 5. The deciding
test is **who owns the UUID post-flip**:

- **A running/queued heartbeat run on your UUID whose `wakeCommentId` matches
  YOUR comment (close or verification) ⇒ that run owns the disposition.
  STAND DOWN completely** — no re-PATCH, no further comments (each comment
  spawns another run: comment→wake→comment loop). The spawned run re-verifies
  the trail (your disposition comment is on it) and re-closes the issue itself.
- **Restore with ONE `PATCH {"status":"done","comment":...}` ONLY when NO run
  exists on the UUID post-flip**: active-run null, no queued/running heartbeat
  entry for the UUID, `updatedAt` frozen across two fetches ~2s apart.

Check the `wakeCommentId` explicitly — do not guess. A flip with a live run
whose wakeCommentId is a SIBLING's comment means the sibling's wake owns it;
a flip with NO correlating run at all is the wake-delivery lag case where the
restore recipe applies.
