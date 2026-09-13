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
- If `skill_view` says `not found`, report it, don't `search_files`.

## Verification

- Checklist has 4 values. Next call is task-specific.
