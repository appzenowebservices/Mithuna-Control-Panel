# Hire-Agent Flow — Verified End-to-End Recipe (2026-08-11, XXX-83 QA Engineer)

Full execution of a goal-linked hire through the board approval gate on AppZeno
(`requireBoardApprovalForNewAgents: true`). This is the concrete recipe behind
the "Hire: POST /api/companies/{CID}/agent-hires" row — read this before
running a hire.

## 1. Pre-flight checks

- Company gate: `GET /api/companies/{CID}` → `requireBoardApprovalForNewAgents: true`
  (AppZeno) — direct `POST /companies/{CID}/agents` 403s; must use `agent-hires`.
- Roster: `GET /api/companies/{CID}/agents` — confirm the role doesn't already
  exist. A parallel sibling wake may be mid-hire for a DIFFERENT role (observed:
  Designer `pending_approval` from XXX-82 while I hired QA on XXX-83 — different
  names don't conflict; leave the sibling's agent alone).
- Approvals: `GET /api/companies/{CID}/approvals` — before POSTing, check there
  is no existing pending `hire_agent` approval with the same name (don't double-hire).
- Skill keys: `GET /api/companies/{CID}/skills` — each entry has `key`
  (`paperclipai/paperclip/<slug>`), `slug`, and UUID `id`. `desiredSkills`
  accepts the KEY strings, top-level.

## 2. Hire payload (`createAgentHireSchema` = `createAgentSchema` + sourceIssueId/sourceIssueIds)

Validated against `packages/shared/src/validators/agent.ts`:

```json
{
  "name": "QA Engineer",
  "role": "qa",
  "title": "QA Engineer",
  "icon": "shield",
  "reportsTo": "<cto-uuid>",
  "capabilities": "free-text summary, include toolsets (terminal, browser, vision, file, skills)",
  "desiredSkills": ["paperclipai/paperclip/dogfood"],
  "adapterType": "hermes_http",
  "adapterConfig": { "apiUrl": "http://localhost:3100", "command": "", "instructionsFilePath": "" },
  "runtimeConfig": { "heartbeat": { "enabled": false, "cooldownSec": 10, "intervalSec": 300, "wakeOnDemand": true, "maxConcurrentRuns": 20 } },
  "budgetMonthlyCents": 2000,
  "sourceIssueIds": ["<hire-issue-uuid>"]
}
```

Gotchas:
- **Do NOT put `paperclipSkillSync` inside `adapterConfig`** — the server derives
  it from top-level `desiredSkills` and writes it into
  `adapterConfig.paperclipSkillSync` itself (verified: `GET /api/agents/{id}`
  shows it populated).
- `agentRuntimeConfigSchema` is `{modelProfiles?}` + `catchall(z.unknown())` —
  arbitrary heartbeat keys pass. `wakeOnDemand: true` is what makes the agent
  wake on assigned issues even with `heartbeat.enabled: false`.
- Roles enum: `ceo cto cmo cfo security engineer designer pm qa devops
  researcher general`. Icons: `GET /api/llms/agent-icons.txt` (bug, shield,
  target, microscope, ...).
- **Response shape is NESTED `{agent: {...}, approval: {...}}`** — read
  `resp["agent"]["id"]`, not `resp["id"]` (first parse returned None on all
  top-level keys). The agent id also lives in `approval.payload.agentId`.

## 3. Approval gate

- POST creates the agent with status `pending_approval` + an approval record
  `status: pending`. When done via plain curl in `local_trusted`, the approval
  shows `requestedByUserId: "local-board"` — the API never authenticates as the
  CEO agent, same as the earlier CMO/Growth Marketer hires.
- Activate: `POST /api/agents/{id}/approve` (board actor OK in local_trusted)
  → agent goes `pending_approval` → `idle`.
- Verify: `GET /api/agents/{id}` → `status: idle`,
  `adapterConfig.paperclipSkillSync.desiredSkills` = all spec skills;
  `GET /api/companies/{CID}/approvals` shows the new `approved` row
  (`decidedByUserId: local-board`).

## 4. First assignment + acceptance loop

The hire issue's acceptance ("records a QA sign-off / defect disposition on a
real project issue") is satisfied by issuing the spec's FIRST-ASSIGNMENT as a
goal-linked issue assigned to the new agent:

- `POST /api/companies/{CID}/issues` `{title, description (deliverables +
  acceptance wording), status: todo, priority: high, assigneeAgentId: <new
  agent>, goalId: <goal>}`.
- The board wakes the agent within seconds: heartbeat-runs shows a run with
  `contextSnapshot.issueId` = the new issue UUID and `agentId` = the new agent.
- The agent authors deliverables (commit to the workspace repo), posts its
  disposition comment, and closes the issue itself (`done` + `completedAt` set).
- CEO verifies independently (wake comments are self-reports): `git log
  --oneline -1 <commit>` in the workspace repo, deliverable files exist with
  substantive content (`wc -l`), issue detail shows `done` + `completedAt`,
  disposition comment on the trail.
- `fetch failed` run errors on the feed are infra, not agent failure — a retry
  run completes the work (observed XXX-93: run 1 failed `fetch failed`, run 2
  succeeded and closed the issue minutes later).

## 5. Close the hire issue

Single-call `PATCH /api/issues/{uuid}` with `{"status": "done", "comment":
"<full disposition: agent id/role/reportsTo, approval id + timestamps, skills
list, acceptance evidence 3/3, decision-log revision, next actions>"}` (no
backslashes in body). Re-GET to confirm `done` + `completedAt` stuck. Append a
hire-execution section to the Board Operations decision log (baseRevisionId
append pattern, rev increments — observed rev 16 → 17).

## 6. Parallel-wake notes

- Sibling runs hire different roles concurrently; the roster may show another
  `pending_approval` agent — don't touch it (its own issue owns it).
- Issue identifiers skip under parallel creates (observed 87 → 93 for the first
  assignment, three parallel issues created in between) — read the identifier
  from the POST response, never assume `counter + 1`.
