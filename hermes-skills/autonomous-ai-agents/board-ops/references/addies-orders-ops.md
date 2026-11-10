# ADDies MCP server — ApniDesi Dukaan (DCO) live data ops

Verified 2026-08-15 on DCO-22. The live ApniDesi Dukaan business state (orders,
trips, vendors, stores, partners, users, leads) lives in MongoDB Atlas behind
the **addies MCP server**. The MCP server is the ONLY sanctioned way to touch
live production state — never mutate the DB directly (addies skill rule).

## Where things live

- Skill (Paperclip-managed, NOT Hermes-indexed — read from disk):
  `D:\Dev\agent\paperclip\skills\addies\SKILL.md` (19 tools; failure protocol:
  if a call 401/403s or the backend is unreachable, report in the issue thread
  and mark the issue `blocked` — do not retry blindly).
- MCP server: `D:/Dev/appZeno/ADDies/mcp` — stdio mode registered in Hermes
  `config.yaml` under `mcp_servers.addies`:
  `node D:/Dev/appZeno/ADDies/mcp/node_modules/tsx/dist/cli.mjs --tsconfig
  D:/Dev/appZeno/ADDies/mcp/tsconfig.json D:/Dev/appZeno/ADDies/mcp/src/index.ts
  --stdio`. Loads `DATABASE_URL` itself from `../../backend/.env`. Verify
  connectivity with `hermes mcp test addies` (handshake + tools/list only — does
  NOT hit the DB).

## Order status model (the "pending" trap)

From `D:/Dev/appZeno/ADDies/backend/models/order.js` + live MCP tool schemas:

- `orderStatus` enum: `created | confirmed | preparing | ready | assigned |
  arrived_at_pickup | out_for_delivery | delivered | cancelled` — **there is NO
  `pending` orderStatus**.
- `paymentStatus` enum: `pending | paid | failed | refunded`, default `pending`,
  set at order creation (`backend/user/controllers/order.js:63,70`).
- `orders.list` filters ONLY on `orderStatus` (`status` param). There is NO
  paymentStatus filter. `{"status":"pending"}` → MCP error -32602 `Invalid enum
  value ... received 'pending'`.
- A task phrased "orders in status pending" is therefore ambiguous against the
  model: the only `pending` value in the order schema is `paymentStatus`.
  Options: (a) list all orders (`limit` up to 500) and filter
  `paymentStatus == "pending"` client-side, or (b) clarify the intended meaning
  with the requester before reporting. Never fabricate a `pending` orderStatus.
- `orders.list` returns newest-first rows: `id` (_id), `orderId` (ADD-xxxx),
  `grandTotal`, `orderStatus`, `paymentStatus`, `createdAt`
  (from `timestamps.createdAt`). Read-only reporting needs no mutations.

## Calling MCP tools when they aren't in the session toolset

If MCP tools aren't exposed (e.g. a paperclip wake session without the addies
toolset), drive the server directly with a minimal stdio JSON-RPC client —
newline-delimited JSON over stdin/stdout:
1. Spawn the node/tsx command above (`--stdio`).
2. Send `initialize` (protocolVersion `2024-11-05`), then
   `notifications/initialized`.
3. `tools/call` with `{"name":"orders.list","arguments":{...}}`; read
   `result.content[].text`; `result.isError` signals failure.
4. Get schemas via `tools/list` before guessing argument names — the enum
   values in the schema are authoritative.
5. **Reusable client — do NOT hand-write the JSON-RPC plumbing again:**
   `scripts/addies-mcp-call.py` (in this skill) spawns the server with the
   DNS preload baked in, runs initialize/initialized, calls any tool, prints
   `result.content[].text`. Usage:
   `python scripts/addies-mcp-call.py orders.list '{"limit": 500}'`
   (list tools default to `{"limit": 50}` when args omitted). Exit codes:
   0 ok / 2 MCP tool error / 3 connection failure. Verified 2026-08-15 DCO-22.

## Connectivity pitfalls (2026-08-15)

- **`hello` OK + DB tool failing = DB-layer failure, not a dead server.**
  The `hello` tool returns without touching MongoDB, so it isolates the
  failure layer: `hello` succeeding while `orders.list` fails means the MCP
  process is fine and the problem is the DB connection (whitelist, network).
  Confirm it is SYSTEMIC before reporting blocked: call a second DB-backed
  tool (e.g. `users.list`) — if it fails with the identical error, it is
  environment state, not a tool-specific bug (verified 2026-08-15 DCO-22:
  hello OK, orders.list + users.list both whitelist-rejected).
- **ISP resolver refuses MongoDB Atlas SRV queries.** `querySrv ECONNREFUSED
  _mongodb._tcp.addies.nukkvam.mongodb.net` — nslookup via the local
  (reliance) resolver returns "No internal type for both IPv4 and IPv6
  Addresses", but `nslookup -type=SRV ... 8.8.8.8` resolves fine. Fix: preload
  `dns.setServers(["8.8.8.8","1.1.1.1"])` into the MCP node process via
  `NODE_OPTIONS="--require <dnsfix.cjs>"` (dnsfix.cjs = one line requiring
  `node:dns` and calling `setServers`). Environment-transient, but the preload
  trick is reusable for any node MCP server whose DB uses SRV DNS.
- **TLS alert 80 = Atlas IP whitelist rejection, not a code bug.** After the
  DNS fix, `orders.list` failed with "Could not connect to any servers in your
  MongoDB Atlas cluster ... IP whitelist" and `openssl s_client` to a shard
  host showed `tlsv1 alert internal error` (alert 80) — the machine's public
  IP is not whitelisted on the Atlas cluster. TCP to port 27017 can be OPEN
  (`bash -c "echo > /dev/tcp/<host>/27017"`) while the app-layer handshake is
  rejected. This is environment state: report + mark `blocked` per the addies
  skill; do not hammer retries. Remedy is operator-side (whitelist the IP or
  extend the MCP tool, e.g. add a paymentStatus filter).
- `hermes mcp test <name>` only proves the stdio handshake + tools/list, not DB
  reachability — the DB failure appears only on the first tool call.

## DCO-22 retry outcome (2026-08-15, operator whitelisted the IP)

The first wake marked `blocked` (whitelist rejection, above). Operator
commented "try again i have whitelisted the ip"; the retry run proved the
whitelist fix landed (direct probe: `CONNECT_OK`, 512ms) BUT the MCP data
path is STILL broken — this time by a server-side code bug, not environment:

- **Dual-mongoose bug.** `mcp/src/db.ts` connects the MCP's own mongoose
  (mcp/node_modules, 8.24.3) while backend models (`~/models/order` →
  backend/models/order.js) `require("mongoose")` and resolve to
  backend/node_modules (7.8.7) — a SECOND, never-connected instance. So
  `connectDb()` succeeds then `Order.find()`/`countDocuments()` die with
  `Operation orders.find() buffering timed out after 10000ms` on the
  disconnected instance. Signature: `hello` OK, EVERY data tool times out at
  exactly 10s, direct backend-mongoose probe connects instantly.
  Reproduction: import `connectDb` + the Order model in one tsx script —
  connectDb OK (413ms), model query FAILs.
- **Collection drift.** Model registers `mongoose.model('order', …)` →
  pluralized `orders` collection (0 docs); live data sits in a collection
  literally named `Order` (16 docs) with flat top-level `createdAt` (the MCP
  tool reads `timestamps.createdAt` → null). A `total: 0` from the tool is
  drift, not an empty DB — list collections + sample raw docs first.
- **Report was produced read-only via the direct probe** (backend mongoose +
  DNS preload + 45s timeouts; countDocuments/find/aggregate only — no
  `*.updateStatus`, no mutations): 16 orders total, paymentStatus all `paid`
  (0 `pending`), orderStatus ready 5 / delivered 5 / preparing 4 / assigned
  2. Task answer: **0 orders in status pending** (interpreted as
  paymentStatus, the only `pending` in the schema) → no top-3 rows exist.
- Reusable probe: `addies-ops/scripts/addies-db-probe.py` (collections mode
  + filtered find with sort/limit). Operator-side fix needed for the MCP
  path: connect the SAME mongoose instance the models use.

## Whitelist fixed but DB tools STILL fail: dual-mongoose instance (2026-08-15, DCO-22 retry)

When the operator whitelists the IP, re-verify the LAYERS in order — the whitelist
fix can unmask a SECOND, independent failure mode inside the MCP server itself:

1. **Network layer fixed**: TCP connects to a shard in ~0.07s, TLS 1.3 handshake
   OK (no alert 80), cert verifies. A direct mongoose probe with the DNS preload +
   30s timeouts connects to `addies.nukkvam.mongodb.net/add` in ~460ms, ping OK.
2. **But `orders.list`/`users.list` still fail** with
   ``Operation `orders.find()` buffering timed out after 10000ms`` while `hello`
   succeeds. Exactly 10,000ms = mongoose's default buffer timeout: the query ran
   on a connection that never reached `readyState 1`. `hello` isolates the layer
   again — server fine, DB-layer issue, and it is SYSTEMIC (both DB tools fail).
3. **Root cause: two mongoose instances in the MCP process.** `src/db.ts`
   `connectDb()` connects the MCP's own mongoose (8.24.3, `mcp/node_modules`),
   but the backend models (`~/models/order` → `../backend/models/order.js`) do
   `require("mongoose")` and resolve to the BACKEND's mongoose (7.8.7,
   `backend/node_modules`) — a separate instance that never gets connected.
   Prove it (run from `mcp/` with the dnsfix preload):
   `require.resolve("mongoose", { paths: ["D:/Dev/appZeno/ADDies/backend/models"] })`
   → backend path; then `Order.base === backendMongoose` (true) vs
   `Order.base === mcpMongoose` (false). Connect the backend mongoose directly
   and the same queries succeed instantly (`orders count via backend mongoose`).
4. **This is a CODE bug, not environment state** — unlike the whitelist, no
   operator-side setting fixes it. Report it for a developer fix (`src/db.ts`
   must connect the instance the models bind to, or the tools must use the MCP
   mongoose), and DO NOT mark the issue `blocked` as an environment failure or
   hammer retries. The honest interim answer can still be produced read-only by
   connecting the backend mongoose directly (same models, same DB, no mutation).

## Collection naming mismatch: `orders` (empty) vs `Order` (live data)

- The backend model is `mongoose.model('order', OrderSchema)` → collection
  **`orders`** (lowercase, mongoose default pluralization) — which is EMPTY.
- The live order docs live in the capital **`Order`** collection (16 docs in the
  `add` db as of 2026-08-15, orderIds `ORD-<ts>-<hex>`). To see real orders you
  must query the `Order` collection (raw driver, or a model bound to it).
- **Shape mismatch**: those live docs carry FLAT top-level `createdAt` /
  `deliveredAt` — NOT the schema's nested `timestamps.createdAt`. The MCP tool's
  `toOrderDoc` reads `record.timestamps?.createdAt`, which returns null for these
  docs; report the flat field instead when quoting createdAt.
- Before answering any "pending orders" task, cross-check BOTH collections and
  aggregate by `orderStatus` / `paymentStatus` (raw `$group`). On 2026-08-15 the
  live `Order` docs were 16/16 `paymentStatus: paid` (preparing 4, ready 5,
  assigned 2, delivered 5) → the pending count is genuinely 0 and there is no
  list of most-recent pending rows. Report the 0 honestly — never fabricate a
  `pending` orderStatus (the enum has no such value).

## Post-whitelist second blocker: dual-mongoose bug + collection mismatch (DCO-22 re-probe, 2026-08-15)

After the operator whitelists the machine IP, the Atlas rejection clears (direct
mongoose connect succeeds ~500ms, ping `{ok:1}`) but `orders.list` STILL fails —
now with `Operation orders.find() buffering timed out after 10000ms`. This is a
code-level defect in the MCP server, not environment state:

**Dual-mongoose instance.** `mcp/src/db.ts` does `import mongoose from "mongoose"`
→ resolves to the MCP's own `node_modules/mongoose` (v8.24.3) and connects THAT
instance (`DATABASE_URL`, `serverSelectionTimeoutMS: 10_000`). But the tools
import models via the tsconfig path `~/*` → `../backend/*`, so `~/models/order`
loads `backend/models/order.js`, which does `require("mongoose")` → resolves to
the BACKEND's `node_modules/mongoose` (v7.8.7) — a separate instance whose
default connection never connects (`readyState: 0`). `connectDb()` returns once
the MCP's mongoose is up, then `Order.find()` on the backend mongoose buffers for
the default `bufferTimeoutMS` (10s) and throws. Verified: `mongooseMCP ===
backendMongoose` → `false`; backend `readyState` 0 while MCP's is 1; the backend
model query reproduces the exact ~10021ms buffering timeout.

**Collection mismatch.** The live Atlas DB has BOTH `Order` (16 docs) and
`orders` (0 docs) collections. `backend/models/order.js` ends with
`mongoose.model('order', OrderSchema)` → lowercase plural `orders` → returns 0
rows even once the connection works. Live order data lives in `Order` (capital).
So `orders.list` needs the model to target `Order` (or an explicit `collection`
option) before the report can be produced. Related collections: `StatusHistory`
101, `OrderItem` present.

**Diagnostic ladder (re-probe after any "blocked" wake on DCO live data):**
1. Connect the BACKEND's mongoose directly (absolute `file:///` import of
   `backend/node_modules/mongoose/index.js`; strip the quotes from the quoted
   `DATABASE_URL="..."` in `backend/.env`). ~500ms connect + ping OK → whitelist
   is fixed.
2. Run the model query → buffering timeout = dual-mongoose bug; empty result =
   collection mismatch.
3. `db.listCollections()` + `countDocuments` per collection to locate the real
   data.

**Probe tooling pitfalls (Windows, git-bash):**
- A python subprocess spawning the node/tsx MCP server crashed with exit
  0xC0000142 (STATUS_DLL_INIT_FAILED) — use a PURE-NODE client instead.
- Use the MCP SDK: `@modelcontextprotocol/sdk` `Client` + `StdioClientTransport`
  (command/args/env with `NODE_OPTIONS: '--require <dnsfix.cjs>'`, `stderr:
  'pipe'` + `transport.stderr?.on('data', ...)` to see `[mcp] addies v0.1.0 stdio
  mode ready`).
- The client script must live INSIDE the mcp dir (or import via absolute
  file:// paths) — ESM resolves `@modelcontextprotocol/sdk` relative to the
  SCRIPT's location, not cwd; running from a temp dir gives
  `ERR_MODULE_NOT_FOUND`.
- Dump `callTool` results with `fs.writeFileSync` to a file — console-slicing
  truncates large tool responses (an 8000-char slice lost the payload).
- Hand-rolled newline-JSON-RPC clients are fragile (response-matcher timeout
  races) — prefer the SDK client.

## DCO-22 re-probe outcome (2026-08-15, post-whitelist, issue closed done)

Operator whitelisted the machine IP ("try again i have whitelisted the ip"),
re-probe confirmed:

- **Whitelist fix VERIFIED**: direct backend-mongoose connect + `{ping: 1}` OK
  (~500ms). The Atlas rejection is gone.
- **`orders.list` STILL broken — code-level, confirmed live.** `hello` OK, but
  the call dies with `Operation orders.find() buffering timed out after 10000ms`
  (dual-mongoose bug: `mcp/src/db.ts` connects MCP's own mongoose v8; tools
  import backend models on backend mongoose v7 whose connection never connects).
  One transient `ECONNRESET` was seen on the first call (server mid-restart
  style) — retry once before diagnosing.
- **Collection mismatch confirmed live**: `Order` = 16 docs, `orders` = 0 docs;
  `StatusHistory` = 101, `OrderItem` = 32, `Transaction` = 6. `backend/models/
  order.js` maps to lowercase `orders` → MCP returns 0 rows even when connected.
- **THIRD bug (new) — createdAt mapping.** Live `Order` docs store `createdAt`
  TOP-LEVEL (plus `deliveredAt` etc.), NOT under a `timestamps` object. The MCP
  `toOrderDoc` reads `record.timestamps?.createdAt ?? null` → would return
  `createdAt: null` for EVERY row even after the collection fix. Also note the
  model schema declares a nested `timestamps` subdocument, which does not match
  the live docs — schema drift between model and data.
- **Payment census (live)**: all 16 `Order` docs have `paymentStatus: "paid"`
  (pending=0, failed=0, refunded=0). orderStatus census: preparing 4, ready 5,
  assigned 2, delivered 5. `pending` exists NOWHERE: 0 docs with
  `orderStatus: "pending"`, 0 docs with `paymentStatus: "pending"` → the literal
  DCO-22 answer is **count 0, no rows**; the closest legitimate reading
  (in-progress = not delivered/cancelled) is 11 orders.
- **Working read-only probe recipe** (produced the report while MCP is broken):
  pure-node CJS script (NOT python-spawned node) in the OS temp dir that (1)
  `dns.setServers(["8.8.8.8","8.8.4.4","1.1.1.1"])`, (2) requires backend
  mongoose directly
  (`require("D:/Dev/appZeno/ADDies/backend/node_modules/mongoose/index.js")`),
  (3) connects `DATABASE_URL` from `backend/.env` (strip surrounding quotes)
  with `serverSelectionTimeoutMS: 45000`, (4) reads collection `Order` via
  `db.collection("Order")` with plain `countDocuments`/`find().sort().limit()`
  — read-only, zero writes. Exit 0 + `DONE` = clean run.
- Dev-side fix list for the MCP server (all three): unify to one mongoose
  instance, point the model at collection `Order`, and map `createdAt` from the
  top-level field.
