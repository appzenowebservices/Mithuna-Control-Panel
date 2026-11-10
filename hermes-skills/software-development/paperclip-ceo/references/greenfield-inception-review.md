# Greenfield / Company-Inception Review + Multi-Issue Identifier Staleness

Verified 2026-08-12 on Astrologics (SDS-28, first-ever Strategic Review on a brand-new
company). The wake landed on a company that is NOT AppZeno-shaped — both this playbook
and the identifier-staleness pitfall below are class-level, not one-off.

## Recognizing a greenfield board

- The wake issue's identifier does NOT match the known company prefix (e.g. SDS-28
  while memory/skills say AppZeno = XXX). **Discover the company first:**
  `GET /api/companies` and match `issuePrefix` to the wake identifier.
- Inception board signature: goal(s) with `ownerAgentId: null` + `milestones: null`,
  zero projects, zero teams, one agent (the CEO), no Board Operations issue, no
  decision-log document, SR routine `paused`, and only the cadence issue itself.
- Known companies on the local server (2026-08-12): AppZeno `91fab276-...` (XXX),
  Astrologics `d1551a02-...` (SDS, CEO agent "Mukhiya" `f13c89df-...`),
  ApniDesi Dukaan `9b4623fa-...` (DCO).

## Inception checklist (the gaps are foundation gaps, not pipeline gaps)

1. **Set the company mission** — `PATCH /api/companies/{cid}` `{"description": "..."}`
   (description starts `null`; the gap-detection guidance in SKILL.md assumes an
   existing org, so an inception board needs this explicit step).
2. **Claim the goal** — `PATCH /api/goals/{id}` `{"ownerAgentId": "<ceo>"}`.
3. **Create the Board Operations issue** (none exists) to host the decision log, then
   write the first `decision-log` document on it via the flat route
   `PUT /api/issues/{boardIssueId}/documents/decision-log` (fresh doc: no
   `baseRevisionId` needed; keep `title`/`format`/`body`).
4. **Originate a plan-first chain** — keystone "define milestones + founding plan"
   (high, CEO, goal-wired; milestones are NOT API-settable, so the committed doc
   carries them) then a hire issue with `blockedByIssueIds: [<plan uuid>]`.
   Do NOT hire or create teams/projects before the plan lands (also avoids the
   team-POST-has-no-DELETE trap). Every other motion (land/deliver) is downstream
   of the plan — state that explicitly instead of over-originating into a void.
5. **Resume the paused routine** — `PATCH /api/routines/{id}` `{"status":"active"}`
   (cadence mandate; `skip_if_active` self-limits). Expect it to spawn successor
   Strategic Review issues MID-review, even on a one-agent board — do not touch them;
   they own the next review and self-reconcile if two spawn.
6. **Close the cadence issue** `done` in ONE `PATCH {"status":"done","comment":...}`
   naming the keystone as next action, then verify with GETs only.

## Multi-issue origination: identifier staleness (general pitfall)

**Descriptions that reference sibling issues by pre-creation identifier go stale —
identifiers land AFTER you write them.** On SDS-28 the descriptions assumed
plan=next-counter; actual identifiers were plan=SDS-31, hire=SDS-32 (a successor
cadence issue and the Board Ops issue consumed SDS-29/30 mid-review). The create
responses are the only source of truth — read `identifier` from each POST response.

Fixes (in order of preference):
1. Reference siblings by TITLE in descriptions, never by guessed identifier.
2. Create all issues first, then PATCH descriptions once identifiers are known.
3. Post-creation correction: a description-only `PATCH /api/issues/{uuid}`
   `{"description": ...}` is safe even with live runs on the issue — it adds no
   comment and flips no status.

Same rule for the decision log: if the log body names originated issues by the
pre-creation guess, correct it with the full-body PUT (GET documents list →
`latestRevisionId` → PUT whole body with `baseRevisionId`) so the durable trail
carries no dead identifiers. Verify the fix via the documents LIST route (the
only working read path) before moving on.

## Execution mechanics that worked

- **Long multi-step mutation scripts: write_file + `python <absolute-path>` beats a
  long `<<'EOF'` heredoc.** A long heredoc containing apostrophes/smart quotes can
  die with `unexpected EOF while looking for matching ''` before python starts.
  The write_file pattern is lintable and matches the ephemeral-helper cleanup
  convention (`rm -f` after; keep the helper OUT of the repo tree or clean it up).
- **blockedBy verification:** the ISSUES LIST view can show `blockedBy: []` while the
  DETAIL GET shows the wiring persisted (`[{'identifier': 'SDS-31', 'status': ...}]`).
  Trust detail GET over list; re-PATCH only on detail-GET evidence.
- **Verification gate on deleted helpers:** the gate re-fires every turn for a
  created-then-deleted helper; re-run the same 14-check temp script fresh each turn
  (new `tempfile.mkstemp(prefix="hermes-verify-")` path, print the path + exit 0),
  asserting BOTH the board-side outcome AND the file's absence.
