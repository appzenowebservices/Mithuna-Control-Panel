# Productivity-Review Wakes: Reviewer-Side Playbook

Session-derived detail (XXX-81 "Review productivity for XXX-19", 2026-08-11,
AppZeno board). The OTHER side of DCO-2: this skill's `dco-productivity-alert.md`
is the alertee/root-cause view; this file is what the agent woken to REVIEW the
alert should do.

## Wake shape

A productivity review arrives as an issue with:
- `originKind: "issue_productivity_review"`
- `originId`: source issue UUID (e.g. XXX-19)
- `originFingerprint: "productivity-review:<sourceIssueUuid>"`
- Title: `Review productivity for <source>`
- Description: trigger, evidence table (no_comment_streak, run counts, cost),
  latest runs, latest assignee comments, and a Manager Decision block
  (close as productive / snooze / decompose / reroute / block / cancel).

## Step 0 — Check for duplicate/race wake FIRST

The board runs parallel cadence wakes (maxConcurrentRuns high); wake delivery
can re-deliver after the review is already resolved. Before doing anything:

1. `GET /api/issues/XXX-81` — read `status`, `completedAt`, `executionRunId`,
   `checkoutRunId`, `activeRun`, `monitorWakeRequestedAt`.
2. `GET /api/issues/XXX-81/comments` — compare the latest comment body against
   the wake comment text delivered in the task context.

If `status: done` AND the exact wake-comment text is already a comment on the
issue, the decision was already executed — **this is a duplicate/race wake**.
Stand down:

- Do NOT re-post the decision comment.
- Do NOT post any "verification pass" comment either. Commenting on a `done`
  issue auto-reopens it to `todo` (even a rejected POST flips it — see the
  "Commenting AFTER marking done reopens the issue" pitfall). Verification
  comments on resolved issues have caused wake-delivery flip loops on this
  board (XXX-19 16:57–16:58Z trail, XXX-79 comment-driven reopen).
- Do NOT PATCH status. Re-GET to confirm state instead.
- Report the disposition to the operator without touching the board.

## Step 1 — Verify the decision's factual claims (when you ARE the reviewer)

Recipe used to validate "close as productive" before accepting the prior
decision (or making your own):

| Claim to check | Endpoint | What confirms it |
| --- | --- | --- |
| Source issue resolved | `GET /api/issues/XXX-19` | `status: done`, `completedAt` set, `updatedAt` frozen |
| Complete-summary comment exists | `GET /api/issues/XXX-19/comments` | a `Strategic Review complete`-style comment; comment timestamps bracket `completedAt` |
| Runs failed at infra level | `GET /api/issues/XXX-19/runs` | runs `status: failed` (or `cancelled` for wake/verification passes); failures at adapter/process level (`fetch failed`, `Process lost`, `adapter_failed`) |
| No billed work lost | issue description evidence | `Cost events total: 0 cents` |
| Routine healthy/self-limiting | `GET /api/companies/:companyId/routines` | `concurrencyPolicy: skip_if_active`; trigger `lastResult` |
| No review re-trigger | `GET /api/companies/:companyId/issues` filtered `originKind == "issue_productivity_review"` and `originId == <source uuid>` | exactly ONE review issue for that source |
| Snooze effective | same filter | no NEW review issue created after the resolved one — the 6h resolved-review snooze is implicit in resolution |

## Step 2 — Check post-decision drift before reporting

State can move AFTER the decision comment was posted. This session: the CEO
agent got paused (manual) and the Strategic Review routine paused 2–5 min after
the review closed; the last routine run then failed with
`Agent is not invokable in its current state` because the assignee was paused.
That is operator state, not a productivity regression — the Board Operations
decision log (`GET /api/issues/XXX-12/documents/decision-log`) recorded it
explicitly ("Routine + agents remain paused (operator state)... do NOT resume
the routine while agents are paused"). Read the decision log before reporting
so you don't recommend contradicting operator intent.

## Classification shorthand (infra vs productivity)

- All sampled runs `failed`/`cancelled` at adapter/process level + 0 cost
  events + source issue done with a full comment trail = **DCO-2 infra
  artifact** → close as productive. Failed runs cannot create comments, so a
  no-comment streak of failed runs is expected, not churn.
- Same pattern + source issue still open and re-running = **snooze** (resolved
  review starts the 6h window; monitor won't re-create for the same source
  fingerprint until it lapses).
- Runs succeeding but producing no comments / real cost accumulating / no
  progress on an active issue = actual productivity problem → decompose,
  reroute, block (with unblock owner), or cancel.

## Endpoint notes

- `GET /api/issues/:id/runs` returns run rows WITHOUT `id` populated in the
  list view — match by `createdAt`/`status` against the evidence table.
- Issue list payloads have NO `key` field; filter by title/origin fields.
- `/api/openapi.json` (or `/openapi.json`) is served — grep `paths` for
  endpoint discovery (monitor, runs, routines, comments).
- Comment author for unauthenticated local writes is user `local-board`.
