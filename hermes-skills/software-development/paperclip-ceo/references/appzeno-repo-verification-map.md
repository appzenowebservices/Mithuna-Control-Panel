# AppZeno Repo Verification Map (ports + endpoint evidence)

Verified 2026-08-11 while closing XXX-61 (README.md audit). Use this map to
spot-check README/docs claims about the AppZeno monorepo (`D:\Dev\agent`)
without re-deriving the evidence from scratch — but ALWAYS re-grep before
citing it: the map is a starting point, not a substitute for independent
confirmation (code moves).

## Ports

| Claim | Evidence | Status |
|---|---|---|
| Mithuna dev port 3000 | `Mithuna/vite.config.js:66` — `port: 3000,` | verified |
| Paperclip port 3100 | `paperclip/server/src/config.ts:294` — `port: Number(process.env.PORT) \|\| fileConfig?.server.port \|\| 3100,` | verified |
| hermes-agent port 8765 | `hermes-agent/hermes_server.py:668` — `parser.add_argument("--port", type=int, default=8765, ...)` | verified |

## Communication paths

| Claim | Evidence | Status |
|---|---|---|
| Paperclip→Hermes HTTP `POST /api/v1/chat/sync` | route: `hermes-agent/hermes_server.py:484` (`@app.post("/api/v1/chat/sync")`); client: `paperclip/packages/adapters/hermes-http/src/server/http-client.ts:53` (`fetch(\`${this.endpoint}/chat/sync\`)`) | verified |
| Hermes→Paperclip presence POST | `hermes-agent/hermes_server.py:276` — `def report_presence(state="online", ...)` | verified |
| Paperclip→board-UI WS `/api/companies/:companyId/events/ws` | `paperclip/ui/src/context/LiveUpdatesProvider.tsx:1054` — `\`/api/companies/${encodeURIComponent(liveCompanyId)}/events/ws\`` | verified |
| Mithuna→Hermes WS `/api/v1/live` | `hermes-agent/hermes_server.py:583` — `@app.websocket("/api/v1/live")` | verified |

## Repo-layout gotchas (grep misses)

- **The Paperclip board UI lives under `paperclip/ui/`, NOT `Mithuna/`.** If a
  doc claims a "Paperclip→Mithuna" WS or names a board-UI file (e.g.
  `LiveUpdatesProvider.tsx`, `paperclipStore`), search `paperclip/ui/src/`
  first — searching `Mithuna/` for `events/ws` returns nothing and can wrongly
  fail a valid claim. `Mithuna/` is the separate 3D agent-visualization client.
- Root docs to verify exist before a README cites them: `Architecture.md`,
  `Design-Guide.md`, `flow.md` at repo root; `Mithuna/readme.md` (117 lines);
  `paperclip/AGENTS.md`.

## Doc-verification recipe (wake audits)

1. `read_file` the deliverable: record line count + byte size.
2. For every factual claim (ports, endpoints, paths), `search_files` the exact
   string and record `file:line`.
3. For "doc X exists" claims, verify the file is present (note its size).
4. Post an audit comment citing the `file:line` evidence, then close with the
   single-call `PATCH {"status":"done","comment":"<audit>"}` and confirm
   `completedAt` in the response (see `board-api.md` closing quirk).
