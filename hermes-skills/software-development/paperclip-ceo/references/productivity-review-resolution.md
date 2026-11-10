# Productivity Review (Watchdog) Resolution

Verified 2026-08-11 on XXX-81 ("Review productivity for XXX-19"). A productivity review is a
watchdog issue auto-created when an assigned issue trips `no_comment_streak` (10 runs),
`long_active_duration` (6h), or `high_churn` (10/1h, 30/6h). It is created `status: todo`,
assigned to the source issue's agent (owner = `resolveReviewOwnerAgentId`). Closing the review
issue = resolving the review.

## Triage recipe (evidence → disposition)

1. **Read the evidence block in the watchdog description first.** The fastest noise filter:
   - `Cost events total: 0 cents` → the runs did no billed work → infrastructure, not churn.
   - All terminal runs `failed` with `liveness: failed` → adapter/process-level deaths (DCO-2 pattern).
2. **GET the source issue detail** (`/api/issues/XXX-N`): check `status` / `completedAt` — the
   source may already be `done` (it resolved itself before the review concluded; verified: XXX-19
   was `done` @16:54:48Z while its review was still open).
3. **GET the source issue comments**: a healthy trail (multiple comments incl. a recent
   "complete" summary comment) proves the agent comments when runs actually execute — a
   no-comment streak made of failed runs is not a silent agent.
4. **GET `/api/companies/{CID}/heartbeat-runs?limit=40`** and filter by `agentId` (prefix match
   works). Classify failures: `fetch failed` / `Process lost -- server may have restarted` =
   infrastructure. There is NO `/api/agents/{id}/runs` or `/api/runs?agentId=` route — both 404
   with "API route not found"; heartbeat-runs is the only liveness feed.
5. **GET the routine** from the source issue's `originId` (when `originKind: routine_execution`):
   `status: active` + `concurrencyPolicy: skip_if_active` = healthy, self-limiting cadence
   (lastResult may be null even when active — don't misread it as dead).
6. **Disposition:**
   - Infra-failure streak + 0 cost + healthy trail + routine healthy → **close as productive**.
   - Genuine churn (cost > 0, repeated failures with actual agent work) → decomposition /
     reroute / block with unblock owner / stop-cancel the source work.

## Closing (resolves + snoozes in one PATCH)

```bash
curl -s -X PATCH http://127.0.0.1:3100/api/issues/<reviewUuid> \
  -H 'Content-Type: application/json' \
  -d '{"status":"done","comment":"Close as productive. ..."}'
```

- A `done` review issue (originKind `issueProductivityReview`, originId = source issue UUID) is
  treated as **resolved**, which starts the 6h `resolvedSnoozeMs` snooze against repeat reviews
  (`findRecentResolvedProductivityReview`, `services/productivity-review.ts`). The "continue with
  a snooze window" manager option is NOT a separate action — closing IS the snooze.
- No dedicated resolve/snooze route surfaced in `routes/issues.ts` (productivityReview appears
  only in detail serialization); the close-PATCH is the mechanism.
- After the close, the source issue's derived `productivityReview` block reads `None` — it only
  renders while a review is `in_progress`. Not an error.
- Keep the disposition comment free of backslashes (500 trigger), cite the evidence
  (failure reasons + counts, cost cents, trail dates, routine state) so the trail reads as
  independent confirmation, and verify the close: re-GET → `status: done` + `completedAt` set.

## Post-close pitfalls

- **The source issue can flip `done` → `todo` mid-review** (wake-delivery churn, same machinery
  as the cancelled→todo flips). Check heartbeat-runs for live runs on the source UUID and the
  comments trail for a sibling verification comment (verified: XXX-19 flipped while 3 CEO runs
  were live on it and a sibling posted "wake on closed issue... is done" at the same minute).
  Live run on the UUID = that run owns the disposition: do NOT PATCH the source, do NOT comment
  further (comment → wake → comment loop). Stand down.
- Re-verify your own review close stuck (`status: done` + `completedAt` on re-GET); a 200 echo
  alone can be reverted by concurrent board activity.
- **A verification-pass wake can still close a genuinely orphaned watchdog.** On a verification-pass
  wake (done cadence issue, trail saturated), re-scan the open list for watchdogs with NO assignee
  and NO runs even when a sibling pass just declared "no unowned gaps" — that claim can be stale by
  minutes (2026-08-11 XXX-34: XXX-90 created 17:00:30Z unassigned, missed by the sibling's 17:01:28Z
  pass). Closing it as productive/noise (0 cost events + infra-failure streak + source done with
  healthy trail) is hygiene, not originating new work — legitimate for a verification-pass wake, and
  worth a one-line decision-log addendum (optimistic-concurrency PUT with `baseRevisionId`, marker
  check first).
- **Pre-close guard must branch on STATUS, not just frozen `updatedAt`.** A close script that checks
  frozen-updatedAt + assignee but not `status` will PATCH even when the pre-close GET already shows
  `status: done` — a sibling beat you by ~30s (2026-08-11 XXX-90: sibling close 17:05:40Z, my PATCH
  landed 17:06:11Z and re-stamped `completedAt`; harmless since both dispositions agree, but
  avoidable churn). If the pre-close GET reads `done`, skip the PATCH entirely — the board is already
  correct; confirm `completedAt` + the disposition comment on the trail and stop. A freshly-closed
  issue's `updatedAt` is still frozen, so the frozen check alone does not catch this.

## Verified variant: high_churn + real work + external gate (DCO-23, 2026-08-15)

The DCO board's first productivity review hit `high_churn` (11 runs/2 assignee-run comments in 1h)
on DCO-22, NOT a no-comment streak — and it was still productive. Evidence read that flipped the
triage: 7 of 11 runs infra-failed (`adapter_failed` fetch failed / `process_lost` server restart),
2 succeeded with real substance (9a39ccc2: Atlas IP-whitelist diagnosis + blocked report; 931964cd:
post-whitelist re-probe, dev-side defect found, report delivered via read-only direct probe), 1
cancelled, 1 echo. 0 cost events. The "churn" was an external gate (operator whitelisted the IP
mid-task) + a dev-side MCP defect (dual-mongoose, `Order` vs `orders` collection mismatch) — both
documented, neither agent inefficiency. Source DCO-22 was already `done` (completedAt refreshed
mid-review by a sibling re-close) before the review PATCH.

Two DCO-board conventions learned:
- **A USER ask posted on the DONE source issue spawns its own sibling run** (DCO-22's 12:43:58Z
  "compose something real using the creative-writing skill" → run 0c76e19c, still `running`).
  That run owns the ask — flag it in the review disposition comment, do NOT act on it or comment
  on the source (would race the sibling's checkout / re-trigger wake).
- **DCO has NO decision-log host** (DCO-21 "Strategic Review" has zero documents, unlike AppZeno
  XXX-12 / Astrologics SDS-30). The review close-PATCH comment IS the disposition record — no
  decision-log append exists to make. Don't hunt for one.
- Close = single `PATCH {"status":"done","comment":...}` on the review issue (same as XXX-81);
  the close-comment echo wake on the now-done review is expected and stands down.
- **Echo-wake sequencing on the review issue (DCO-23, verified 2026-08-15):** the echo
  run (wakeReason `issue_commented`) is created ~2s after the user-type disposition
  comment, and the sibling's agent-type verdict comment can land AFTER the echo run
  starts (12:48:55Z vs echo 12:48:32Z) — the closing run's session was still writing.
  Echo handler checklist: review issue `done` + `completedAt` set + no active/execution
  runs + never flapped (`reopenedFrom: None`); source issue `done`; runs feed shows the
  infra-failure split (7 failed / 2 succeeded-with-substance / 1 cancelled / 1 echo, 0
  cost); documents list on the Strategic Review issue empty (= no decision-log host).
  Then stand down with ZERO writes. Do NOT re-close, re-comment, or append a log that
  doesn't exist.
- **Follow-up user ask landing on the DONE REVIEW issue itself (DCO-23, 13:28Z, 2026-08-15):**
  ~40 min after the review closed, a user posted "can you list me all the customers for the
  last 7 orders?" ON the review issue (not the source). The `issue_commented` wake re-opened
  the done review (`todo`/`in_progress`, completedAt cleared) and spawned a NEW run — that
  run OWNS the ask (no sibling on the source; the source DCO-22 stayed `done`). Unlike an ask
  on the SOURCE issue (sibling run owns it — flag, don't act), an ask on the REVIEW issue is
  yours to answer: pull live data read-only (addies probe recipe), then close with one atomic
  `PATCH {"status":"done","comment":<answer + reaffirmed verdict>}` — the comment IS both the
  user-facing answer and the disposition record (DCO has no decision-log host). Verify: the
  close run may read `failed` in the feed AFTER all writes landed (infra-death-after-writes)
  and a close-comment echo run starts ~12s later — judge by artifacts (status `done`,
  completedAt, comment at index 0), never re-PATCH/comment while the echo is live.
