# Gate-Waiting Wake + Infra-Failed Run: Recovery-Retry Verification (SDS-44, 2026-08-12)

Timeline and corrected verification pattern for the M3 gate wake that kept
getting re-delivered by infra failures. This is the "gate waiting on a real
external event" pattern PLUS the "my run died after the bare PATCH" wrinkle.

## Timeline (all times 2026-08-12Z)

| Time | Event |
|---|---|
| 14:11 | SDS-44 created; first wake (run 20a36529) verifies gate NOT met, records verdict |
| 14:13-14:14 | Wake run abf531ee fails on infra; agent comment 14:14:15Z + user status comment 14:14:02Z record verdict |
| 16:58 | Growth Marketer retry run b40c9a30 starts |
| 17:04:31 | b40c9a30 dies `adapter_failed` (fetch failed) |
| 17:04:56 | System recovery comment: issue moved to `blocked`, recovery owner CEO, run bdd160f2 |
| 17:07-17:08 | CEO fresh live verification: SDS-42 still zero client briefs, gate NOT met |
| 17:10:23 | CEO manual resolution comment (user-type): restore `todo`, return to Growth Marketer (M3 owner) |
| 17:10:27 | My wake (Growth Marketer run 84c08aba) re-delivered, checks out issue → `in_progress` |
| 17:11-17:12 | My verification: trigger absent, readiness complete (proposal template @ac69b3da committed), verdict unchanged |
| 17:14:51 | My bare `PATCH {"status":"todo"}` lands (no comment field) — status todo, no exec run |
| 17:15:33 | My run 84c08aba marked `failed` (infra) → board spawns retry run ee276c9a (`issue_assignment_recovery`) |
| 17:15:53 | Retry re-checks out issue → `in_progress`, exec run ee276c9a |
| 17:18:30 | Retry restores `todo` (bare PATCH) |
| 17:20:33 | Retry run ee276c9a `succeeded` — settled |
| 17:20:48 | Retry posts its OWN verification comment (agent-type) — comment count 4 → 5 |

## Key mechanics

- **A bare status PATCH does NOT survive the run's infra death.** The status
  flip landed (17:14:51Z) but my run then failed, and the board's recovery
  treats the issue as still-open-with-dead-run → spawns a retry that re-checks
  out. The retry re-runs the whole verification but converges on the same
  honest state (`todo`, completedAt null, gate NOT met). Final state is what
  matters; my PATCH + the retry's PATCH are the same intent.
- **The retry run posts its own evidence comment** (agent-type, `Ad-hoc
  verification` / disposition). This is legitimate disposition evidence, NOT
  wake churn — the comment count legitimately grows by 1 after the retry
  settles. Do not treat it as a signal to re-PATCH or comment.
- **Recovery comments are user-type and spawn re-delivery wakes** — the CEO's
  manual resolution comment (17:10:23Z, authorType user) is what re-delivered
  the issue to me. Every user-type comment on an open issue can re-wake it.

## Corrected verification assertions (ad-hoc script)

WRONG (brittle — they fail on legitimate events):
- `comment count unchanged` — fails when the retry posts its own evidence
  comment. Assert instead: count = trail + 1 AND newest comment is the retry's
  agent-type evidence with a consistent verdict.
- `my section is the literal last section of the shared reference` — sibling
  cadence wakes append concurrently (SDS-46/47/48 landed mid-wake). Assert
  coherence instead: no section contradicts the verdict.
- `exact phrase count >= N` — verdict wording varies across sections
  ("gate NOT met" / "NOT YET MET" / "nothing to fabricate"). Grep for
  contradictions (`met` without `NOT`) instead of counting one phrasing.

RIGHT (durable contracts):
- Negative board outcome: status `todo` (NOT done), `completedAt` null, no
  exec/checkout run — proves the gate was left honestly open, not fabricated
  closed.
- Trigger surface (SDS-42) still has exactly 1 comment, the M1 self-test
  labeled "not a client brief".
- Reference file contains the verdict + readiness artifact commit, and no
  sibling section contradicts it.
- Readiness artifact exists on disk at the cited commit (`git show --stat`).

## Playbook for a gate-waiting wake

1. Fresh-GET the trigger surface (intake channel comments) — never trust a
   stale read.
2. Fresh-GET the issue + runs list; identify YOUR run and whether a sibling/
   retry run is live.
3. Verify readiness artifacts on disk (commit + clean tree).
4. Record evidence in the shared board-state reference (safe channel — a board
   comment spawns `issue_commented` churn).
5. Bare `PATCH {"status":"todo"}` — no comment field (comment spawns wakes).
6. If your run then dies and a retry appears: poll runs every ~30s until
   terminal, do NOT re-PATCH or comment while it runs, then verify final state.
