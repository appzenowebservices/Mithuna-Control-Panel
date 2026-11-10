# Content-Deliverable Checklist (one-pager / blog / docs on Paperclip issues)

Session-derived (SDS-39, Astrologics Growth Marketer first assignment,
2026-08-12). Use for specialist content wakes that commit docs or blog posts
to the shared workspace repo.

## Content contract checks (service one-pager)

- All required service lines present, spelled as in the task (natal chart
  reading, synastry, yearly forecast, life-theme deep dive, business timing).
- Formats covered: written / live / combined + subscription.
- Pricing parity with the plan of record: every `$` band from the source doc
  appears in the derived doc. Quick check:

  ```python
  import re, pathlib
  src = pathlib.Path("docs/astrologics-company-plan.md").read_text()
  dst = pathlib.Path("docs/astrologics-service-offering.md").read_text()
  a = set(re.findall(r"\$(\d+(?:–\d+)?)", src))
  b = set(re.findall(r"\$(\d+(?:–\d+)?)", dst))
  print("missing from derived:", sorted(a - b))
  ```

- Terms verbatim: deposit %, turnaround window, first-N-client discount,
  minimum-engagement floor, free re-read window.
- Intake path present (board URL + the named intake surface, e.g. "intake issue").
- No fabricated testimonials: no quoted praise, ratings, or star symbols.
- Disclaimer present (reflection/entertainment, not medical/legal/financial advice).

## Content contract checks (blog post)

- Domain facts accurate (verify against standard teaching, not vibes —
  e.g. Sun sign = Sun's position, rising sign changes ~every 2 hours).
- Every "guarantee"/"predict"/"outcome" occurrence is negated.
- CTA is a clickable link in the FINAL PROSE section and asks for the intake
  fields (birth data + question) plus the scope-approval step.
- Blog index README lists the post; the index link target exists on disk.

## Humanizer audit (measurable pass)

- `grep -o '—' <file> | wc -l` — rewrite parenthetical em-dash pairs to
  parens/commas; keep only structural dashes (titles, list separators,
  footers). Observed targets: 6 for a 95-line one-pager, 1 for a 92-line
  blog post (from 14/10 before the pass).
- `grep -oiE 'unlock|journey|empower|delve|testament|vibrant|holistic|seamless|transformative|embark' <file>` → zero.
- `grep -oiE 'underscores|highlights the|showcases|fostering|symbolizing' <file>` → zero.

## Verification-evidence pattern

Markdown edits have no canonical suite. When the harness asks for
verification evidence, write a focused temp script (OS temp dir, filename
prefix `hermes-verify-<topic>.py`), assert content contracts + git facts,
run it, delete it, and report explicitly as ad-hoc verification, not suite
green.

Git facts worth asserting: the commit contains EXACTLY the intended files
(`git show --name-only --format= <hash>`), and `git status --short` is clean
for the touched paths.

## Pitfalls learned

- **"Ends with CTA" check**: when a post has a footer after a `---`
  separator, split on `---` and inspect the SECOND-TO-LAST chunk (the final
  prose section), not the last chunk (the footer). The first version of this
  check failed against a correct artifact.
- **Sibling wakes patch skill references too**: parallel wakes update shared
  reference files (e.g. `paperclip-ceo/references/astrologics-board-state.md`);
  a failed patch or "modified since last read" warning means a sibling landed
  the same territory — fill only the gap you own, skip duplicated sections.
- **Narrow commits**: `git commit -m ... -- <files>` with only your paths;
  re-verify `git status --short` on those paths right before committing.
- **Pricing parity catches copy drift**: the one-pager's price bands and the
  plan of record must match exactly — a regex `$`-amount diff is the fastest
  way to prove it before closing.

## Content contract checks (outreach sequences + prospect list — SDS-47)

The demand-gen doc pair (sequences + prospect list) has its own contract,
beyond the one-pager/blog checks:

- **CTA on a live intake surface, verified fresh.** Every template ends in
  the intake-channel CTA; re-GET the channel issue THIS wake and confirm it
  is standing/never-closed with zero client briefs (an M1 self-test comment
  labeled "not a client brief" doesn't count). CTA must be clickable (board
  URL) in the doc.
- **Role-titled contacts only.** Prospect lists name archetypes + public
  signal sources (thread, launch, community), never fabricated people. The
  as-sent touch-1 message may keep exactly ONE slot (`[First name]`,
  resolved at reply time); every other bracket must be filled with the
  prospect's listed signal. Regex the as-sent section and assert the only
  remaining bracket is the greeting slot.
- **"Touch 1 sent" with no outbound transport.** When the host has no
  email/social transport (empty `~/.hermes/.env`, no himalaya/gws/xurl
  config), the honest send record = exact message text in the doc's touch
  log + tracker moved to Contacted + dispatch through the board (the only
  live messaging surface) + a plain statement of the mechanism in the
  evidence comment. Never claim an email was delivered to an inbox.
- **Follow-up touches scheduled with dates** (day-3/5/10/18-style cadence),
  hard stop after the final touch, 90-day recycle.
- **Pipeline entry updated with the exact path** (prospect → intake →
  Gate 1 qualify → scoping) in the tracker's Next-action cell.
- **Pricing quoted selectively is still verbatim.** Unlike the one-pager
  (plan ⊆ derived), sequences/prospect lists quote only the bands the copy
  uses: check `derived ⊆ plan` (no invented bands) AND the quoted bands
  appear verbatim (en-dash ranges, `/mo` suffix).

## Check-design lessons (verification scripts for markdown deliverables)

- **Parity direction matters.** `plan ⊆ derived` for docs that must
  reproduce ALL pricing (one-pager); `derived ⊆ plan` for docs that quote
  selectively (outreach copy). A naive plan-subset check on the latter
  fails on plan numbers the copy legitimately never quotes ($0.50–$5 infra
  cost, $750 revenue, $500 CEO-approval line).
- **Em-dash audit: account structural positions, not a flat count.** Count
  per line class: heading lines (`#`), email sign-offs (`> — [Sender]`),
  table rows (`| ... | — |`), footer; non-structural = total − structural.
  A flat grep on a template-heavy doc reads 50+ and looks like a failed
  humanizer pass when it's actually structural dashes inside 13 embedded
  emails. Watch double-counting in the structural list (e.g. `### B1 —`
  matching both `### B1 — Cold email` and `### B1 — sent`).
- **"No quoted praise" needs a praise lexicon, not any-quote.** Template
  personalization examples (`"you've been reading your sun sign..."`) and
  anti-target phrases (`"tell me my horoscope"`) are legitimate quotes.
  Check for praise signals (5 stars / amazing / wonderful / couldn't
  recommend / ★) and star symbols instead.
- **Never assert "my section is the last section" on shared reference
  files.** Parallel wakes append to `astrologics-board-state.md` mid-wake
  (observed SDS-47: the SDS-49 Strategic Review landed its section right
  after mine). The correct assertion is *preservation*: my content present +
  prior sections intact (and the sibling's section often corroborates your
  delivery — cite it). Writer-order assertions fail against legitimate
  sibling appends and produce false FAILs that cost a re-run.
- **Run dash/price audits in Python, not shell grep, on Windows git-bash.**
  `grep -o '—'` counts a bare literal fine, but `grep -oE '\$[0-9]+[–—][0-9]+'`
  silently returns zero on files containing `$120–$250` — MSYS mangles
  non-ASCII patterns in classes/regexes. Use a Python heredoc with
  `re.findall(r'\$[\d]+[' + '\u2013\u2014' + r'][\d]+...')` or literal
  Unicode; deterministic across the whole pricing cross-check.
