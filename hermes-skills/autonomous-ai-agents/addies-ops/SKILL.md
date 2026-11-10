---
name: addies-ops
description: "Operate the ADDies MCP server (orders, trips, vendors, stores, partners, users, leads) for the ApniDesi Dukaan (DCO) Paperclip company: stdio JSON-RPC client pattern, DNS bootstrap for Atlas SRV failures, tool reference and order-status schema traps."
version: 1.0.0
author: Hermes Agent
license: MIT
platforms: [windows, macos, linux]
metadata:
  hermes:
    house: 10
    domains: ["addies ops", "store ops"]
    tags: [paperclip, apnidesi, dukaan, dco, orders, mcp, addies]
    category: autonomous-ai-agents
    related_skills: [board-ops, algo-trader-ops]
---

# ADDies MCP Ops Skill

Operate the live ADDies platform (ApniDesi Dukaan e-commerce + ApniRide
deliveries) through its MCP server: **orders**, **trips**, **vendors**,
**stores**, **delivery partners**, **customer users**, and **onboarding
leads**. Used by **ApniDesi Dukaan** (Paperclip company prefix `DCO`,
companyId `9b4623fa-47b9-4f24-9f57-c6fc402fbde8`).

Mirror of `algo-trader-ops` (VANIK/GUP's trading MCP): the pattern is
"1 repo -> 1 mcp-server -> N role-agents". Companion to
`board-ops` for the board-side lifecycle (closing, recovery
wakes, verification). The paperclip-side skill at
`D:\Dev\appZeno\ADDies\mcp\skill-template\` is NOT indexed by Hermes —
read it from disk when you need its canonical procedure.

## When to Use

- Any DCO issue asking to list/query orders, trips, vendors, stores,
  partners, users, or leads.
- Task text mentioning `orders.list`, ADDies, ApniDesi, Dukaan, ApniRide,
  order statuses, or "no status changes".

## Server facts

- Repo: `D:/Dev/appZeno/ADDies` — `backend/` (Express + mongoose, MongoDB
  Atlas) and `mcp/` (TypeScript MCP server). Registered in Hermes
  `config.yaml` under `mcp_servers.addies` (stdio transport).
- stdio command: `node D:/Dev/appZeno/ADDies/mcp/node_modules/tsx/dist/cli.mjs
  --tsconfig D:/Dev/appZeno/ADDies/mcp/tsconfig.json
  D:/Dev/appZeno/ADDies/mcp/src/index.ts --stdio`
- Loads `DATABASE_URL` from the central `backend/.env` itself (Atlas cluster
  `addies.nukkvam.mongodb.net`).
- HTTP mode (`npm run dev`, `http://127.0.0.1:8768/mcp`) is usually NOT
  running — use stdio, like algo-trader.

## Tools

| Tool | Purpose |
|---|---|
| `hello` | Connectivity check (no DB touch) |
| `orders.list` / `orders.get` / `orders.updateStatus` | Orders; list filters by orderStatus + pagination (limit 1-500, offset), newest first |
| `trips.list` / `trips.get` / `trips.updateStatus` | ApniRide deliveries |
| `vendors.list` / `vendors.get` | Vendors |
| `stores.list` / `stores.get` | Stores |
| `partners.list` / `partners.get` / `partners.updateStatus` | Delivery partners (approve/suspend/reactivate) |
| `users.list` / `users.lookup` | Customer users (lookup by exact mobile/email) |
| `leads.list` / `leads.get` / `leads.updateStatus` | Onboarding leads (new -> contacted -> qualified -> approved/onboarded) |

## Schema traps (read the zod before filtering)

- `orders.list` `status` filter = **orderStatus enum only**:
  `created | confirmed | preparing | ready | assigned | arrived_at_pickup |
  out_for_delivery | delivered | cancelled`.
  **`pending` is NOT a valid orderStatus** — `pending` exists only in
  `paymentStatus` (`pending | paid | failed | refunded`), which
  `orders.list` cannot filter by (validation error `-32602`). A task saying
  "orders in status pending" is ambiguous: it may mean paymentStatus (needs
  a direct DB query — no MCP tool filters it) or the requester may not know
  the enum. Verify against `backend/models/order.js`, report the mismatch
  explicitly, and never fabricate counts/rows to satisfy the literal
  wording.
- `orders.list` response doc fields: `id` (string _id), `orderId`,
  `customerId`, `vendorId`, `items`, `totalQuantity`, `subtotalAmount`,
  `grandTotal`, `deliveryMode`, `orderStatus`, `deliveryStatus`,
  `assignedTo`, `paymentMethod`, `paymentStatus`, `isScheduled`,
  `isCancelled`, `source`, `createdAt` (from `timestamps.createdAt`).
  Response shape: `{total, count, status, orders[]}` where `total` =
  countDocuments for the filter.
- `orders.updateStatus` (and `trips.updateStatus` / `partners.updateStatus`
  / `leads.updateStatus`) are WRITES — never call them on a
  "no status changes" task (DCO-22 pattern). Map the task's verbs to tools
  BEFORE calling.

## Procedure

1. **Verify connectivity** — `hello` or `tools.list` via the stdio client.
   NOTE: `hello` does not touch the DB, so it succeeds even when the
   database is unreachable — never treat hello alone as proof of data
   access.
2. **Drive the tools** with the bundled client:
   `python "D:/Dev/agent/hermes-agent/skills/autonomous-ai-agents/addies-ops/scripts/addies_mcp.py" orders.list '{"status":"created","limit":3}'`
   (stdlib-only; supports `tools.list` and named tools with JSON args; the
   client auto-wires the DNS bootstrap below).
3. **Read-only discipline** — on report-only tasks, use only
   `.list`/`.get`/`.lookup` tools; assert in the report that no update
   tool was invoked.
4. **Report only observed tool output** — never invent ids, totals, or
   counts.
5. **Close the board issue per `board-ops` conventions.** For a
   recovery wake where the data source is unreachable, record the manual
   resolution (SDS-44 pattern: restore open state with one atomic PATCH +
   comment naming the blocker) instead of forcing `done` — acceptance
   criteria were not met.

## Pitfalls

- **Atlas SRV DNS failure (`querySrv ECONNREFUSED
  _mongodb._tcp.addies.nukkvam.mongodb.net`, observed 2026-08-15).** The
  local router DNS fails SRV queries; public DNS (8.8.8.8) resolves the
  records fine (`nslookup -type=SRV ... 8.8.8.8` shows shard hostnames).
  Fix: bootstrap the server process with
  `dns.setServers(["8.8.8.8","8.8.4.4","1.1.1.1"])` before importing the
  MCP entry (see `scripts/addies_bootstrap.ts`). TCP to the shard hosts on
  :27017 succeeds independently — verify with a raw socket if unsure.
- **10s buffering timeout on data tools even after DNS is fixed — ROOT CAUSE FOUND (2026-08-15 DCO-22): dual-mongoose instance mismatch.** `mcp/src/db.ts` hardcodes `serverSelectionTimeoutMS: 10_000` AND connects the MCP's own mongoose (mcp/node_modules, 8.24.3), while the backend models it wraps (`~/models/order` → backend/models/order.js) `require("mongoose")` and resolve to backend/node_modules (7.8.7) — a SECOND, never-connected instance. `connectDb()` succeeds, then `Order.find()` / `countDocuments()` die with "Operation ... buffering timed out after 10000ms" on the disconnected instance, even though Atlas is healthy (~450–500ms connect). Signature: `hello` OK, EVERY data tool times out at exactly 10s, and a direct probe using the backend's own mongoose + long timeouts connects instantly. Diagnose by replicating the tool path (connectDb then model query) and checking the two mongoose versions differ. Fix direction (server code, operator-side): connect the SAME mongoose instance the models use (import mongoose from the backend, or a single shared export). Until fixed, the sanctioned read-only fallback for report tasks is a direct mongoose probe — `scripts/addies-db-probe.py` in this skill (backend mongoose + 45s/30s timeouts + DNS preload, read-only only; still never call update tools).
- **Collection-name drift: model `'order'` → `orders` (EMPTY), live data in `Order` (observed 2026-08-15 DCO-22).** The model registers `mongoose.model('order', OrderSchema)`, so mongoose pluralizes to the `orders` collection — which holds 0 docs — while production data lives in a collection literally named `Order` (16 docs at observation), with flat top-level `createdAt` (the MCP tool reads `timestamps.createdAt`, also drifting). A data tool returning `total: 0` / empty rows may be hitting drift, not an empty DB. Before reporting "no orders", list collections with counts (probe `collections` mode) and sample raw docs; report the mismatch explicitly. Same check applies to every model/tool pair.
- **A transient `ECONNRESET` on the first data-tool call is NOT the diagnosis**
  (observed DCO-22, 2026-08-15): the first `orders.list` failed with
  `read ECONNRESET` (server mid-restart style), the immediate retry returned the
  real error (`buffering timed out after 10000ms`). Retry once before diagnosing
  systemic failure — the first call can die at the transport layer, not the DB.
- **Post-whitelist blockers are THREE code defects, not one (DCO-22 re-probe,
  2026-08-15, all confirmed live after the operator whitelisted the IP).** (1)
  dual-mongoose: `mcp/src/db.ts` connects the MCP's own mongoose v8, but tools
  import backend models (`~/models/order` → `backend/models/order.js`) on the
  backend's separate mongoose v7 whose connection never connects → the
  buffering timeout; (2) collection mismatch: the model maps to lowercase
  `orders` (0 docs) while live data sits in `Order` (16 docs); (3) createdAt
  mapping (NEW): live `Order` docs store `createdAt` TOP-LEVEL, but MCP
  `toOrderDoc` reads `record.timestamps?.createdAt ?? null` → would return
  `createdAt: null` for EVERY row even after fixes (1)+(2); the model schema's
  nested `timestamps` subdocument is schema drift vs the live docs. When the
  MCP server is code-broken but a report is due, drive the DB READ-ONLY with
  the bundled probe `scripts/addies-orders-probe.cjs` (pure-node, direct
  backend-mongoose connect, census + pending counts + top-3 in-progress rows,
  zero writes; output contract in the script header). Dev-side fix list:
  unify to one mongoose instance, point the model at collection `Order`, map
  `createdAt` from the top-level field.
- **Enum drift between layers.** MCP zod enums (validation authority for
  what the tool accepts) can differ from backend mongoose enums (what the
  DB schema allows). The MCP validation error text is the source of truth
  for tool calls.
- **Windows/MSYS rules** — forward-slash paths, `python` not `python3`,
  and write ad-hoc probe scripts under the OS temp dir, never the repo
  tree (the Hermes verification-gate flags repo-relative temp files; see
  board-ops). MSYS `/tmp` is invisible to NATIVE NODE too, not
  just Python: writing `dnsfix.cjs` via bash `printf ... > "$TMP/dnsfix.cjs"`
  then `NODE_OPTIONS="--require $TMP/dnsfix.cjs"` fails with
  `Cannot find module '/tmp/dnsfix_dco22.cjs'` (observed 2026-08-15
  DCO-22 re-probe). Write the preload file to a Windows-visible path on
  BOTH sides, e.g. `C:/Users/<user>/AppData/Local/Temp/dnsfix_atlas.cjs`
  (the bundled `addies_mcp.py` does exactly this via
  `tempfile.gettempdir()`), and reference that path in NODE_OPTIONS.
- **`mcp_servers` in Hermes config.yaml is the company-data index** —
  each Paperclip company has its own MCP repo under `D:/Dev/<company>`
  (VANIK=`trade-mcp`, Astrologics=`Astro-Logics`, AppZeno=`appZeno-web`,
  DCO=`ADDies`). When a wake mentions domain tools with an unfamiliar
  prefix, grep `config.yaml` `mcp_servers:` first.

## Verification

- `hello` returns server identity + timestamp.
- `orders.list` returns `{total, count, status, orders[]}`.
- No-status-change tasks: assert no `*.updateStatus` call was made (the
  client script exit code and the tool list printed make this auditable).

## References

- `scripts/addies_mcp.py` — stdio JSON-RPC client (tools.list + named
  tools with JSON args), auto-wires the DNS bootstrap.
- `scripts/addies_bootstrap.ts` — `dns.setServers` bootstrap entry that
  fixes the Atlas SRV lookup failure before the MCP server starts.
- `scripts/addies-db-probe.py` — reusable READ-ONLY probe (collections
  census + filtered find with sort/limit) against the live `Order`
  collection; use it instead of hand-writing a probe when verifying a
  DCO order report while `orders.list` is code-broken.
- `scripts/addies-orders-probe.cjs` — pure-node CJS read-only probe
  (DNS preload + backend mongoose + collection `Order`), exit 0 + `DONE`
  = clean run; the known-good recipe from the DCO-22 verification.
- `scripts/addies-db-probe.py` — READ-ONLY direct-mongoose probe for when
  MCP data tools fail (dual-mongoose bug, collection drift): lists all
  collections with doc counts, or queries any collection by filter/sort/
  limit, using backend mongoose + long timeouts + DNS preload.
- `scripts/addies-orders-probe.cjs` — READ-ONLY direct backend-mongoose
  probe for when the MCP server is code-broken (dual-mongoose /
  collection mismatch / createdAt mapping): collection census, status
  censuses, pending counts, top-3 in-progress rows. Zero writes.
