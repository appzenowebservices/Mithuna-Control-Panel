---
name: appzeno
description: >
  Use the appzeno MCP server to operate the live AppZeno website business -
  newsletter subscriptions, incoming leads (book-a-call, contact, hire-developer,
  career), the services catalog, and keyed site content. Use for operational work
  (running the business), NOT for development work (changing code, which happens
  in the project workspace).
metadata:
  hermes:
    house: 10
    domains: ["appzeno operations", "appzeno board"]
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

# AppZeno Skill

You operate the live AppZeno website system through its MCP server. The MCP
server is the ONLY way to touch live production state - never mutate the
MongoDB database, site content, or services directly.

## When to Use

- Newsletter operations: check subscribers, subscribe/unsubscribe emails.
- Lead pipeline: list and inspect incoming form submissions (book-a-call,
  contact, hire-developer, career).
- Services catalog: read or update the live services shown on the website.
- Site content: read or update keyed content blobs.

## Prerequisites

- MCP server `appzeno` registered in Hermes (`~/.hermes/config.yaml` under
  `mcp_servers:`) and enabled (`hermes mcp configure appzeno`).
- If a tool call fails with 401/403, report the configuration problem in the
  issue thread and mark the issue `blocked` - do not retry blindly.

## Tools

The MCP server exposes these tools (call `tools/list` if the list changed):

| Tool | Purpose |
|---|---|
| `hello` | Ping the server and verify connectivity. |
| `newsletter.list` | List subscriptions with optional email search + pagination. |
| `newsletter.lookup` | Find a subscription by exact email. |
| `newsletter.subscribe` | Add an email to the newsletter. |
| `newsletter.unsubscribe` | Remove an email from the newsletter (idempotent). |
| `leads.list` | List lead form submissions (type filter + pagination). |
| `leads.get` | Fetch one lead submission by id. |
| `services.list` | List all live services sorted by key. |
| `services.get` | Fetch one service by key. |
| `services.update` | Update a live service listing (only provided fields). |
| `content.get` | Fetch a keyed site-content blob. |
| `content.update` | Create or replace a keyed site-content blob. |

## Procedure

1. **Read the issue** - extract the entity (email, lead id, service key,
   content key) and the requested action from the issue description and
   comments.
2. **Fetch current state** - call the appropriate get/list tool to load the
   live record before making any decision.
3. **Act** - call the mutation tool with the exact arguments.
4. **Verify** - re-read the record to confirm the change took effect.
5. **Report** - post the outcome in the issue thread under a "Result" section,
   including any IDs and changed fields.

## Presentation Rules

- Lead with the Result section: what changed, what it now looks like.
- Include the entity ID (email, lead id, service key, content key) in every
  report.
- If a step failed, say exactly which tool and argument failed and why.

## Verification

- The issue is only `done` after the mutation is confirmed by a re-read.
- Never claim a result you did not observe via a tool response.
