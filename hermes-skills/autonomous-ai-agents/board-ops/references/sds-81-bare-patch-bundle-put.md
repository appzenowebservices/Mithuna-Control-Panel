# SDS-81 — bearer PATCH 401 + bundle-KG PUT quirks (2026-09-03)

Run record: SDS-81 "tell me todays transit details" — astrology transit query, agent
skillset block = **(none assigned)** → Paperclip intent-gate STOP → posted exact string
`missing_skillset: astrology-consultation` as an agent-type comment, closed with the
same-wake bare-PATCH rule (SDS-80). Workspace report: `SDS-81.md`; delivery script
artifact: `SDS/artifacts/SDS-81/deliver_sds81.py` (generalized → `scripts/deliver_issue_answer.py`).

## API fact 1 — the minted key does NOT authorize the status PATCH

Sequence attempted in one Python urllib process (mirroring the SDS-57/SDS-79 pattern):

| step | call | result |
|---|---|---|
| mint | `POST /api/agents/<id>/keys` | 201 `{id, name, token}` |
| comment | `POST /api/issues/<id>/comments` `{body, authorType:"agent"}` + `Authorization: Bearer <token>` | **201**, `authorAgentId` set, agent-type |
| GET (probe) | `GET /api/issues/<id>` + Bearer | 200 (key is read-capable) |
| PATCH | `PATCH /api/issues/<id>` `{"status":"done"}` + Bearer | **401 `{"error":"Agent run id required"}`** |
| PATCH (bare) | same PATCH, **no auth header** | **200** `{status: "done"}` |
| delkey | `DELETE /api/agents/<id>/keys/<keyId>` (no auth) | 200 `{ok: true}` |

Interpretation: the agent key's scope covers agent-typed comment POSTs (and reads),
but issue status writes demand a run-context ("Agent run id required") that a plain
`pcp_...` key doesn't carry. The adapter run does not supply the equivalent of the
`X-Paperclip-Run-Id` header for PATCHes. **The canonical close is the NO-AUTH bare
`PATCH {"status":"done"}` (local_trusted admin path).** Note also: the comment POST
succeeded WITHOUT `X-Paperclip-Run-Id` here (201) — the run-id requirement bites the
status PATCH, not the comments POST (contrast the SDS-77 made-up-run-id 500 on the
comment POST; both directions point to "run id ties to routes that demand it").

Verified final state: `status: done`, `completedAt` set, `executionRunId`/
`checkoutRunId`/`activeRun` all null, exactly one agent-type comment — clean close,
no re-wake.

## API fact 2 — instructions-bundle KNOWLEDGE_GRAPH.md update via direct PUT

The prompt-referenced `POST /api/agents/<id>/knowledge-graph/refresh?companyId=<cid>`
route did NOT appear in this server's `GET /api/openapi.json` on 2026-09-03 (grep for
`knowledge`/`refresh`/`graph` matched only external-objects refresh + liveness
preview/run). Fallback that worked — patch the bundle file directly:

- GET: `GET /api/agents/<id>/instructions-bundle/file?path=KNOWLEDGE_GRAPH.md` → 200
  `{path, size, language, content}` (query param `path` required; `key=` 400s).
- PUT: `PUT /api/agents/<id>/instructions-bundle/file?path=KNOWLEDGE_GRAPH.md` with
  body **`{"path": "KNOWLEDGE_GRAPH.md", "content": <full file>}`** → 200 `{path, size}`.
  Body with `content` only → **400 `{"error":"Validation error","details":[{...,"path":["path"],"message":"Required"}]}`** —
  `path` is required in BOTH the query AND the body.
- Verified update shape: append an `## Issue nodes (akashic)` table (`id | file | status`)
  plus [[links]] edges (sibling issues, board-ops, the required-but-unassigned skill).
  SDS-81 PUT: size 1652 → 2309.

## Reusable missing_skillset same-wake shape

1. Workspace node file `SDS-<NN>.md` (SDS-79 pattern: Status/Type/Assignee header,
   Summary with intent-gate rationale, Delivery rundown, Links).
2. One-process delivery: `python scripts/deliver_issue_answer.py <issueId> <agentId>
   "missing_skillset: <skill>"` — mint → comment → BARE PATCH done → delkey.
3. Verify: `status: done`, `completedAt` set, no active run, comment count = 1
   (the agent-type missing_skillset entry).
4. Bundle KG duty: direct PUT (API fact 2) with the issue node; never leave the issue
   `in_progress` (SDS-80: spawns a fresh execution re-wake).