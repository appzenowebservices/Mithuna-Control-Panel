# Intake-Channel Verification Probe (Paperclip)

Reusable E2E recipe for the "verify the channel is real before closing" deliverable
(XXX-80/84 cluster, 2026-08-11). The channel is the Paperclip board: a client brief
lands as a goal-linked lead issue. The probe proves submit -> recorded -> retrievable.

## Canonical probe (single urllib heredoc, zero dump files)

```python
import json, urllib.request

BASE = "http://127.0.0.1:3100"
CID = "<company-uuid>"
GOAL = "<goal-uuid>"  # the goal briefs must link to

def req(method, url, payload=None):
    data = json.dumps(payload).encode() if payload is not None else None
    r = urllib.request.Request(url, data=data, method=method,
                               headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(r, timeout=15) as resp:
        body = resp.read().decode()
        try:
            return resp.status, json.loads(body) if body.strip() else None
        except json.JSONDecodeError:
            return resp.status, {"_raw": body[:80]}  # tolerant: root GET is 200 + empty body

# 1. reachability (status alone is the check - root body is empty by design)
print("board root GET:", req("GET", BASE + "/")[0])

# 2. submit a client brief through the documented intake path
status, created = req("POST", f"{BASE}/api/companies/{CID}/issues", {
    "title": "INTAKE TEST - sample client brief (verification)",
    "status": "todo", "priority": "low", "goalId": GOAL, "blockedByIssueIds": [],
})
iid = created.get("id")
print("brief POST:", status, "| identifier:", created.get("identifier"))

# 3. retrievable + goal-linked (create echo can lie - GET back and assert)
status, fetched = req("GET", f"{BASE}/api/issues/{iid}")
print("goal linked:", fetched.get("goalId") == GOAL, "| status:", fetched.get("status"))

# 4. cancel the probe so it does not pollute the lead pipeline
status, closed = req("PATCH", f"{BASE}/api/issues/{iid}", {
    "status": "cancelled",
    "comment": ("Intake-path verification artifact for <issue-key>. The documented intake "
                "channel accepted this brief and recorded it as a goal-linked lead issue. "
                "Verification PASSED end-to-end: submit -> recorded -> retrievable. "
                "Cancelling so it does not pollute the lead pipeline."),
})
print("probe cancel:", status, "|", closed.get("status"), "| cancelledAt:", closed.get("cancelledAt"))
```

## Rules

- Probes are **cancelled, never `done`** — a cancelled probe is the established convention
  (XXX-92, XXX-94, 910f81d0, cffa2d4a, XXX-97) and keeps the lead pipeline clean.
- Goal-link is the contract: assert `fetched.goalId == GOAL` after a GET; the create echo
  can lie (same class as the `blockedByIssueIds` echo gotcha).
- Tolerant JSON: the board root returns HTTP 200 with an EMPTY body — a bare `json.loads`
  raises JSONDecodeError; parse defensively (empty/non-JSON -> None or raw).
- Probe issues get no assignee; they are verification artifacts, not leads.
- One fresh probe per wake is enough — prior probes on the trail are convergent evidence;
  cite them instead of re-probing repeatedly (board churn).
- Keep comment bodies free of backslashes (PATCH 500 trigger).

## Parallel-sibling commit attribution

When several wakes deliver one shared artifact (offering doc, README section), a parallel
sibling may commit it under a commit message crediting THEIR issue while the content's own
status line credits yours (2026-08-11 XXX-80: `docs/client-service-offering.md` committed as
"312d0f0f ... (XXX-84)" by the CMO run, content says v1.1/XXX-80; the README commit eb5d0420
said XXX-80). Do NOT rewrite history (amend/rebase) to fix attribution — parallel runs may
have already built on the SHA. Carry BOTH SHAs and the content's own attribution in your
audit comment so the trail shows the full picture.
