# ADDies Domain Operations (DCO — ApniDesi Dukaan + ApniRide)

DCO wakes that touch orders/trips/vendors/stores/partners/users/leads operate the
live ADDies system. **Live production data is NOT on the paperclip server** — the
paperclip API has no orders route at all (`/api/openapi.json`, 344 paths, zero
"order" paths). It lives in the ADDies stack under `D:/Dev/appZeno/ADDies/`.

## Access surface

- The `addies` MCP server (`D:/Dev/appZeno/ADDies/mcp`) is the ONLY sanctioned way
  to read/mutate live state — paperclip company skill `addies` (synced to the DCO
  CEO agent) says "never mutate the MongoDB database... directly".
- Registered in Hermes `config.yaml` under `mcp_servers.addies` (stdio spawn via
  tsx). HTTP mode config in `mcp/.env`: `HOST=127.0.0.1`, `PORT=8768`,
  `SERVER_NAME=addies`, `MCP_AUTH_TOKEN` (bearer).
- Tools: `hello`; `orders.list/get/updateStatus`; `trips.list/get/updateStatus`;
  `vendors.list/get`; `stores.list/get`; `partners.list/get/updateStatus`;
  `users.list/lookup`; `leads.list/get/updateStatus`.
- `orders.list({status, limit, offset})` → `{total, count, status, orders[]}`,
  sorted `createdAt` DESC (newest first). `status` is an enum — see model below.
- If a tool call fails 401/403: report the config problem in the issue thread and
  mark `blocked`; do NOT retry blindly (addies skill rule).

## Order data model (backend/models/order.js + mcp/src/tools/orders.ts)

- `orderStatus` enum: `created, confirmed, preparing, ready, assigned,
  arrived_at_pickup, out_for_delivery, delivered, cancelled` — **NO `pending`**.
- `paymentStatus` enum: `pending, paid, failed, refunded` (default `pending`) —
  the ONLY literal `pending` on an order.
- Order doc fields (`toOrderDoc` in orders.ts): id (_id), orderId, customerId,
  vendorId, items, totalQuantity, subtotalAmount, grandTotal, deliveryMode,
  orderStatus, deliveryStatus.{status,assignedTo}, paymentMethod, paymentStatus,
  isScheduled, isCancelled, cancellationReason, source, createdAt
  (= timestamps.createdAt).
- **A task saying "orders in status pending" is AMBIGUOUS**: `orderStatus` has no
  `pending` value, `paymentStatus` does. Before filtering, check the live enum
  distribution (probe script) and disambiguate — `orders.list`'s status filter is
  orderStatus only and its zod enum rejects anything outside the list.
- `orders.updateStatus` stamps `timestamps.{confirmedAt,deliveredAt,cancelledAt}`
  and appends a `statusHistory` entry with `updatedByRole` (System/User/Vendor/
  DeliveryAgent). Mutations via MCP only, never direct DB writes.

## DB connectivity debugging ladder (observed 2026-08-15)

- `DATABASE_URL` lives in `backend/.env` — the value is **quoted**
  (`DATABASE_URL="mongodb+srv://..."`); strip the quotes when parsing.
- Cluster: `addies.nukkvam.mongodb.net` (Atlas SRV). Local ISP DNS fails to
  resolve Atlas SRV/A records (`nslookup <host>` → "No A+AAAA records") while
  `nslookup <host> 8.8.8.8` resolves fine. **Fix: `dns.setServers(["8.8.8.8",
  "1.1.1.1"])` at the top of node probe scripts** — the mongodb driver's SRV
  resolution honors it (connect got past DNS to TLS after pinning).
- General internet worked (google 200) while TLS to the Atlas shard hosts failed
  (`tlsv1 alert internal error`, curl 000 on :443) — mongodb.net specifically
  blocked from this machine at the time. When the DB is unreachable: do NOT
  fabricate order reports; record the blocker in the issue and leave it
  open/blocked — same honesty rule as milestone gates.
- Read-only probe: `scripts/probe-addies-orders.mjs` (parses backend/.env,
  pins public DNS, resolves mongoose via createRequire anchored to
  `ADDies/mcp/package.json` — temp-dir scripts CANNOT resolve dotenv/mongoose
  from their own location; `createRequire("D:/.../mcp/package.json")` fixes it).

## DCO board facts (observed 2026-08-15)

- DCO company `9b4623fa-47b9-4f24-9f57-c6fc402fbde8`; ONLY ONE agent: CEO
  `978c9717-849f-4fac-ac92-df333447b852` (hermes_http, status `running`).
- Board had just 2 issues: DCO-21 Strategic Review (standing cadence, `blocked`)
  and DCO-22. No local company workspaces (`/workspaces` = `[]`).
- CEO agent skills include `paperclipai/paperclip/addies` — the DCO operational
  skill lives in the paperclip company library at
  `D:/Dev/agent/paperclip/skills/addies/SKILL.md` (NOT indexed by Hermes
  skill_view — read from disk when needed).
