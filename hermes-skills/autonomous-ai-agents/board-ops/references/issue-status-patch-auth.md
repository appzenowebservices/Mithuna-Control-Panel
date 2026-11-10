# Issue status PATCH — auth recipe (verified SDS-90, 2026-09-07)

Closing an issue from an agent wake: the status `PATCH /api/issues/{id}` does NOT
trust a plain Bearer agent key — it 401s with `{"error":"Agent run id required"}`
unless the request carries the run-id header. This cost several debug cycles on
SDS-90 (wrong header name guessed first).

## Correct call (works, no Bearer needed on local_trusted)

```bash
curl -s -X PATCH "http://127.0.0.1:3100/api/issues/{id}" \
  -H "Content-Type: application/json" \
  -H "x-paperclip-run-id: $RUN_ID" \
  -d '{"status":"done"}'
```

- `$RUN_ID` = the current wake's run. Sources: `$PAPERCLIP_RUN_ID` env, or the
  issue record's `activeRun.id` / `checkoutRunId` / `executionRunId`, or the
  `/api/issues/{id}/runs` first entry.
- Header name is **`x-paperclip-run-id`**. The analogous `x-agent-run-id` is
  IGNORED by the guard (same 401) — do not waste calls probing header variants.
  The working example is in `server.log`: `PATCH /issues/{id} 200` sent by
  `Python-urllib` with only `x-paperclip-run-id` and NO Authorization header.
- One PATCH per close; include `{"status":"done"}` only for bare close (avoid
  spawning a comment re-wake). Verify the response has `completedAt` set, then
  do a final end-of-wake re-GET to confirm it held (known status re-flip).

## Contrast: comment POST

Adding a comment that must be `authorType:agent` (and NOT wake-spawning as a
USER-type) DOES need the minted agent Bearer key:

```bash
KEY=$(curl -s -X POST "$API/api/agents/$AGENT_ID/keys" -H 'Content-Type: application/json' \
  -d "{\"companyId\":\"$COMPANY_ID\"}" | python -c "import json,sys;print(json.load(sys.stdin)['token'])")
curl -s -X POST "$API/api/issues/{id}/comments" -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $KEY" -d '{"body":"...","authorType":"agent"}'
```

Note the keys-mint endpoint needs a JSON body `{"companyId": ...}` (empty POST →
`Validation error`).

## Endpoint location

Issue routes are `/api/issues/{id}` / `/api/issues/{id}/comments` — NOT
company-scoped (`/api/companies/{cid}/issues/{iid}/...` 404s). Comments list is
newest-first.
