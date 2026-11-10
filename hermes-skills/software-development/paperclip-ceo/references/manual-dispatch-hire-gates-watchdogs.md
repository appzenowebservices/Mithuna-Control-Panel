# Manual Dispatch, Hire-Gate Close, and long_active_duration Watchdogs (SDS-28, 2026-08-12)

Three patterns from a CEO strategic review wake that the main SKILL.md pitfall list did
not yet cover.

## 1. Manual CEO dispatch with a phantom issue identifier (no bound board issue)

- Wake task context named an issue "SDS-28", but the board has no such issue: company
  prefix is XXX, issueCounter was 101, and no issue with an SDS identifier exists.
- Heartbeat feed (`GET /api/companies/{CID}/heartbeat-runs`) showed ZERO running/queued
  runs for the CEO agent and no contextSnapshot taskKey/issueId matching the dispatch —
  this is a **manual operator dispatch**, not a routine fire (the Strategic Review
  routine was `paused`).
- Correct handling:
  1. Execute the full orchestration loop against real board state anyway (state → gaps →
     originate/close → report). The dispatch instructions are the mandate.
  2. Do NOT hunt for the phantom issue, do NOT create a "Strategic Review" issue to
     anchor it, and do NOT resume the paused routine (prior decision-log entries mandate
     deferral while agents are paused).
  3. The Board Operations decision log is the durable report surface: GET the doc list,
     copy `latestRevisionId`, append your section, PUT with `baseRevisionId`.
  4. The final agent response carries the summary since there is no issue to comment on.
  5. Verify every close held on re-fetch (status + completedAt), same as any wake.

## 2. A hire issue still `in_progress` may already have its acceptance gate met

- XXX-82 (Hire Designer) sat `in_progress` assigned to CEO while the Designer
  (2fdc4f5e) had ALREADY completed XXX-95 — a real design handoff committed at a76f18a8
  with 18/18 verify.js checks passing.
- Acceptance criteria were "agent exists in /agents with skills synced AND completes a
  design handoff on a real project issue" — the deliverable half was satisfied by the
  agent's work on a DIFFERENT issue, not on the hire issue itself.
- Rule: before keeping a hire issue open, check the hired agent's completed deliverables
  across the board, not just `/agents`. Close `done` when every acceptance element
  traces to real committed artifacts. This is the mirror of the documented "done hire
  with no agent" trap (XXX-79) — check both directions.
- Bonus: closing the hire issue also resolves any `long_active_duration` watchdog
  sitting on it (see next section).

## 3. Watchdog `long_active_duration` on a stale-open issue = noise close once the source closes

- XXX-101 triggered on `long_active_duration` (current active episode 12h/20h+) for
  source XXX-82. The "long active" was just the hire issue never being closed after its
  gate was met — NOT a stuck run.
- Close `done` with a productive/noise disposition: 0 cost events in the evidence block,
  source issue done with a healthy trail. Same recipe as the `no_comment_streak` variant
  (XXX-90/91). Unassigned watchdogs need no unassign; guard status still `todo` +
  assignee null before the PATCH; verify `completedAt` set after.

## 4. The SDS-N key maps NUMERICALLY to XXX-N — use the cancelled issue as the comment surface (SDS-33, 2026-08-12)

Section 1 said \"no bound board issue\" — that conclusion was the XXX-N lookup being skipped. Refinement from the next dispatch:

- **SDS-33 ↔ XXX-33, SDS-28 ↔ XXX-28**: both exist on the board as `cancelled` \"Strategic Review\" stale-duplicate issues, still assigned to CEO (the hygiene sweep cancelled them but never unassigned — the lingering-assignee re-delivery trap). The dispatch key is the issue number; the board prefix is XXX.
- Handling when the keyed issue exists (cancelled):
  1. Execute the full review loop against real board state (state → gaps → originate/close → report).
  2. Write the decision-log section FIRST (GET doc list → copy `latestRevisionId` → append → PUT with `baseRevisionId`; retry on 409 with fresh rev) so the comment can cite it.
  3. The dispatch instruction \"leave a concise comment here\" = the keyed issue. Post the summary with ONE atomic PATCH `{\"status\":\"cancelled\",\"assigneeAgentId\":null,\"comment\":\"<summary>\"}` — keeps the stale-duplicate disposition, records the trail, and cancel+unassign is the durable anti-resurrection fix. Do NOT flip to `done` (resurrects a hygiene-killed duplicate), do NOT standalone comment POST (reopen risk).
  4. Verify held on follow-up GET: status unchanged, `cancelledAt` set, `assignee` None, no wake spawned in heartbeat feed (feed stayed quiet — the comment-bearing PATCH on a cancelled + unassigned issue does not enqueue a run while the routine is paused).
- If XXX-N does NOT exist, fall back to section 1's decision-log-only pattern (summary in the final response).
- Verified 2026-08-12: XXX-33 PATCH held (cancelledAt 13:49:54Z, assignee None), decision log 33,296 → 36,053 chars, section \"2026-08-12 - CEO Strategic Review (SDS-33 dispatch)\", PUT succeeded first try.

- Closes executed and HELD on re-fetch: XXX-82 (Hire Designer, gate met), XXX-96
  (prod review XXX-39), XXX-98 (prod review XXX-17), XXX-101 (prod review XXX-82) —
  all `done` with `completedAt` stamped.
- Decision log appended: 31,125 → 33,296 chars; section header
  "2026-08-12 - CEO Strategic Review (SDS-28 dispatch, 13:45Z)"; PUT with fresh
  `baseRevisionId` succeeded first try.
- Remaining open after review: XXX-99 (CTO engineering-feasibility review), XXX-100
  (CMO brand-voice review) — both correctly assigned, parked on the operator pause;
  XXX-12 (standing Board Operations concierge). No new work originated: every gap had
  an owner (a legitimate "verify + document" review).
