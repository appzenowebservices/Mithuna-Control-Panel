# Case: CRA build passes locally, fails in CI (appZeno-web, XXX-102)

Repo: `D:/Dev/appZeno/appZeno-web` — Create-React-App (react-scripts 5.0.1)
SPA + express 5 API (`server/index.js`, mongoose), migrated from Next.js
(remnants: tRPC in `src/trpc/`, prisma schema, `next.config.js`, Next-style
`eslint.config.js` — all unreachable/inert for the CRA build).

Issue: "npm run build not working". Symptom matrix:

| Environment | Result |
|---|---|
| plain `npm run build` (local) | PASS (exit 0, warnings only) |
| `CI=true npm run build` (Vercel/GH Actions) | FAIL — 411 warnings as errors |
| `docker compose build` | FAIL — `COPY --from=builder /app/.next ./.next` (dir doesn't exist in CRA) |

## Root causes

1. react-scripts treats eslint WARNINGS as errors when `CI=true`; the app had
   406 `no-unused-vars` + 5 `react-hooks/exhaustive-deps` across 39 files
   (template-generated pages with dozens of unused lucide-react icon imports).
2. Dockerfile was Next.js-era: built fine (`RUN npm run build`) but copied
   `.next` (CRA emits `build/`) and ran `npm start` (dev-mode concurrently
   server + react-scripts start) after `npm ci --omit=dev` stripped
   react-scripts → image could never run.
3. The express API never served the built SPA.

## Fixes

- **Warnings cleanup**: 3 parallel subagents (~13-16 files each, split to
  balance issue counts). Rules that worked: grep symbol before removing
  (zero usages required); strip named imports from braces / delete empty
  import lines; convert side-effecting `const _response = await X(...)` →
  `await X(...)` (drop binding, keep call); once-only effects got
  `// eslint-disable-next-line react-hooks/exhaustive-deps`; SearchModal
  useMemo got `[query, SECTIONS]`.
- **Dockerfile** → CRA-correct: builder `npm run build`; runtime
  `npm ci --omit=dev`, `COPY --from=builder /app/build ./build`,
  `COPY server ./server`, `COPY src ./src` (server seeds content from
  `src/data/content.js`), `CMD ["node", "server/index.js"]`, dropped
  `npx prisma generate`. **CORRECTION (close-out 2026-08-15):** the earlier
  claim that `grep -rn "@prisma/client" src/ server/` = no hits is FALSE —
  it hits `src/server/db.ts` (a dead Next.js tRPC remnant, unreachable from
  the CRA entry point, so the build passes regardless). Also, the
  `COPY prisma ./prisma` lines SURVIVED the first pass in both stages
  (harmless because `prisma/` is an empty dir) — the close-out removed them
  explicitly. Do not `grep`-prove deadness via @prisma/client alone; prove it
  via reachability from the entry point (the build passing is the proof).
- **server/index.js**: after all API routes,
  `app.use(express.static(buildDir))` + SPA fallback
  `app.get(/^\/(?!api(?:\/|$)).*/, ...)` sending `build/index.html` — the
  negative lookahead keeps `/api/*` on the API layer (unknown API paths fall
  through to 404).
- **docker-compose.yml**: added `SERVER_PORT: 3000` to preserve the port
  contract the external docker network expects.

## Verification (without touching prod data)

Server boot = `connectDB()` → `seedContent()` → `seedServices()` (Mongo
upserts). NEVER boot it for testing against a real `MONGODB_URI`. Instead:
`node --check server/index.js` + a scratch express harness that mounts the
exact same middleware against the real `build/` and asserts:
`/` → 200 text/html, `/services/x` → 200 text/html, `/static/js/...` → 200,
`/api/health` (registered before the fallback, like the real file) → 200 json,
`/api/nope` → 404. All 6 checks passed.

## Pitfalls hit

- **Complete fix left UNCOMMITTED by infra-dead prior runs (close-out,
  2026-08-15).** The issue's run feed showed 27 infra failures, yet the
  working tree already carried the ENTIRE fix (42 modified files) — a prior
  run applied all edits then died before `git commit`. The close-out session
  only had to verify builds (plain + `CI=true`, both green), finish the
  Dockerfile prisma-line removal, and commit (`2cc8f48`). A sibling run
  committed its own Portfolio.jsx fix (`62b034d`) mid-session — reflog showed
  it; HEAD moved, working tree stayed mine. Check `git status` before
  redoing any "broken build" work arriving from an issue tracker.
- **no-undef over-deletion**: a subagent removed `Gauge` from a lucide-react
  import while it was still used in two JSX data arrays → `'Gauge' is not
  defined`. Caught only by the full CI build (2 errors). Grep-before-remove
  should prevent this; the full build is the backstop.
- **Mid-delegation build = transient errors**: a `CI=true npm run build` run
  while subagents were still editing showed errors in a file whose import was
  temporarily inconsistent (re-added seconds later). Don't fix files that are
  currently being rewritten by a subagent — wait for completion, then build.
- **Duplicate repo copy**: the terminal session cwd was `/d/Dev/appzeno-origin-test`
  (a non-git copy of the project) while the real repo was elsewhere; `pwd` +
  `git status` caught it. Subagent instructions must state the exact repo
  path and warn about the trap.
- **Log parsing**: `CI=true npm run build > /tmp/b.log 2>&1` then a python
  parser (file headers are `src\path\file.jsx` lines; warning lines match
  `Line N:M: msg rule`). Write the parser to a file — heredocs mangle
  backslashes on git-bash. `/tmp` is not visible to Windows python; copy the
  log into the repo or `cygpath -w` it.
