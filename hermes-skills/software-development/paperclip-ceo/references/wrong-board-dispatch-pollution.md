# Wrong-Board Dispatch Pollution (SDS-33, Astrologics — 2026-08-12)

## Symptom

The first dispatch of Strategic Review issue SDS-33 (Astrologics company,
prefix SDS) fetched **AppZeno** (prefix XXX) state instead of Astrologics.
The run then:

1. Posted an AppZeno review as its "SDS-33 dispatch complete" summary comment
   on the SDS-33 issue (cited AppZeno issues XXX-80/84/87/79/93/95, AppZeno
   concierge XXX-12, AppZeno hires XXX-82/83 — all wrong-board).
2. Appended a bogus "CEO Strategic Review (SDS-33 dispatch)" section into
   **AppZeno's** XXX-12 decision log — a real write to the other company's
   document (log grew to ~37.7k chars; the section sits at body offset ~33k).
3. Claimed a PATCH on AppZeno issue XXX-33 (cancelled + unassign) as if it
   were the wake issue.
4. Left the real SDS-33 issue `in_progress` with no disposition → system
   comment "Paperclip needs a disposition before this issue can continue" →
   cadence re-delivered via a `finish_successful_run_handoff` wake.

Meanwhile the real Astrologics board was mid-batch: sibling runs live on
SDS-32 (founding hires), SDS-30 (decision log), SDS-35/SDS-36 (duplicate
closes) — all the same CEO agent (maxConcurrentRuns > 1).

## Why it happens

`~/.paperclip/context.json` defaults to the AppZeno company. A run that
resolves the company from context instead of from the issue prefix
(`GET /api/companies`, match `issuePrefix`) reads and — worse — WRITES
against the wrong board. The wrong-board pitfall was already documented for
state READS; this session proves the mutation consequence: the decision-log
PUT and status PATCHes go to the other company's board.

## Recovery playbook (the re-delivered wake)

1. **Treat the re-delivery as a LIVE EXECUTION**, not a verification pass —
   the prior run's comment is garbage, not a disposition to verify.
2. Re-resolve the company by issue prefix (`GET /api/companies` → match
   `issuePrefix` → company UUID). Ignore context.json for company resolution.
3. Run the real review against the right company.
4. In the disposition comment AND the decision-log section, explicitly flag
   the contamination: name the other company, the polluted artifact (e.g.
   "bogus 'SDS-33 dispatch' section appended to AppZeno's XXX-12 decision
   log"), and that it is left for operator cleanup.
5. **Never PATCH/PUT the other company's issues, routines, or decision log
   from your cross-company wake.** Separate company, possibly live runs, out
   of scope. Flag-and-leave is the rule.
6. Close your cadence issue `done` via single-call PATCH; expect the
   `issue_commented` re-delivery wake on your own close and stand down.

## Evidence discipline

- A prior run's wake-comment summary on YOUR issue is a self-report against
  whatever board it actually fetched. Cross-check every cited identifier
  (issue keys, commits, agents) against the right company's live state
  before trusting any claim.
- The wrong-board write is verifiable: grep the other company's decision-log
  document body for your issue key (GET `/api/issues/{id}/documents` list
  route embeds full bodies). SDS-33's bogus section was found at body
  offset 33341 of AppZeno's XXX-12 log.

## Related observations from the same session

- **New wakeReasons observed** (extend the heartbeat taxonomy):
  `finish_successful_run_handoff` (run finished successfully but left the
  issue without a disposition → system "needs a disposition" → re-delivery
  of the same issue), `issue_blockers_resolved` (a blocker flipped `done` →
  wake on the blocked issue), `missing_issue_comment` (in_progress issue
  with no comment → disposition wake). `issue_continuation_needed` /
  `source_scoped_recovery_action` appear for recovery paths.
- **Decision-log PUT under concurrent sibling writes merges cleanly if you
  GET inside the retry loop.** The GET→baseRevisionId→PUT sequence read the
  body AFTER a sibling's section landed, so the full-body PUT preserved the
  sibling's "Board Operations (SDS-30)" / "Reconciliation (SDS-36…)"
  sections and appended mine. Marker-check (`"## Strategic Review (SDS-33)"`
  in body) before writing, retry on 409 — worked first try, zero clobber.
- **Complementary deliverable vs fold-in decision (note-and-keep):** the
  fold-in + `git rm` recipe (XXX-78/79) applies when YOU are the assignee
  closing the duplicate. When a parallel wake instead delivered a
  COMPLEMENTARY doc (explicitly deferring to the canonical for overlapping
  scope), closed its issue `done`, and a live run is working the same repo —
  keep the doc as a companion appendix, record the reconcile-instruction
  supersession in the decision log, don't delete post-hoc. (SDS-34's team
  plan `docs/astrologics-team-plan.md` delivered despite the SDS-28
  reconcile note; canonical remained `docs/astrologics-company-plan.md`
  (SDS-31), company plan = single source of truth.)
- **Routine resume criteria held:** after the dual-fire pause, infra
  recovered (all runs succeeded/running since the last `fetch failed`), no
  stale duplicate pile, `skip_if_active` set → resume `paused → active` was
  the right call (mandate: cadence keeps the company moving). The pause was
  attributed to the dual-fire, not the operator — if the operator re-pauses,
  that shows in the log and is their call.
