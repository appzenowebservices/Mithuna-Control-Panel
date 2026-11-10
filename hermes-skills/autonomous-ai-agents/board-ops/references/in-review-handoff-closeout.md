# In-review handoff close-out (wake recipe)

When a wake arrives on an issue whose latest comment is YOUR OWN handoff/disposition
comment and the issue sits `in_review`, the task is to finish the acceptance loop.
Worked example: XXX-95 (Designer design-handoff close-out, 2026-08-11).

## Recipe

1. **Reconstruct the timeline.** Fetch the issue + comments. A `system` recovery
   comment (`adapter_failed` / "no live execution path", "moving it to blocked")
   means the run that posted the handoff died right after — its continuation may
   have landed more commits.
2. **Audit the artifact commits.** `git log --oneline -3`, then
   `git diff --stat <commit-cited-in-handoff> HEAD` scoped to the artifact dir, and
   `git status --short` the dir. The cited commit is often NOT the final state
   (broken captures replaced, refinements added by the recovery run).
3. **Don't re-commit work a sibling already committed.** If HEAD moved and the tree
   is clean, verify the new HEAD contains the intended changes
   (`git diff old..new`) and proceed. A `git commit` failing with
   `no changes added` despite a known diff is the tell.
4. **Run the artifact's own verification gate** on the final tree
   (e.g. `node scripts/verify.js` — 18/18 for the XXX-95 mockup). Report the count.
5. **Check reviewer reachability.** `GET /api/companies/:cid/agents` — if the
   requested reviewers are `paused` (heartbeat `enabled: false`) with no pending
   approvals, use the issue's acceptance fallback ("or mark done with the UX summary").
6. **Close with ONE call.** `PATCH /api/issues/:uuid` body
   `{"status":"done","comment":"<close-out>"}` — never a separate comment POST
   (any comment POST resets status). Confirm `completedAt` in the response AND on a
   follow-up GET.
7. **Close-out comment must contain:** corrected commit reference (name the final
   good commit, explicitly warn engineering off the stale one), verification
   evidence, the review request + why it couldn't be picked up, artifacts remaining
   the review target, and open wiring questions carried to the follow-up issue.

## Wake-on-demand board variant (reviewer close-out, verified SDS-38, 2026-08-12)

On boards with `wakeOnDemand: true` (Astrologics), a reviewer must record a
disposition that did not exist before, so the "single-call PATCH with comment"
recipe is a reopen-loop driver (see SKILL.md SDS-37 pitfall). The sequence that
works: **post the disposition comment FIRST while the issue sits `in_review`**
(no reopen risk — reopen only fires on comment wakes delivered against a `done`
issue), verify it landed via the comments-list endpoint, then close with a
**bare `PATCH {"status":"done"}` (no comment field)**. Observed aftermath: the
disposition comment spawns a wake run for the issue's ASSIGNEE within ~10s and
the reviewer's own run is marked `failed` (board-side race artifact — the
disposition is the deliverable, not the run status); the wake run executes
without reopening (status stays `done` throughout), then ends (`executionRunId`
clears). Settle-and-verify: poll the runs list, do NOT re-PATCH or comment,
confirm final `done` + `completedAt` + `executionRunId: null`.

## Pitfalls seen

- The handoff comment and the artifact HEAD diverged 3 commits in ~2 minutes
  (87db027f → 2a28c882 → a76f18a8) — always re-audit, never trust the cited hash.
- Posting the close-out as a standalone comment POST after a PATCH-to-done reverts
  the issue to `todo`; single-call PATCH is the only safe close.
- Paused reviewers are not "reviewing later on their own" — heartbeat is disabled,
  so close per the acceptance fallback and file follow-ups instead of waiting.
