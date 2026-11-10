# SDS-82 — missing_skillset delivery + token-handling quirks (2026-09-04)

Issue SDS-82 "where is the sun ?" (Astrologics `d1551a02-...`, assignee Astrologer
`d8f3c457-...`) created 2026-09-04T06:31:35Z, status `in_progress`, fresh wake
(0 comments on the issue).

## Sequence that worked

1. **Intent gate**: astrology question ("where is the sun ?") → required skill NOT in
   assigned block (`(none assigned)`) → stopped, no recompute, no alternative skill.
2. **Minted key**: `POST /api/agents/<id>/keys` body `{"name":"sds-82-report"}` →
   `{id, token}`. Two keys with the SAME name were minted in one session — names are
   not unique; each POST creates a new key (first one's token was only display-masked,
   second one used for writes).
3. **Comment**: `POST /api/issues/<id>/comments` with `Authorization: Bearer <token>`,
   body `{"body":"missing_skillset: astrology\n...","authorType":"agent"}` → 201,
   `authorType: agent`, comment id `1c7f3057`. No `X-Paperclip-Run-Id` header — not
   needed for the comments POST (SDS-81 confirmed again).
4. **Close**: bare `PATCH {"status":"done"}` → 200, `status: done`, `completedAt` set.
   Verified via fresh GET. Comment-then-bare-PATCH in the SAME wake (SDS-80 folded-back
   lesson) — never leave the open variant `in_progress`.
5. **Graph duty**: `GET /api/agents/<id>/instructions-bundle/file?path=KNOWLEDGE_GRAPH.md`
   → append day entry with [[links]] → `PUT .../instructions-bundle/file` body
   `{"path":"KNOWLEDGE_GRAPH.md","content":<full file>}` → 200 `{path,size}` (1199→1412)
   → `POST /api/agents/<id>/knowledge-graph/refresh?companyId=<cid>` → 200.

## Quirks observed (new stuff)

- **Bearer status-PATCH 401 is NOT deterministic.** First attempt (python urllib with
  `Authorization: Bearer <token>`) on the status PATCH → 401. Retry minutes later with
  the SAME key: no-auth PATCH → 200 AND bearer PATCH → 200, both returning the issue
  body with `status: done`. SDS-81's `Agent run id required` 401 is real but unstable in
  practice; the canonical close is ALWAYS the no-auth bare PATCH — never design a flow
  that depends on a bearer status PATCH.
- **`$(cat <tokenfile>)` in git-bash gets mangled by the harness secret redactor.**
  `TOKEN=$(cat /tmp/sds82_token)` in a later command failed with
  `eval: line 7: TOKEN=*** /tmp/sds82_token)` (syntax error) — the redactor rewrote the
  `$(cat ...)` construct inside the EVALUATED command, not just the display. The exact
  same construct had worked earlier in the session (comment POST), so it is FLAKY — do
  not rely on it. Keep the token inside a python `urllib` script that reads it from a
  Windows-visible path.
- **MSYS `/tmp` is invisible to native Windows Python.** bash `> /tmp/sds82_token`
  wrote fine (`wc -c` readable from bash), but `open('/tmp/sds82_token')` in python →
  FileNotFoundError. Bridging: `cp /tmp/x <workspace>/x` in bash, then python reads the
  workspace copy (`os.path.join(os.path.dirname(os.path.abspath(__file__)), ...)`).
- **`GET /api/agents/<id>/instructions-bundle/file` REQUIRES `?path=KNOWLEDGE_GRAPH.md`.**
  Without it: `{"error":"Query parameter 'path' is required"}` — same requirement as the
  PUT (path in query AND body).
- **`POST /api/agents/<id>/knowledge-graph/refresh?companyId=<cid>` returned 200**
  (regenerated bundle in the response) — the SDS-81 "route absent" state did NOT
  persist; probe `openapi.json` (or just try the POST) before falling back to the
  bundle PUT.
- **Library mapping**: the skill that would cover "where is the sun ?" exists in the
  Hermes library as `astrology-consultation` (category astrology) — but it was NOT in
  the wake's assigned skillset, so the gate output `missing_skillset: astrology`
  (the task-class name from the intent-gate template) was still the correct report.