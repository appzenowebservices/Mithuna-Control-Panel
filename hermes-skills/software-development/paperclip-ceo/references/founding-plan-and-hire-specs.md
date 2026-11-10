# Founding Plan Docs & Board Skill Catalog (new-company keystone work)

Session-derived (2026-08-12, Astrologics board SDS-31: "Define goal milestones
and founding plan"; pattern also verified on AppZeno XXX-88/79/78). Use when an
issue asks to decompose a company goal into motions and produce a committed plan
doc, or when writing hire specs that name skills.

## Board discovery (multi-board servers)

One local paperclip server hosts MULTIPLE companies — never assume the AppZeno
company. `GET /api/companies` → list with `name`, `issuePrefix`,
`issueCounter`, `status`, `brandColor`, `logoAssetId`. Match on `issuePrefix`
(e.g. issue "SDS-31" → the board whose prefix is "SDS").

- Issues: `GET /api/companies/{CID}/issues?limit=N` — full objects incl.
  `goalId`, `assigneeAgentId`, `executionRunId`, `status`, `blockedByIssueIds`.
  Filter by `identifier` client-side; the company-scoped per-issue path does NOT
  exist (use `GET /api/issues/{identifier}`).
- Goals: `GET /api/companies/{CID}/goals` — `id`, `title`, `description`,
  `level`, `status`, `ownerAgentId`. The goal title+description is the mission
  source for the recap section. **Goal milestones are NOT API-settable on the
  board** — the plan doc carries the milestone structure (explicit in SDS-31's
  acceptance criteria).
- Agents: `GET /api/companies/{CID}/agents` — `id`, `name`, `role`, `status`.
  Check who exists BEFORE naming milestone owners; a board may have only the CEO.
- Skill catalog: `GET /api/companies/{CID}/skills?limit=500` — each item has
  `slug` (the sync key the paperclip-create-agent flow uses), `sourceLocator`,
  `fileInventory`, `trustLevel`, `compatibility`. **Hire specs must cite slugs
  from this catalog, not prose skill names** — downstream hiring (e.g. the
  blocked hire issue) syncs exactly these. No astrology/domain skill may exist —
  name a new skill the hire authors during onboarding and say so explicitly.

## Plan-doc anatomy (keystone deliverable)

Committed at repo-root `docs/<company>-company-plan.md` (AppZeno used
`docs/appzeno-goal-milestones.md`). Structure:

1. Header: date, originating issue, goal id, "single source of truth" note.
2. Mission recap — from the goal title + description + company description.
3. Baseline (M0) — current state: which agents exist, which docs exist, what is
   blocked on this plan.
4. Milestone tables, **Land → Deliver → Org order** (motions may be listed
   ORG/LAND/DELIVER in the issue; the milestone structure follows
   Land/Deliver/Org). Each row: `| M# | milestone | owner | gate/acceptance |`.
   Every row names an owner; every gate is evidence-checkable on the board.
5. Team build plan — hire order WITH rationale (the product comes first, then
   whoever sells it, then whoever runs it); per role: why (goal link), scope,
   **skill slugs (board catalog)**, toolsets, reporting, first assignments,
   hire acceptance.
6. Service offering — what is sold, formats.
7. Pricing baseline — price list, terms (deposit %, turnaround), profitability
   guardrails (cost + margin floor, quote-approval threshold), floor.
8. Delivery model — pipeline stages each with a gate + explicit quality bar.
9. First-client intake plan — channel = board intake issue (the only verified
   message-receiving surface; no domain/MX, no form URL), form fields,
   qualification, first-N-clients offer.
10. Tracking — reviews check gates; "done" = gate evidence exists on the board.

AppZeno precedent docs to mirror: `docs/appzeno-goal-milestones.md`,
`docs/client-delivery-capability.md` (pricing baseline + delivery gates + hire
specs), `docs/client-service-offering.md` (intake path). Commit as
`docs: ... (ISSUE-ID)`. Close the issue via the single-call PATCH convention
(see `references/board-wake-audit-and-api.md`).

## Verifying the committed plan doc (ad-hoc script)

Docs have no canonical test suite — write a focused temp script
(`tempfile.gettempdir()/hermes-verify-<name>.py`, run it, delete it). Check:
- file tracked, `git status --porcelain` clean for it, HEAD commit matches
- required section headings present; ORG/LAND/DELIVER motions covered
- milestone rows parse to exactly M1..Mn in order, each row has owner + gate
- every cited skill slug ∈ live catalog (HTTP GET the skills endpoint)

Pitfalls hit in practice (all cost a re-run):
- **Lowercase `todo` is a board status word** ("SDS-32, todo, blocked on this
  plan"). A `\b(TODO|TBD|lorem ipsum)\b` placeholder check with `re.I` flags the
  status word — make the check case-sensitive (uppercase TODO/TBD only).
- **urllib to localhost times out when env proxies are set** (HTTP(S)_PROXY on
  Windows/git-bash). Fix: `urllib.request.build_opener(urllib.request.ProxyHandler({}))`.
  curl is unaffected — if curl works but urllib hangs, this is why.
- **Markdown bullet continuation lines**: `findall(r'`slug`', line)` sees only
  the first physical line of a wrapped bullet (e.g. "`humanizer` (reports must
  read like a...\n  `ocr-and-documents` ..." → misses later slugs). Capture the
  whole block:
  `re.findall(r"\*\*Skills \(board catalog slugs\):\*\*(.*?)(?=\n- \*\*|\Z)", text, re.S)`
  then collect backticked slugs, and exclude to-be-authored skills from the
  catalog-membership check.
