# Viewport screenshot capture & mockup verification (system Chrome, no browser install)

Used for the visual-truth gate on design deliverables: render an HTML mockup at exact
viewports (e.g. 1440×900, 390×844), capture per-section + full-page screenshots, and run
structural/interaction checks. Works on Windows without installing a browser.

## Setup (once)

```bash
mkdir -p /tmp/shots && cd /tmp/shots && npm init -y >/dev/null && npm i puppeteer-core --no-audit --no-fund
```

`puppeteer-core` is tiny (no browser download) — it drives the system browser:
- Chrome: `C:/Program Files/Google/Chrome/Application/chrome.exe`
- Fallback Edge: `C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe`

## Puppeteer-core recipe (screenshots)

```js
const puppeteer = require('puppeteer-core');
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new',
  args: ['--no-sandbox', '--disable-gpu', '--hide-scrollbars'] });
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900 });
await page.goto('file:///D:/.../index.html', { waitUntil: 'networkidle0', timeout: 30000 });
await page.evaluate(() => document.fonts.ready);           // fonts render late — wait
await page.evaluate(() => { document.documentElement.style.scrollBehavior = 'auto'; }); // avoid mid-scroll captures
await page.screenshot({ path: out + '-full.png', fullPage: true });
// per-section viewport shots:
await page.evaluate((s) => document.querySelector(s).scrollIntoView({ block: 'start' }), sel);
await new Promise(r => setTimeout(r, 450));                 // settle before capture
await page.screenshot({ path: out + '-' + name + '.png' }); // viewport-sized
```

Loop the same at each target viewport (setViewport again for mobile). Name files
`<viewport>-<section>.png` (e.g. `desktop-hero.png`, `mobile-intake.png`).

## Zero-dependency CDP alternative (what a committed verify.js should use)

No npm deps at all — spawn Chrome and talk CDP over a WebSocket:

1. Spawn: `chrome.exe --headless=new --disable-gpu --no-first-run
   --remote-debugging-port=<port> --user-data-dir=<mkdtemp>` (unique user-data-dir per
   launch — profile-lock errors otherwise).
2. Poll `http://127.0.0.1:<port>/json/version`, then `PUT /json/new?about:blank` →
   `webSocketDebuggerUrl`.
3. Over the WS: `Page.enable`, `Runtime.enable`,
   `Emulation.setDeviceMetricsOverride {width,height,deviceScaleFactor:1}`,
   `Page.navigate`, poll `document.readyState === 'complete'` via `Runtime.evaluate`,
   then run checks (`returnByValue: true`), `Page.captureScreenshot` for images.

## Checks that catch real regressions (the 18-check pattern)

Per viewport (1440×900 + 390×844):
- horizontal overflow: `document.documentElement.scrollWidth <= clientWidth`
- hero display font-size (desktop vs mobile breakpoint values)
- sticky nav; primary button min-height ≥ 48px
- component counts (service cards, price cards, process steps, form controls)
- featured-card background color (token check)
- mobile only: burger visible, grids collapse to 1 column, inline nav hidden,
  menu opens (class toggle after click), empty submit → expected error count,
  filled submit → success panel + 0 invalid fields

Print `PASS/FAIL [viewport] name: got=… expected=…`, count, and `process.exit(1)` on any
failure so the script doubles as CI. Also: `prefers-reduced-motion` respected, focus-visible
ring present, markup well-formed (tag-balance parse).

## Pitfalls

- Fonts render late on `file://` — always `await document.fonts.ready` + a settle delay
  before capturing or screenshots show fallback type.
- `scroll-behavior: smooth` on `<html>` causes mid-scroll captures — set it to `auto`
  before scrolling programmatically.
- `--hide-scrollbars` keeps shots clean; `fullPage: true` for whole-page evidence.
- `networkidle0` on `file://` resolves instantly — no extra wait cost.
