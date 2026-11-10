---
name: viewport-screenshot-capture
description: Viewport-exact screenshots of HTML via headless Chrome CDP.
version: 1.0.0
author: Hermes Agent
license: MIT
platforms: [windows, linux, macos]
metadata:
  hermes:
    house: 3
    domains: ["screenshot", "capture viewport", "screen capture"]
    tags: [screenshots, headless-chrome, cdp, verification, design-handoff, visual-truth]
    related_skills: [claude-design, dogfood]
---

# Viewport-Exact Screenshot Capture

Capture pixel-exact screenshots of local HTML artifacts at any viewport (e.g. 1440×900 desktop,
390×844 mobile) using headless Chrome driven over the DevTools Protocol with **zero npm
dependencies** (Node ≥ 22 global `fetch` + `WebSocket`). Also covers verifying the captures
aren't blank and asserting layout/interaction behavior in the same session.

Built for visual-truth gates: design handoffs that require "at least one screenshot per key
screen at both viewports", regenerating screenshot sets after edits, and QA checks of local
HTML mockups. Pairs with `claude-design` (design process) and `dogfood` (QA).

## When to Use

- A deliverable requires screenshots at **exact viewport sizes** (1440×900, 390×844, …).
- You need full-page captures of long pages (`captureBeyondViewport: true`).
- You must prove a mockup renders (no console errors, sections visible, no blank shots)
  without a vision tool.
- You want per-section captures: scroll to each section, capture the viewport.

Do NOT use for: plain-text endpoints (curl is cheaper), interactive browser sessions
(browser_navigate tools), or pages that need JS-heavy login flows.

## Prerequisites

- Chrome or Edge installed. Default probe paths:
  `C:\Program Files\Google\Chrome\Application\chrome.exe`,
  `C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe` (Windows);
  `google-chrome` / `chromium` on Linux; `/Applications/Google Chrome.app/...` on macOS.
- Node ≥ 22 (global `fetch` + `WebSocket` — no `puppeteer`/`playwright` install needed).
- Python + Pillow only if you want the pixel-blank check (`scripts/check-pngs.py`).

## How to Run

```bash
node scripts/capture.js capture-config.json     # config-driven, writes PNGs
python scripts/check-pngs.py screenshots/desktop  # flags near-solid (blank) captures
```

## Quick Reference

| Need | CDP call |
| --- | --- |
| Spawn target | `PUT /json/new?about:blank` → `webSocketDebuggerUrl` |
| Set viewport | `Emulation.setDeviceMetricsOverride {width,height,deviceScaleFactor:1,mobile:false}` |
| Navigate | `Page.navigate {url}` then poll `document.readyState === 'complete'` |
| Viewport shot | `Page.captureScreenshot {format:'png'}` — **no clip** (see Pitfalls) |
| Full-page shot | `Page.captureScreenshot {format:'png', captureBeyondViewport:true}` |
| Console errors | listen `Runtime.exceptionThrown` + `Log.entryAdded` (enable `Log`) |

## Procedure

1. **Launch** Chrome: `--headless=new --disable-gpu --hide-scrollbars --no-first-run
   --remote-debugging-port=<port> --user-data-dir=<tempdir>` on `about:blank`.
2. **Connect**: poll `http://127.0.0.1:<port>/json/version`, then `PUT /json/new?about:blank`,
   open the returned `webSocketDebuggerUrl` with `new WebSocket(url)`.
3. **Set viewport** with `Emulation.setDeviceMetricsOverride` (`mobile:false` is enough for
   responsive pages that carry a proper `<meta name="viewport">`).
4. **Navigate** (`file://` URLs work), poll `readyState === 'complete'`, then
   `await document.fonts.ready` + ~1.2s settle so web fonts paint (else screenshots show
   fallback fonts).
5. **Force reveal elements visible** before any capture: `document.querySelectorAll('.reveal')
   .forEach(el => el.classList.add('visible'))` — opacity-0 reveal-on-scroll classes leave
   below-fold content invisible in full-page captures.
6. **Per-section shots**: set `document.documentElement.style.scrollBehavior='auto'` (smooth
   scroll is async and races the capture), `window.scrollTo(0, elTop - navOffset)`, verify via
   `getBoundingClientRect().top ≈ navOffset`, wait ~700ms, then `Page.captureScreenshot`
   **without clip**.
7. **Full-page shot**: `captureBeyondViewport: true` (works even after scrolling).
8. **Check console errors**; kill Chrome and remove the temp user-data dir.

## Pitfalls

- **`clip` on a scrolled page returns a solid blank.** `Page.captureScreenshot` with
  `clip:{x:0,y:0,width,height}` AFTER a `window.scrollTo` captures an empty canvas-colored
  frame (in Chrome headless=new). Symptom: PNG file suspiciously tiny (a 1440×900 content shot
  is ≥50 KB; a blank is ~3–6 KB) and pixel analysis shows exactly 1 distinct color. The
  no-clip call returns the visible viewport at the current scroll position correctly. If you
  need a bounded region, pass clip WITH `captureBeyondViewport:true` — that combination works.
  See `references/blank-capture-debugging.md` for the isolation matrix.
- **Smooth scroll races the capture.** `html{scroll-behavior:smooth}` makes `window.scrollTo`
  animate; a 600ms wait is not enough for long pages. Set `scrollBehavior:'auto'` on the
  documentElement first, then verify the target's `getBoundingClientRect().top` before shooting.
- **Reveal-on-scroll classes blank out below-fold content** in full-page captures — force
  `.visible` (or equivalent) via JS before capturing.
- **Fonts**: capture before `document.fonts.ready` resolves → fallback fonts in the PNG even
  when the live page looks right.
- **Windows path quirk**: the `--screenshot` CLI flag needs a real Windows path
  (`D:\...\out.png` works; `C:\tmp\...` fails if that dir doesn't exist in Windows terms —
  git-bash `/tmp` is not a Windows path). Prefer the CDP path (this skill) which writes via
  Node `fs`.
- **Don't trust file existence — check pixels.** A "successful" capture can be solid blank.
  Run `scripts/check-pngs.py` (mean color + distinct-color count on a downsampled 64×40 grid);
  `distinct == 1` = blank capture. Also assert `window.scrollY` and section `top` in the same
  CDP session — they prove the scroll landed even when the image lies.
- **Layout/interaction verification** belongs in the same CDP session: evaluate
  `document.documentElement.scrollWidth <= clientWidth` (horizontal overflow),
  `getComputedStyle` for breakpoint behavior (grid column counts, font sizes, nav display),
  hit targets ≥ 44px, `aria-expanded` after clicking a menu toggle, form error/success states.
  This catches regressions without a vision tool.

## Verification

1. `node scripts/capture.js <config>` → every expected PNG exists at the exact pixel size.
2. `python scripts/check-pngs.py <dir>` → no near-solid captures.
3. Console-error listener reported nothing.
4. If the artifact changed after capture, re-run the full config — stale screenshots are a
   classic visual-truth failure.

## Scripts

- `scripts/capture.js` — config-driven CDP capture runner (jobs: url, viewport, sections,
  full-page). Generic; reuse verbatim.
- `scripts/check-pngs.py` — PIL pixel-stat blank detector for a directory of PNGs.
