---
name: paperclip-bootstrap
description: Paperclip run checklist.
version: 1.0.0
author: Hermes Agent
license: MIT
platforms: [windows, macos, linux]
metadata:
  hermes:
    house: 4
    domains: ["bootstrap paperclip", "initial setup", "first run setup"]
    tags: [paperclip, bootstrap]
    category: autonomous-ai-agents
    related_skills: [board-ops]
---

# Paperclip Bootstrap

Checklist — run at the start of every Paperclip run. No reasoning, just capture and go.

## When to Use

- Every heartbeat run before task logic.

## Prerequisites

- `PAPERCLIP_API_URL`, `PAPERCLIP_COMPANY_ID`, `PAPERCLIP_AGENT_ID`, `PAPERCLIP_WORKSPACE_CWD` set.

## Procedure

1. Capture IDs and workspace:
```bash
echo "$PAPERCLIP_COMPANY_ID $PAPERCLIP_AGENT_ID $PAPERCLIP_WORKSPACE_CWD"
```

2. Fetch last issue (one call):
```bash
curl -s "$PAPERCLIP_API_URL/api/companies/$PAPERCLIP_COMPANY_ID/issues?limit=1" | python -c "import sys,json;d=json.load(sys.stdin)[0];print(d['identifier'], d['status'])"
```

3. Store `agentId`, `companyId`, `lastIssueId`, `workspaceCwd`. Done. Branch to task skill.

## Pitfalls

- Batch, don't loop. One batch, then task.
- Do not read `AGENTS.md` — already in prompt.
- If `skill_view` says `not found`, report it, don't `search_files` — but run ONE targeted
  diagnostic before reporting so the `missing_skillset` report is accurate:
  `echo $HERMES_HOME; ls $HERMES_HOME/skills; ls ~/.hermes/skills; grep -A6 mcp_servers $HERMES_HOME/config.yaml;`
  plus `curl -s $PAPERCLIP_API_URL/api/agents/$PAPERCLIP_AGENT_ID` → `adapterConfig.toolsets`.
  Runtime `skills_list`/`skill_view` can be EMPTY while skills exist on disk (registry points
  elsewhere), and MCP servers can be registered in config.yaml yet expose NO tools when `mcp`
  is missing from the agent's toolsets. Each case changes the report.
- `missing_skillset` disposition: POST agent-type comment to `/api/issues/{id}/comments`
  (company-scoped path 404s) with the evidence, then bare `PATCH {"status":"blocked"}` —
  NO comment inside the PATCH (SDS-37: any user-type comment reopens issues).
- Route truth: the server source lives at `D:\Dev\agent-bellwether\paperclip\server\src\routes`;
  `/openapi.json` and `/swagger` return SPA HTML, not docs. See
  `references/paperclip-api-routes.md`.

## Verification

- Checklist has 4 values. Next call is task-specific.
