#!/usr/bin/env python3
"""Append a section to an issue decision-log document (race-safe).

Fresh-GETs the document immediately before the PUT and sends that GET's
`latestRevisionId` as `baseRevisionId`, so the append never 409s against a
stale revision — parallel CEO wakes append to the same doc and move the
revision between fetches.

Usage:
    python append-decision-log.py <issueId> <entryFile>
        issueId   - board issue id holding the decision-log document
                    (Board Operations standing issue: 8cabec31-4d50-4774-b0fe-69d0afb8676e)
        entryFile - markdown file with the entry to append ("## ..." section)
                    or '-' to read the entry from stdin

Env: PAPERCLIP_API_URL (default http://localhost:3100)

Prints the new latestRevisionNumber. Exit 0 on success.
"""
import json
import os
import sys
import urllib.request

BASE = os.environ.get("PAPERCLIP_API_URL", "http://localhost:3100")


def main():
    if len(sys.argv) != 3:
        print(__doc__)
        sys.exit(2)
    issue_id, entry_file = sys.argv[1], sys.argv[2]
    url = f"{BASE}/api/issues/{issue_id}/documents/decision-log"

    # 1. Fresh GET — never write against a stale revision
    with urllib.request.urlopen(url) as r:
        doc = json.load(r)
    body = doc["body"]

    # 2. Read entry
    if entry_file == "-":
        entry = sys.stdin.read()
    else:
        with open(entry_file, "r", encoding="utf-8") as f:
            entry = f.read()

    # 3. Append + PUT with baseRevisionId from the fresh GET
    new_body = body.rstrip() + "\n\n" + entry.lstrip("\n")
    payload = {
        "title": "Decision Log",
        "format": "markdown",
        "body": new_body,
        "baseRevisionId": doc["latestRevisionId"],
    }
    req = urllib.request.Request(
        url, data=json.dumps(payload).encode(), method="PUT",
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req) as r:
        updated = json.load(r)
    print(updated["latestRevisionNumber"])


if __name__ == "__main__":
    main()
