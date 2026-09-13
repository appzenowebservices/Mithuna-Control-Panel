---
name: addies
description: >
  Use the addies MCP server to operate the live ADDies business (ApniDesi Dukaan
  + ApniRide) - orders, trips, vendors, stores, delivery partners, customer
  users, and onboarding leads. Use for operational work (running the business),
  NOT for development work (changing code, which happens in the project
  workspace).
metadata:
  hermes:
    house: 10
    domains: ["apni desi dukaan", "store operations", "order management"]
    contract:
      max_retries: 1
      checks:
        forbidden_phrases:
          - "I cannot"
          - "I'm unable to"
          - "I can't do this"
          - "someone will have to do this"
        required_section:
          when:
            workMode: [standard]
          section: "Result"
        disposition_marker:
          when:
            workMode: [standard]
          phrases:
            - "done"
            - "in_review"
            - "blocked"
            - "cancelled"
            - "in_progress"
            - "complete"
            - "shipped"
---

# ADDies Skill

You operate the live ADDies system (ApniDesi Dukaan + ApniRide) through its
MCP server. The MCP server is the ONLY way to touch live production state -
never mutate the MongoDB database, orders, trips, or accounts directly.

## When to Use

- Order operations: list, inspect, and update the status of marketplace orders.
- Trip operations (ApniRide): list, inspect, and advance delivery trips.
- Vendor & store operations: look up vendors and their stores.
- Delivery partner operations: look up and approve/suspend partners.
- Customer operations: look up customer users by mobile or email.
- Lead pipeline: list, inspect, and advance onboarding leads (vendor,
  delivery_agent, partner, client, customer).

## Prerequisites

- MCP server `addies` registered in Hermes (`~/.hermes/config.yaml` under
  `mcp_servers:`) and enabled (`hermes mcp configure addies`).
- If a tool call fails with 401/403, report the configuration problem in the
  issue thread and mark the issue `blocked` - do not retry blindly.

## Tools

The MCP server exposes these tools (call `tools/list` if the list changed):

| Tool | Purpose |
|---|---|
| `hello` | Ping the server and verify connectivity. |
| `orders.list` | List orders (status filter + pagination). |
| `orders.get` | Fetch one order by orderId or _id. |
| `orders.updateStatus` | Advance an order to a new orderStatus (stamps statusHistory + timestamps). |
| `trips.list` | List trips (status filter + pagination). |
| `trips.get` | Fetch one trip by tripId or _id. |
| `trips.updateStatus` | Advance a trip (stamps lifecycle timestamps, cancel reason). |
| `vendors.list` | List vendors (search + pagination). |
| `vendors.get` | Fetch one vendor by _id. |
| `stores.list` | List stores (vendor filter + search + pagination). |
| `stores.get` | Fetch one store by _id. |
| `partners.list` | List delivery partners (search + pagination). |
| `partners.get` | Fetch one delivery partner by _id. |
| `partners.updateStatus` | Approve/suspend/reactivate a partner (isActive/isVerified). |
| `users.list` | List customer users (search + pagination). |
| `users.lookup` | Find a user by exact mobile or email. |
| `leads.list` | List leads (type + status filters + pagination). |
| `leads.get` | Fetch one lead by _id. |
| `leads.updateStatus` | Move a lead through the pipeline. |

## Procedure

1. **Read the issue** - extract the entity (order id, trip id, vendor/store id,
   partner id, mobile/email, lead id) and the requested action from the issue
   description and comments.
2. **Fetch current state** - call the appropriate get/list tool to load the
   live record before making any decision.
3. **Act** - call the mutation tool with the exact arguments.
4. **Verify** - re-read the record to confirm the change took effect.
5. **Report** - post the outcome in the issue thread under a "Result" section,
   including any IDs and changed fields.

## Presentation Rules

- Lead with the Result section: what changed, what it now looks like.
- Include the entity ID (orderId, tripId, _id, mobile) in every report.
- If a step failed, say exactly which tool and argument failed and why.

## Verification

- The issue is only `done` after the mutation is confirmed by a re-read.
- Never claim a result you did not observe via a tool response.
