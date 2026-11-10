# Debugging: "successful" CDP capture is a solid blank

Observed August 2026 on Chrome `--headless=new` (Windows). A per-section capture after
`window.scrollTo` produced a PNG that was exactly `--surface-canvas` color — zero content —
while the scroll position, DOM state, and console were all clean. The capture *succeeded*
(no error, correct pixel dimensions); only the pixels were wrong.

## Isolation matrix (what proved the root cause)

Same page, same scroll position (`scrollY=1646`, `#engagement` top at 64px), five captures:

| Capture | Parameters | Result |
| --- | --- | --- |
| A. top of page, with `clip:{0,0,1440,900}` | before scroll | content ✓ (495 distinct colors) |
| B. top of page, no clip | before scroll | content ✓ (495) |
| C. scrolled, with `clip:{0,0,1440,900}` | after scroll | **solid blank ✗ (1 distinct color)** |
| D. scrolled, no clip | after scroll | content ✓ (545) |
| E. scrolled, `clip` + `captureBeyondViewport:true` | after scroll | content ✓ (438) |

Verdict: `clip` on a scrolled page → blank; everything else works. The clip is evidently
interpreted against a stale/unscrolled frame. Fix: drop `clip` (no-clip = exactly the visible
viewport at current scroll) or add `captureBeyondViewport:true` when you need a bounded region.

## Red herrings ruled out along the way

- **Smooth scroll race** — real but not the cause here: `html{scroll-behavior:smooth}` makes
  `window.scrollTo` animate, and mid-animation captures show *partial content*, not blank.
  Still fix it (set `scrollBehavior:'auto'`) and verify `getBoundingClientRect().top` after
  scrolling, because partial-content shots are the other failure mode.
- **Reveal-on-scroll opacity** — real but not the cause: forcing `.visible` on all `.reveal`
  elements fixed full-page captures, not section captures.
- **File size heuristics** — a 1440×900 blank is ~3–6 KB; content is ≥50 KB. Useful as a
  first sniff, not proof: hero (content) was 130 KB while the blanks were 5.8 KB.
- **PIL pixel stats are the proof**: downscale to 64×40, count distinct colors. Blank = 1
  distinct color, mean exactly the canvas hex (e.g. `rgb(250,248,242)` for `#FAF8F2`).
