# XXX-102 — "npm run build not working ?!" (Mithuna, AppZeno board, 2026-08-15)

Full worked case for the `npm-build-troubleshooting` skill. The task arrived
as Paperclip issue XXX-102 ("Look into the git and make the npm run build
error fix") on the AppZeno board; the project is the Mithuna Vite/React
three.js app at `D:\Dev\agent\Mithuna` (a SUBDIRECTORY of the `D:\Dev\agent`
meta-repo — not its own git repo; `git archive HEAD Mithuna` is how you get
its committed state).

## Symptom

- `npm run build` in the working tree: SUCCEEDS (763 modules, `✓ built in
  7.13s`) — because `node_modules` was installed Aug 7 when the dependency
  tree was self-consistent.
- Fresh clone (committed state only) + `npm install`: FAILS.

## Root cause 1 — peer-range drift → ERESOLVE (install dies before build)

`package.json` declared `"@react-three/drei": "^10.7.7"`. Every drei 10.x
(10.7.7 AND 10.7.8, verified via `npm view @react-three/drei@<ver>
peerDependencies --json`) peers `@react-three/fiber@^9.0.0` + `react@^19`.
The app uses fiber `^8.17.0` + react `^18.3.1`.

Fresh `npm install` → `ERESOLVE unable to resolve dependency tree` /
`Could not resolve dependency: peer @react-three/fiber@"^9.0.0" from
@react-three/drei@10.7.8`. The local tree only survived because it was
installed before drei's peer bump (or with --legacy-peer-deps).

**Fix:** `"@react-three/drei": "^9.122.0"` — drei 9.x peers
`react ^18` / `@react-three/fiber ^8` / `three >=0.137`, an exact match for
the app. (App imports only `Html, useGLTF, useAnimations, Environment, Sky`
— all present in 9.x.)

## Root cause 2 — unanchored .gitignore rule swallowed source

Root `D:\Dev\agent\.gitignore` had `data/` (line 112) — a leftover rule for a
root-level `data/` dir that no longer exists. Unanchored patterns match at
ANY depth, so it excluded `Mithuna/src/data/` entirely.

`src/entities/NPC/Agents.jsx` imports `../../data/agentic` →
`src/data/agentic.js` (4.2 KB) was NEVER committed. Clean build died with:
`Could not resolve "../../data/agentic" from "src/entities/NPC/Agents.jsx"`.

**Fix:** anchor the rule to `/data/` (root-only), then `git add
Mithuna/src/data/agentic.js`. Cross-check after: `git check-ignore -v
Mithuna/src/data/agentic.js` → exit 1 (not ignored).

## Root cause 3 — lockfile untracked → unreproducible installs

`.gitignore` had `package-lock.json` (line 133) — file existed locally but
was never committed, so every fresh clone floated versions differently.

**Fix:** after the ignore rule add `!Mithuna/package-lock.json` (negation
must come after the rule). Then regenerate the lockfile with the fixed
package.json and commit it. Note the repo also carries a commented
"Lock files (optional...)" section — the active rule is what matters.

## Reproduction recipe used (clean-room, with C: drive full)

C: drive was 100% full (779 MB free) → first fresh-install attempt in
`C:\Users\pc\AppData\Local\Temp` died with `ENOSPC` + an esbuild
`The service was stopped: write EPIPE` crash. Recovery:

```bash
git archive HEAD Mithuna | tar -x -C /d/Dev/mithuna-fresh-test   # D: drive
cd /d/Dev/mithuna-fresh-test
sed -i 's/"@react-three\/drei": "\^10.7.7"/"@react-three\/drei": "^9.122.0"/' package.json
npm install --no-audit --no-fund --cache /d/Dev/.npm-cache       # cache off C:
mkdir -p src/data && cp /d/Dev/agent/Mithuna/src/data/agentic.js src/data/
npm run build   # first run: esbuild EPIPE crash → RETRY → ✓ built in 8.62s
```

Retry pattern confirmed: the esbuild EPIPE is transient; the second build run
succeeded (`✓ built in 8.62s`, 777 modules).

## Final verification

- Clean-room clone: fresh install completed, `npm run build` → `✓ built in
  8.62s`.
- Real repo (`D:\Dev\agent\Mithuna`): `npm install` (drei 9.122.0) + `npm
  run build` → `✓ built in 8.40s`.
- Git diff set (left uncommitted at session end): `.gitignore` (anchored
  `/data/` + `!Mithuna/package-lock.json`), `Mithuna/package.json` (drei
  ^9.122.0), new `Mithuna/package-lock.json`, new
  `Mithuna/src/data/agentic.js`.
