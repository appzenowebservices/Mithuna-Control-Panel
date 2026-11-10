---
name: design-handoff
description: "Design handoff packages with verified screenshots."
version: 1.0.0
author: hermes-agent
license: MIT
platforms: [linux, macos, windows]
metadata:
  hermes:
    house: 5
    domains: ["design handoff", "design specs"]
    tags: [design, handoff, wireframes, visual-spec, mockup, screenshots, ui]
    related_skills: [claude-design, sketch, popular-web-designs, ui-ux-agent, paperclip-ceo]
---

# Design Handoff Skill

Produce a build-ready design handoff for a client-facing surface (landing page,
intake form, app UI): wireframes at both target viewports, a system-level visual
spec (named tokens + named components), a high-fidelity clickable HTML mockup,
verified screenshots as the visual-truth gate, and ONE handoff comment that
engineering can build from. Used for the Designer role (hire spec A) on
delivery-pipeline projects; the intake-landing handoff (XXX-95) is the reference
implementation.

## When to Use

- An issue asks for wireframes, mockups, visual spec, or a "design handoff" for
  a client-facing surface.
- A hire-acceptance or delivery-gate issue requires design deliverables +
  screenshots at specified viewports (e.g. 1440×900 desktop AND 390×844 mobile).
- You need to hand design to engineering with named components/tokens rather
  than freeform descriptions.

## Prerequisites

- The source-of-truth docs: offering/capability/pricing docs in `docs/`
  (e.g. `docs/client-delivery-capability.md`, `docs/client-service-offering.md`)
  and the brand-voice reference (CMO blog post). Copy must be grounded in these —
  no invented metrics or testimonials.
- Chrome at the default path (or override in capture config) + Node for
  screenshot capture; Python + Pillow for blank-frame verification.
- Paperclip board access for the handoff comment + review handoff.

## How to Run

1. **Read source docs** — services, engagement types, pricing baseline, process
   gates, brand voice. Extract the exact claims the page may make.
2. **Wireframes** — one HTML deck, every key screen at BOTH target viewports,
   each panel labeled `surface — viewport`. Key surfaces for a landing:
   hero/value prop, services, engagement/pricing, evidence/process, intake CTA.
3. **Visual spec** (`spec/visual-spec.md`) — system-level token set, not ad hoc
   values: color, type scale, spacing, radii, shadows, motion, breakpoints;
   named components + variants + states (default/hover/error/empty); responsive
   behavior; accessibility notes; acceptance criteria.
4. **HTML mockup** — single responsive file implementing every token as CSS
   custom properties (`--az-*` prefix pattern). All nav anchors scroll; forms
   show error AND success states; no console errors.
5. **Screenshots** — capture every key screen at both viewports + full-page
   (`scripts/capture.js` CDP pattern; `scripts/verify-screenshots.py` to gate).
6. **Verify** — layout + interaction checks at both viewports (overflow, type
   scale, component counts, menu open, form error/success). See Pitfalls.
7. **Commit** artifacts under `design/<surface>/`, then post ONE handoff comment
   naming components + tokens (never freeform descriptions), with screen
   inventory, responsive behavior, accessibility notes, acceptance criteria.
8. **Hand off for review** — create review issues assigned to the CTO
   (engineering feasibility) and CMO (brand voice), parented to the design
   issue; close the design issue with a single-call PATCH
   (`{"status":"done","comment":"..."}`) — never a comment after a done-PATCH.

## Quick Reference

- Artifact layout: `index.html` (mockup), `wireframes.html`, `spec/visual-spec.md`,
  `screenshots/desktop/` + `screenshots/mobile/`, `scripts/capture.js` +
  `capture-config.json`, `scripts/verify.js`, `README.md`.
- Verification command: `node scripts/verify.js` (layout/interaction gate).
- Blank-frame probe: `python scripts/verify-screenshots.py <glob>`.

## Pitfalls

- **Blank screenshots are the #1 silent failure.** A capture script can emit
  solid-color frames at the right filename + viewport. Detect via
  `scripts/verify-screenshots.py`: resize to 50×50, count unique colors — 1–2
  unique = blank. Identical byte sizes across a batch is also a red flag
  (repeated blank frames). ALWAYS run the probe before committing; a commit of
  blank captures fails the visual-truth gate.
- **Section captures need scroll-aware framing.** Sticky nav (~64px) means the
  capture must scroll the section top to `-64px` or the section hides under the
  nav. Verify scroll position + section bounding rect in the capture script
  output (`section.top` ≈ 64 after scroll).
- **Sibling subagents may be editing the same files.** If a sibling run is
  regenerating captures or patching the spec concurrently, re-read before
  patching (the tool will warn "modified by sibling subagent") and let the tree
  settle before committing. Verify the final commit contains the fixed
  captures, not the stale ones.
- **Windows/git-bash JSON posting.** Inline `curl -d` with multi-line JSON gets
  mangled (backticks → command substitution). Use `write_file` for the payload +
  Python `urllib.request` POST. See `paperclip-ceo` skill reference.
- **Single-call close.** Close the design issue with PATCH status+comment
  together; a separate comment after a done-PATCH reopens the issue.

## Verification

1. `node scripts/verify.js` — 18/18 checks pass at both viewports (overflow,
   type scale 64px/40px, sticky nav, component counts, form error + success).
2. `python scripts/verify-screenshots.py screenshots/**/*.png` — no BLANK frames.
3. Handoff comment names components + tokens; artifacts committed; screenshots
   at both viewports; no console errors.
