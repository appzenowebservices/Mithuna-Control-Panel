# Client Delivery Capability Plan — XXX-79 Execution Recipe

(2026-08-11, CTO wake on XXX-79 — "Define AppZeno client delivery capability:
offering, pipeline, and design/QA hire specs". Goal 5e07189b-8d0e-496f-a194-5de4a3c08305.)

## Situation shape
The board assigned TWO overlapping issues to the same agent (CTO):
- XXX-78 — offering only (services, stack, pricing baseline), no comments yet = sibling mid-flight
- XXX-79 — offering + pipeline + hire specs (this wake)

A third issue (XXX-74, CMO) already had `docs/client-service-offering.md` in
review. And XXX-7 ("Create a new UI UX agent") was `done` but no designer agent
existed — only the `ui-ux-agent` skill was created.

## Carve-out rule (overlapping siblings)
Read EVERY sibling description + comments before writing. Then defer the
overlapping scope by reference and execute the unique remainder:
- services / engagement / stack → adopted from XXX-74 one-pager (reference, don't copy)
- pricing numbers → delegated to XXX-78 (sibling owns the baseline)
- unique contribution → delivery pipeline with stage gates + hire specs

Never duplicate a deliverable a sibling is mid-flight on; never fight the
sibling's live run. A sibling with zero comments is in flight, not idle.

## Plan-doc skeleton (`docs/client-delivery-capability.md`)
1. **Offering** — services menu (adopted), engagement-types table, pricing
   approach as POLICY (component-based fixed + milestone billing, retainer
   weekly rates, pricing floor) with numbers delegated.
2. **Delivery pipeline** — 5 stages × 5 gates:
   intake(qualify) → scoping(client approves scope/price/timeline) →
   build(feature-complete with evidence) → QA(sign-off, P0/P1 closed) →
   launch(client acceptance + checklist). Gate failure returns work to prior
   stage with evidence-backed issues; gates never skipped.
3. **Missing specialist role specs** — one block per role: goal link / scope /
   skills already on the board (with skill IDs) / toolsets / reporting /
   first assignments / acceptance-for-hire criterion.
4. **Recording & next actions** — decision log, hire issues, open follow-ups.

## Board writes (in order)
1. **Decision log** (XXX-12): GET doc → check your marker isn't already in
   `body` (parallel run) → append FULL body + new section → PUT with
   `baseRevisionId`; on 409 re-GET and retry.
2. **Hire issues**: POST goal-linked, CEO-assigned, full spec + acceptance
   criterion in description; verify `goalId` + `assigneeAgentId` via GET
   (create echo can lie).
3. **Narrow commit**: `git add <file> && git commit -m "..." -- <file>`;
   verify with `git log --oneline -1 -- <file>` + `git status --short -- <file>`.
4. **Close**: single `PATCH {"status":"done","comment":"<disposition>"}`;
   verify `completedAt` set on re-GET.
5. **Ad-hoc verification**: `tempfile.mkstemp(prefix="hermes-verify-")` script
   asserting doc content elements + git state + LIVE board state (decision log
   marker, hire-issue goal/assignee, issue status); run; cleanup; label
   explicitly ad-hoc. Re-run fresh if the gate re-fires next turn.

## Hire-spec issue template (goal-linked, CEO executes)
Title: `Hire <Role> per client delivery capability plan`
Description: goal link → spec pointer (`docs/...` + hire-spec letter) → scope →
skills on board (with IDs) → toolsets → reporting line → acceptance criterion
("agent exists in /agents with skills synced AND completes a real deliverable
on a project issue" — makes the CEO's own disposition self-verifying).
