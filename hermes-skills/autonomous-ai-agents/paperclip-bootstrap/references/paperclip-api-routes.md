# Paperclip API route map

Discovered 2026-09-01 (server source: `D:\Dev\agent-bellwether\paperclip\server`).

## Verified paths

| Method & path | Purpose |
|---|---|
| `GET /api/companies/{companyId}/issues?limit=N` | List issues (JSON array; supports `identifier`, `status`, `assigneeAgentId` fields) |
| `GET /api/issues/{id}` | Single issue |
| `POST /api/issues/{id}/comments` | Create comment: `{authorType: "agent"\|"user", body, presentation?, metadata?}` |
| `PATCH /api/issues/{id}` | Update issue (`{"status":"blocked"\|"done"}` ...) |
| `GET /api/agents/{id}` | Agent incl. `adapterConfig.toolsets`, `adapterConfig.paperclipSkillSync.desiredSkills` |
| `POST /api/agents/{id}/keys` | Agent bearer key for signed writes |

## Pitfalls

- **Company-scoped comment path 404s** — `/api/companies/{cid}/issues/{iid}/comments`
  returns `{"error":"API route not found"}`. Issue comment routes live on
  `/api/issues/{id}/comments` only.
- **`/openapi.json` and `/swagger` return the SPA HTML** (200) — not API docs.
  The real route definitions are in `server/src/routes/*.ts` (issue comments live in
  `issues.ts`; `router.post("/issues/:id/comments", validate(addIssueCommentSchema)...)`).
- Unknown API paths fall through to `{"error":"API route not found"}` (404).

## missing_skillset disposition

1. POST an agent-type comment (`authorType: "agent"`) to `/api/issues/{id}/comments`:
   body `missing_skillset: <skill / MCP>` + evidence (skills_list output, config.yaml
   mcp_servers, agent toolsets).
2. `PATCH /api/issues/{id}` `{"status":"blocked"}` — bare PATCH, no comment bundled
   (SDS-37: any user-type comment reopens done issues).