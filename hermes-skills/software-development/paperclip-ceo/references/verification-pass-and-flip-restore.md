# Verification-Pass Playbook: Done-Issue Wakes, Flip Restore, Routine Pause

Session-specific detail for CEO verification-pass wakes landing on already-closed
cadence issues. Complements the inline pitfalls in SKILL.md (which carry the
one-line rules); this file holds the full decision procedures and observed
timelines.

## 1. Post vs. skip the audit comment — the discriminator

**Test: does an independent verification for THIS deliverable state already
exist on the issue trail?**

- Verification comments written against a **superseded prior state do NOT
  count**. (2026-08-11 XXX-17: the trail carried several verification passes,
  but all were written while the issue sat `cancelled`; a fresh board dispatch
  later superseded the cancellation and the review ran to `done`. The `done`
  deliverable therefore had zero independent verification, and posting the
  fresh audit comment was correct — even though the wake comment IS the closing
  disposition and the decision log names the closure.)
- The XXX-8 "trail-saturated skip" applies only when a comment verifying THIS
  state is already there (e.g. a sibling's post-close verification of the same
  deliverable).
- Failure modes: skipping when only prior-state verifications exist leaves the
  done disposition un-audited; posting when a same-state verification already
  exists is board churn.

## 2. A verification pass does NOT resume a paused routine

Done-issue wake + all agents `paused` + routine `status: paused` (lastResult
null — the null-doesn't-mean-dead gotcha, but here status is genuinely paused):

- Note it in the wake report; defer the resume decision to the operator or the
  next FULL review.
- The "paused cadence means the company goes dark — mandate to resume" rule
  applies to full orchestration reviews (where you have just verified run
  liveness yourself), NOT to verification passes on already-closed issues.
  Resuming blindly from a verify pass risks a spawn wave while agent/infra
  state is still settling.
- `paused` agent status does NOT mean the board is dark: pre-pause runs keep
  processing. Judge board liveness by the heartbeat feed (running entries on
  other issues minutes after the pause wave), never by the agents list alone.
  (2026-08-11 XXX-17: agents list showed CEO/CMO/Growth/CTO paused while the
  feed showed running runs at 17:06-17:07Z on QA's XXX-93.)

## 3. Done→todo wake-delivery flip: restore procedure (XXX-19 pattern)

The wake-delivery flip is not cancelled-only. A cadence issue closed by a
parallel run spawns a verification wake within seconds of the close
(`issue_commented`, wakeComment = the closing comment — XXX-19: close
16:54:48Z, disposition 16:55:08Z, wake 16:55:12Z). That signature (wake time ≈
disposition time) means verification pass, not new review — check the last
comment's timestamp against your wake time before re-reviewing.

Wake delivery can flip the `done` issue to `todo` (completedAt cleared) while
you verify, and the flip can land BETWEEN your clean pre-comment GET and your
comment (XXX-19: pre-GET showed `done`, flip 16:57:23Z, comment 16:57:37Z).
Your comment then spawns a re-delivery run (`issue_reopened_via_comment`,
wakeComment = your comment id) which does NOT own the disposition.

Restore with ONE PATCH `{"status":"done","comment":...}` — the operator
disposition for a completed review is `done`, and the restore held (XXX-19:
completedAt 16:58:32Z set, status still `done` on follow-up GET; small
updatedAt tick after restore is normal bookkeeping). XXX-17 (2026-08-11):
same procedure — flip at 17:06:47Z, verified sole run (no queued/running run
on UUID across three windows incl. 30s lag; active-run null; `updatedAt`
frozen; the audit comment spawned no run per wakeCommentId check), one PATCH
restored `done`, completedAt re-stamped 17:08:54.576Z, held on follow-up GET.

Note: `active-run` on a just-closed issue can return the CLOSING run (started
pre-close) rather than the newest re-delivery run — it is the sibling that
closed the issue, not a competing instance; judge by status + completedAt +
heartbeat wakeComment correlation, never by active-run freshness alone.

## 4. Decision-time checks before any restore

1. `GET /api/issues/{uuid}` — check status at DECISION time, not first GET.
2. `GET /api/companies/{CID}/heartbeat-runs?limit=40-60` — filter by
   `contextSnapshot.issueId` == uuid. Live (queued/running) run on the UUID
   owns the disposition → stand down completely, no PATCH, no further comments.
3. `GET /api/issues/{uuid}/active-run` — null is necessary but NOT sufficient
   (own wake may not be listed); use it to rule out a COMPETING run only.
4. Confirm the posted comment spawned no run: scan heartbeat feed for
   `contextSnapshot.wakeCommentId` == your comment id. If present, you are not
   the sole run.
5. `updatedAt` frozen across two fetches ~5s apart — and re-check once after
   ~30s (queued-run lag after a flip, XXX-31) before declaring yourself sole
   run.
6. Restore with ONE PATCH, confirm `completedAt` re-stamped in the response AND
   on a follow-up GET.

## 5. Comment-only PATCH on a done issue = self-inflicted flip (SDS-33, 2026-08-12)

Posting a verification comment to an already-done issue via
`PATCH {"comment": ...}` with NO `status` field reopens it exactly like a
comment POST: the PATCH response itself echoes `status: todo` with
`completedAt: None`, and an `issue_reopened_via_comment` run spawns whose
`contextSnapshot.wakeCommentId` is your comment id.

- If the goal is "audit comment on an issue that must stay done", include
  `"status": "done"` in the SAME PATCH (single-call close — comment rides
  without reopening).
- If you already sent the comment-only PATCH and it flipped: treat it as your
  own flip, not wake delivery. Check heartbeat for a run with
  `wakeCommentId` == your comment id; with ANY live run on the UUID (including
  the one you just spawned) you are NOT the sole run — stand down completely
  (no re-PATCH, no further comments). The live runs re-verify and re-close on
  their own dispositions. Observed: 3 concurrent runs on the UUID after the
  comment-only PATCH (own continuation + sibling + the run the comment
  spawned) — correct response was zero further mutations.

## 6. Restore-PATCH comment spawns its own wake: `in_progress` re-checkout, stand down (SDS-37, 2026-08-12)

The single-call restore `PATCH {"status":"done","comment":...}` holds the
`done` disposition for the immediate flip — but its COMMENT is itself a wake
trigger. ~1 min after the restore, an `issue_commented` wake (wakeCommentId =
YOUR restore comment's id) spawns and **checks the issue OUT as `in_progress`
with a real `executionRunId`/`checkoutRunId`** — this is NOT the done→todo
wake-delivery flip, and it is NOT a comment-route reopen. It is the machinery
re-delivering the assigned issue because a comment landed on it.

Observed timeline (SDS-37): sibling review closed done 14:03:32Z → my
verification audit comment 30d4a1d6 → flip to `todo` 14:05:16Z (completedAt
cleared) → my restore PATCH 14:06:09Z (done, completedAt re-stamped, held on
immediate follow-up GET) → **14:07:10Z issue flipped `in_progress` with
executionRunId 72a81f21** → heartbeat shows `issue_commented` run 14:07:26Z
with wakeCommentId = the restore comment → that live run re-verified and
re-closed done itself at 14:09:01Z.

Correct playbook: after any restore PATCH, EXPECT a follow-on
`issue_commented` wake spawned by your own restore comment. When the
post-restore re-GET shows `in_progress` with a fresh `executionRunId` (and the
heartbeat run's wakeCommentId matches your comment), you are NOT the sole run
— **stand down completely: no re-PATCH, no further comments.** The live run
owns the disposition and re-closes the issue on its own disposition. A restore
that holds for ~60s then hands off to a re-checkout is SUCCESS, not churn; the
durable trail is the restore comment + the run's re-close, and `done` is
restored either way.

## 7. Verification-gate script: assert the disposition CONTRACT, not rigid status (SDS-37, 2026-08-12)

When the post-turn verification gate re-fires on a board-mutation wake whose
status legitimately moved on (e.g. your restore handed off to a live
re-checkout run, so the issue reads `in_progress` — or the sibling's run
re-closed it `done`), the gate script must assert the contract, not a frozen
snapshot:

- The helper/changed-path checks stay rigid: file deleted, `git status` clean,
  never tracked.
- The board-side checks become conditional: `status != "todo"` (not abandoned
  in limbo); if `done` → `completedAt` set; if `in_progress` → a live
  `executionRunId` owns it; plus the disposition comment ("Restored to done")
  present on the trail. Exit 0 on the contract, and print the resolved temp
  path + `temp dir is OS Temp: True`.

My first gate run FAILED three checks because it asserted `status == done`
against an `in_progress` board that a live run legitimately owned — a stale
assertion, not a broken deliverable (same class as the "verify the CONTRACT,
not your write receipt" rule). Re-running with the conditional contract passed
all checks.

## 8. Windows `temp dir is OS Temp: True` line — exact computation

The post-turn verification gate re-fires when the `hermes-verify-` temp script
does not print `temp dir is OS Temp: True`. On Windows the naive check
(`path.startswith(os.environ["TEMP"])`) prints `False` even for a genuinely
OS-Temp path because `tempfile.mkstemp` returns backslashes while the
comparison needs normalization. Verified working (SDS-33, 2026-08-12 — first
attempt printed False and the gate re-fired; corrected comparison printed True
and the gate accepted):

```python
path_norm = path.replace("\\", "/").lower()
tmp_norm = os.environ.get("TEMP", r"C:\Users\pc\AppData\Local\Temp").replace("\\", "/").lower()
print("temp dir is OS Temp:", path_norm.startswith(tmp_norm.rstrip("/") + "/"))
```

Normalize BOTH sides to forward slashes + lowercase, and guard the trailing
slash — a one-sided normalization or missing `rstrip("/") + "/"` prints False
on a valid path and the gate re-fires. Simplest reliable variant (SDS-37):
skip the hardcoded fallback string entirely and compare against
`tempfile.gettempdir()` — avoids both the normalization bug and the
heredoc-unicodeescape landmine (`"C:\\users"` inside a `<<'PYEOF'` heredoc
throws `SyntaxError: (unicode error)` because the backslash-`u` collapses;
use `r"C:\Users"` raw strings or `tempfile.gettempdir()` instead).

