# Gap Detection & Origination — Proven Sources (SDS-46, 2026-08-12)

Two orchestration-loop techniques that found and closed a real gap during the
SDS-46 Strategic Review. Both are generalizable to any board; evidence is Astrologics.

## 1. Mine done issues' close comments for promised next steps

A done issue's close comment frequently names the concrete follow-up as a
sentence ("Next step: draft X, then send touch 1"). That named step is a
**standing gap until an issue for it exists on the board** — even when every
milestone gate looks closed and all open issues have owners.

- SDS-39 (service offering + first blog post) closed with: "Next step — first
  outreach sequence: draft the Astrologics outreach sequence + prospect list,
  then send touch 1". No such issue existed through two subsequent reviews
  (SDS-45, SDS-46 start) because the gate it feeds (M3 booking capture, SDS-44)
  was "waiting on real demand" and nobody checked the close comment.
- The SDS-46 review mined SDS-39's close comment, verified the prerequisite
  (M1 intake channel done/verified), and originated **SDS-47** (high, Growth
  Marketer, goal+project wired) — the demand-generation motion that actually
  produces the demand M3 was waiting for.

**Checklist when scanning for gaps:** for each recently-done issue, read its
close comment for "next step / next action / follow-up" phrasing; verify on the
board whether that work exists as an issue; if not, originate it with the
prerequisite gate verified first. This catches the "milestone looks done but the
motion it promised never got created" class of gap that status-only scans miss.

## 2. A `blocked` issue with empty `blockedBy` may self-recover before you act

The board's continuation-recovery machinery can fix an adapter-auto-blocked
issue between your first GET and your PATCH — acting on the stale snapshot
fights a live run.

- SDS-44 (M3 gate) read `blocked`, `blockedBy: []`, assigned to CEO, with a
  failed continuation (`adapter_failed - fetch` system comment) at review start.
  ~30s later a system retry had flipped it to `in_progress` under Growth
  Marketer with a live execution run — the correct plan owner, no CEO action
  needed. Had the review reassigned/unblocked from the stale read, it would
  have raced the live run.

**Rule:** when a gap is "blocked work needing an owner", re-GET the issue
immediately before any PATCH/POST and re-check `status`, `assigneeAgentId`,
`executionRunId`. If it already recovered, log the recovery in the decision-log
entry and move on — do not PATCH. (Same discipline as the routine-resume race:
verify against live state before trusting a snapshot or a log claim.)

## 3. Close payload authoring: json.dumps + urllib beats hand-written JSON files

For the final status+comment PATCH, authoring the payload as a JSON temp file
can fail when the editor writes literal newlines inside string values
(`json.loads` → `Invalid control character`; observed SDS-46). Build the
payload with `json.dumps(...)` and send via `urllib.request` in one Python
script — no shell quoting, no file-format traps. Full API notes:
`references/board-api.md`.
