#!/usr/bin/env node
/**
 * capture.js — viewport-exact screenshots via headless Chrome DevTools Protocol.
 * Zero dependencies (Node >= 22 global fetch + WebSocket). Config-driven; reuse
 * verbatim for any visual-truth gate (design handoffs, QA, docs).
 *
 * Usage: node capture.js <config.json>
 *
 * Config shape:
 * {
 *   "chrome": "optional path override",
 *   "jobs": [
 *     {
 *       "url": "file:///.../index.html",
 *       "viewport": [1440, 900],
 *       "out": "screenshots/desktop",          // resolved relative to ../ (project root)
 *       "name": "optional single-shot name (else uses sections)",
 *       "full": true,                          // also capture full-page
 *       "sections": [ {"sel": ".az-hero", "name": "01-hero"} ]
 *     }
 *   ]
 * }
 */
"use strict";
const { spawn } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const CHROME_DEFAULT = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const EDGE_DEFAULT = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const cfg = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
  const chromePath = cfg.chrome || (fs.existsSync(CHROME_DEFAULT) ? CHROME_DEFAULT : EDGE_DEFAULT);
  const port = 9300 + Math.floor(Math.random() * 500);
  const userDir = fs.mkdtempSync(path.join(os.tmpdir(), "az-cdp-"));
  const base = `http://127.0.0.1:${port}`;

  const proc = spawn(chromePath, [
    "--headless=new", "--disable-gpu", "--hide-scrollbars",
    "--no-first-run", "--no-default-browser-check",
    `--remote-debugging-port=${port}`, `--user-data-dir=${userDir}`,
    "about:blank",
  ], { stdio: "ignore" });
  const cleanup = () => { try { proc.kill(); } catch {} try { fs.rmSync(userDir, { recursive: true, force: true }); } catch {} };
  process.on("exit", cleanup);

  let version = null;
  for (let i = 0; i < 60; i++) {
    try { version = await fetch(`${base}/json/version`).then((r) => r.json()); break; }
    catch { await sleep(250); }
  }
  if (!version) { console.error("DevTools did not come up"); cleanup(); process.exit(1); }

  const target = await fetch(`${base}/json/new?about:blank`, { method: "PUT" }).then((r) => r.json());
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });

  let msgId = 0;
  const pending = new Map();
  const consoleErrors = [];
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const p = pending.get(msg.id); pending.delete(msg.id);
      msg.error ? p.rej(new Error(msg.error.message)) : p.res(msg.result);
    } else if (msg.method === "Runtime.exceptionThrown") {
      consoleErrors.push(msg.params.exceptionDetails.text || "exception");
    } else if (msg.method === "Log.entryAdded" && msg.params.entry.level === "error") {
      consoleErrors.push(msg.params.entry.text);
    }
  };
  const send = (method, params = {}) => new Promise((res, rej) => {
    const id = ++msgId; pending.set(id, { res, rej });
    ws.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async (expression) => {
    const r = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    return r.result && r.result.value;
  };

  await send("Page.enable");
  await send("Runtime.enable");
  await send("Log.enable");

  for (const job of cfg.jobs) {
    const [w, h] = job.viewport;
    const outDir = path.resolve(__dirname, "..", job.out);
    fs.mkdirSync(outDir, { recursive: true });
    await send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 1, mobile: false });
    await send("Page.navigate", { url: job.url });
    for (let i = 0; i < 60; i++) {
      const ready = await evaluate("document.readyState === 'complete'");
      if (ready) break; await sleep(200);
    }
    await evaluate("document.fonts ? document.fonts.ready.then(()=>true) : true");
    await sleep(1200);

    // force reveal-on-scroll elements visible (else below-fold content is opacity 0)
    await evaluate("document.querySelectorAll('.reveal').forEach(el=>el.classList.add('visible'))");

    if (job.full) {
      const shot = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true });
      const file = path.join(outDir, `${job.name || "full-page"}-${w}x${h}.png`);
      fs.writeFileSync(file, Buffer.from(shot.data, "base64"));
      console.log(`  full-page ${w}x${h} -> ${file}`);
    }
    for (const sec of job.sections || []) {
      // instant scroll (smooth scroll races the capture), then VERIFY the scroll landed
      await evaluate(`(()=>{const el=document.querySelector(${JSON.stringify(sec.sel)});if(!el)return false;document.documentElement.style.scrollBehavior='auto';const y=el.getBoundingClientRect().top+window.scrollY-64;window.scrollTo(0,Math.max(0,y));return true})()`);
      await sleep(700);
      const check = await evaluate(`(()=>{const el=document.querySelector(${JSON.stringify(sec.sel)});const r=el.getBoundingClientRect();return {scrollY:window.scrollY,top:Math.round(r.top),bottom:Math.round(r.bottom),vh:window.innerHeight}})()`);
      console.log(`  [check] ${sec.name}: scrollY=${check.scrollY} section.top=${check.top} vh=${check.vh}`);
      // NOTE: no clip param — clip on a scrolled page captures a solid blank (see SKILL.md pitfalls)
      const shot = await send("Page.captureScreenshot", { format: "png" });
      const file = path.join(outDir, `${sec.name}-${w}x${h}.png`);
      fs.writeFileSync(file, Buffer.from(shot.data, "base64"));
      console.log(`  section ${sec.name} @ ${w}x${h} -> ${file}`);
    }
  }
  if (consoleErrors.length) { console.error("Console errors:"); consoleErrors.forEach((e) => console.error("  -", e)); }
  else console.log("No console errors.");
  ws.close(); cleanup();
}
main().catch((e) => { console.error(e); process.exit(1); });
