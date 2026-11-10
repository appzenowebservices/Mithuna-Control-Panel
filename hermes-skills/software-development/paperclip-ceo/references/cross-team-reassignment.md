# Cross-Team Reassignment — 422 Chain & Verified Recipe

Observed 2026-08-11 on AppZeno (XXX-63 "write the first blog"), local_trusted Paperclip
server at http://127.0.0.1:3100. All endpoints under `/api`, no auth header.

## The problem

An issue assigned to a paused agent (CTO) needed to move to a newly-hired agent (CMO) in
a different team. Every naive PATCH failed:

```
PATCH /api/issues/{id}  {"assigneeAgentId": "<cmo>"}
→ 422 {"error":"Assignee must belong to the project's team"}

PATCH /api/issues/{id}  {"projectId": "<new-project>"}
→ 422 {"error":"Project workspace must belong to the selected project"}
```

Root cause: the issue carried `projectWorkspaceId` from its old project, and the old
project's team (CTO's) did not contain the CMO. The server validates assignee-vs-project
team AND workspace-vs-project on every PATCH that touches either field — so you cannot
"jump" an issue across teams in one call.

## Verified working sequence (each step its own PATCH)

1. **Drop the old assignee first** — PATCH `{"assigneeAgentId": null}`.
   (If the old assignee isn't in the target project's team either, this also clears the
   conflicting member.)
2. **Target project must belong to the target team.**
   - `teamId` is NOT accepted at project creation. `POST /api/companies/{CID}/projects`
     with `{"teamId": ...}` returns the project with `teamId: null` (silently ignored)
     or 400 if you pass a bogus status.
   - Create with a valid enum status, then PATCH the project:
     ```bash
     curl -s -X POST http://127.0.0.1:3100/api/companies/{CID}/projects \
       -H 'Content-Type: application/json' \
       -d '{"name":"Marketing Content","description":"...","status":"planned"}'
     curl -s -X PATCH http://127.0.0.1:3100/api/projects/{newProjectId} \
       -H 'Content-Type: application/json' -d '{"teamId":"<target-team-id>"}'
     ```
   - Project `status` enum: `backlog | planned | in_progress | completed | cancelled`.
     `active` is NOT valid → 400 `invalid_enum_value`.
3. **Move the issue AND clear its stale workspace in ONE call:**
   ```bash
   curl -s -X PATCH http://127.0.0.1:3100/api/issues/{id} \
     -H 'Content-Type: application/json' \
     -d '{"projectId":"<new-project>","projectWorkspaceId":null}'
   ```
   `projectWorkspaceId: null` is required — moving with the old workspace id set still
   422s ("Project workspace must belong to the selected project").
4. **Assign the new agent:**
   ```bash
   curl -s -X PATCH http://127.0.0.1:3100/api/issues/{id} \
     -H 'Content-Type: application/json' -d '{"assigneeAgentId":"<new-agent>"}'
   ```

## Also learned

- Watchdog closure across teams has the same constraint: `Review productivity for XXX-N`
  issues inherit their parent's project/team. To close one assigned to an agent outside
  that team, PATCH `{"assigneeAgentId": null}` first, then `{"status":"done"}`.
- A PATCH response echoing your payload is NOT proof the field stuck — the server may
  accept the request but reject the field silently (e.g. `teamId` at project POST, or a
  concurrent run reverting it). Always re-GET the resource to verify.
- Team endpoints are company-prefixed: `GET /api/companies/{CID}/teams` works;
  `GET/DELETE /api/teams/{id}` are NOT routed (404). Team POST creates immediately and
  cannot be deleted via API — don't probe with junk names.
