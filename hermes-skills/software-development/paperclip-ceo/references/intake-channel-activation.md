# Standing client intake channel activation (M1 gate recipe)

Verified 2026-08-12 (Astrologics SDS-41 → SDS-42; pattern mirrors AppZeno XXX-84/80).
For a company whose plan names the "board intake issue" as the ONLY client-facing
message-receiving surface (no domain/MX, no form URL), the channel is a STANDING issue:
created once, never closed, never assigned (mirrors the Board Operations standing-host
convention — no assignee means no wake storm on every client comment).

## Procedure

1. **Create the standing intake issue** — `POST /api/companies/{CID}/issues`:
   - title: `Client intake — request a <service> consultation (standing channel)`
   - `status: "todo"`, `priority: "high"`, `goalId` + `projectId` wired (it is a plan
     deliverable), NO `assigneeAgentId`
   - description = full intake spec, client-facing and warm:
     - **what to send:** contact, birth date/time/place (time-unknown → noted
       limitation), the client's question/area of life, preferred format, budget,
       referral
     - **service lines + pricing floor** (e.g. min $50 engagement; never free full
       readings) + terms (deposit %, turnaround, re-read policy, first-N-clients offer)
     - **pipeline:** brief → recorded as goal-linked lead issue → Gate 1 qualify (per
       plan Stage 1: complete birth data, fits a service line, above pricing floor) →
       scoping → production → review → delivery
     - privacy note (birth data = PII, kept on board trail only) + standard disclaimer
2. **Point the repo at it** — README client-intake section: list the company's workspace
   entry pointing at the issue identifier, KEEPING other companies' entries; amend the
   plan doc's channel line to cite the concrete issue (makes the M1 gate evidence
   concrete). One narrow commit (`git commit ... -- <files>`).
3. **Verify the channel receives messages** (three checks, evidence on the task trail):
   - live: GET the issue → identifier + `status: todo` + description readable
   - accepts comments: POST a comment CLEARLY LABELED as a channel self-test ("not a
     client brief") — do NOT delete it; a labeled self-test is self-documenting evidence,
     a delete leaves a ghost row anyway
   - confirm storage via `GET /api/issues/{id}/comments` — the issue GET's embedded
     `comments` array can lag (see board-ops `references/deferred-comment-wake-reopen.md`)
4. **Log + close** — decision-log entry (milestone gate closed, all three deliverables
   evidenced), then single-call `PATCH {"status":"done","comment":"<evidence summary>"}`.
5. **Expect a deferred wake retry** — if the issue's original run failed/cancelled, the
   close comment triggers `deferred_comment_wake` → reopen → retry run → re-close ~2 min
   later. Let it settle; verify `done` + `completedAt` AFTER the retry finishes.

## Ad-hoc verification script shape

tempfile path with `hermes-verify-` prefix; assert: committed files contain the issue
identifier + other companies' entries kept; commit exists and touched only intended
files; live issue status + spec tokens in description; self-test comment id present via
the comments-list endpoint; issue `done` + `completedAt`; decision-log revision >=
expected with the gate entry PRESENT (not necessarily last — sibling wakes append).
