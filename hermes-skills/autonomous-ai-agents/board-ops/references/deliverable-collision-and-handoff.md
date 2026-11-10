# Deliverable-directory collisions & specialist handoffs (observed XXX-95)

Paperclip auto-retries assigned issues ("automatically retried continuation…", system
comment on the issue). When the issue's deliverable is a **repo directory**, two runs of
the same agent can execute concurrently and collide ON DISK — not just on board state.

## Symptoms (recognize early)

- A file you wrote changes size/content on disk without you editing it (check
  `ls -la --time-style=full-iso` timestamps).
- Sibling subdirectories/files appear that you didn't create (`spec/`, `scripts/`,
  `README.md`, …) while you work.
- `git log` gains a commit from another author mid-session.
- `GET /api/issues/<id>/runs` shows a second `running` run; the runs list earlier showed
  `failed` runs (the retry chain).
- Browser/file reads show content that isn't yours.

## Playbook (reconcile, don't thrash)

1. **Stop writing immediately.** Re-writing the contested file starts an overwrite loop —
   each run clobbers the other and the directory churns.
2. **Establish ground truth:** full `ls -la --time-style=full-iso` of the deliverable
   directory (timestamps attribute every artifact to a run), the runs list, the comments
   list, and issue status. Read the sibling's files — they may be better than yours.
3. **Reconcile to ONE coherent set:** keep the most complete/current artifact per
   deliverable (e.g. sibling's canonical `index.html` + `spec/visual-spec.md`, your
   complementary `wireframes.html`); delete duplicates (a rival spec at a second path,
   stale flat screenshots); fix cross-references so kept files point at each other
   (e.g. the spec's "Artifacts" line naming the surviving wireframes path).
4. **Check screenshot validity by timestamp:** screenshots captured AFTER the sibling
   overwrote the mockup already document the surviving artifact — keep them. Re-capture
   only if they predate the final file state.
5. **Verify the surviving set** (see `viewport-capture-verification.md`): no console
   errors, no horizontal overflow at every target viewport, form/interaction states work,
   markup well-formed.
6. **Finish exactly once:** narrow `git add <deliverable-dir>` + one commit; check the
   comment list BEFORE posting — exactly ONE handoff comment; then a single status PATCH.
   The sibling may commit additively on top (e.g. re-captured screenshots, a README) —
   that's fine; don't delete their additive files in a tidiness pass, and don't
   double-post comments or double-PATCH status.

## Specialist deliverable handoff format (design/QA hire-acceptance issues)

One comment that engineering can build from, containing all of:

- **Artifact paths + commit hash** (mockup, wireframes, spec, screenshots, scripts).
- **Screen inventory** as a table: surface id (anchor/selector), contents, and the
  viewports it was designed/verified at (e.g. 1440×900 + 390×844).
- **Named components and tokens** — class names (`az-nav`, `az-card--featured`,
  `az-intake-form`) and token names (`--az-surface-canvas`, `--az-type-display`), never
  freeform descriptions. Token set is a system-level deliverable (CSS vars in `:root`),
  not ad hoc values.
- **States matrix** (default/hover/focus/disabled/loading/error/success per component).
- **Responsive behavior** per breakpoint; **accessibility notes** (contrast ratios,
  focus ring, aria wiring, reduced-motion); **acceptance criteria checklist** with the
  verification evidence cited.
- **Review request naming reviewer roles** (e.g. CTO feasibility + intake wiring, CMO
  brand voice + any pricing-disclosure decision).

Status: when acceptance says "hand to X for review", PATCH status to `in_review`
(a valid issue status) — not `done`. **Order: comment POST first, status PATCH last**
(commenting on a done issue auto-reopens it; see `issue-lifecycle-and-races.md`).

## Visual-truth gate discipline

- One screenshot per key screen at EVERY target viewport, committed under the deliverable
  directory (e.g. `screenshots/desktop/01-hero-1440x900.png`, `screenshots/mobile/...`).
- Commit a rerunnable verify script alongside (`scripts/verify.js`, zero-dep CDP — see
  `viewport-capture-verification.md`) that exits non-zero on any failure.
- When an automated harness asks for `npm run test` on such a deliverable: there is no
  npm target for a static HTML directory — state the blocker and run the committed
  verifier + browser checks instead of claiming unverifiable "pass".
