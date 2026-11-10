#!/usr/bin/env python3
"""Read-only probe of the live ADDies MongoDB via the BACKEND's own mongoose.

Use when the addies MCP server's data tools fail. Known causes this isolates:
- dual-mongoose bug (2026-08-15): mcp/src/db.ts connects mongoose 8.24.3
  from mcp/node_modules, but backend models require() mongoose from
  backend/node_modules (7.8.7) - a second, never-connected instance - so
  every data tool dies with "buffering timed out after 10000ms" while Atlas
  is healthy. This probe uses the backend mongoose, so it connects.
- collection drift: model 'order' pluralizes to 'orders' (EMPTY) while live
  docs sit in a collection literally named 'Order' (flat top-level
  createdAt, NOT timestamps.createdAt).

The probe is READ-ONLY (countDocuments/find/aggregate only) - the sanctioned
isolation fallback for report tasks. Never pass a write op.

Usage (stdlib only, any cwd):
  python addies-db-probe.py collections
      -> list every collection in the db with doc counts
  python addies-db-probe.py Order '{"paymentStatus":"pending"}' '{"createdAt":-1}' 3
      -> find docs in collection 'Order' matching filter, sorted, limited;
         each doc printed as JSON on its own line
  python addies-db-probe.py Order '{}' '{}' 5
      -> first 5 docs in 'Order'

Exit codes: 0 ok / 2 connect or query failure / 3 env misconfig.
Notes: DNS preload (8.8.8.8) is baked in for the ISP SRV-ECONNREFUSED
problem; timeouts are 45s/30s so a healthy DB connects in <1s.
"""
import json
import os
import subprocess
import sys

BACKEND = "D:/Dev/appZeno/ADDies/backend"
ENV_PATH = BACKEND + "/.env"
MONGOOSE = (BACKEND + "/node_modules/mongoose").replace("\\", "/")


def load_uri():
    uri = None
    with open(ENV_PATH, "r", encoding="utf-8", errors="replace") as f:
        for line in f:
            line = line.strip()
            if line.startswith("DATABASE_URL="):
                uri = line.split("=", 1)[1].strip().strip('"').strip("'")
                break
    if not uri:
        print("DATABASE_URL not found in " + ENV_PATH)
        sys.exit(3)
    sep = "&" if "?" in uri else "?"
    return uri + sep + "serverSelectionTimeoutMS=45000&connectTimeoutMS=30000"


NODE_SCRIPT = r"""
const dns = require('dns');
dns.setServers(['8.8.8.8', '8.8.4.4', '1.1.1.1']);
const mongoose = require(process.env.MONGOOSE);
(async () => {
  try {
    await mongoose.connect(process.env.PROBE_URI,
      { serverSelectionTimeoutMS: 45000, connectTimeoutMS: 30000 });
    const db = mongoose.connection.db;
    const q = JSON.parse(process.env.PROBE_QUERY);
    if (q === 'COLLECTIONS') {
      const colls = await db.listCollections().toArray();
      for (const c of colls) {
        const n = await db.collection(c.name).countDocuments({});
        console.log('COLL|' + c.name + '|' + n);
      }
    } else {
      const cur = db.collection(q.coll).find(q.filter || {});
      if (q.sort) cur.sort(q.sort);
      cur.limit(q.limit || 50);
      const rows = await cur.toArray();
      for (const r of rows) {
        console.log('ROW|' + JSON.stringify(r,
          (k, v) => (v instanceof Date ? v.toISOString() : v)));
      }
    }
    await mongoose.disconnect();
  } catch (e) {
    console.log('FAIL: ' + e.message);
    process.exit(2);
  }
})();
"""


def main():
    args = sys.argv[1:]
    if not args or args[0] in ("-h", "--help"):
        print(__doc__)
        return 0
    if args[0] == "collections":
        query = "COLLECTIONS"
    else:
        coll = args[0]
        filt = json.loads(args[1]) if len(args) > 1 and args[1].startswith("{") else {}
        sort = json.loads(args[2]) if len(args) > 2 and args[2].startswith("{") else None
        limit = int(args[3]) if len(args) > 3 else 50
        query = json.dumps({"coll": coll, "filter": filt, "sort": sort, "limit": limit})

    env = dict(os.environ)
    env["PROBE_URI"] = load_uri()
    env["PROBE_QUERY"] = query
    env["MONGOOSE"] = MONGOOSE
    r = subprocess.run(["node", "-e", NODE_SCRIPT], capture_output=True,
                       text=True, env=env, timeout=180)
    print(r.stdout, end="")
    if r.stderr:
        print("STDERR:", r.stderr[-1500:])
    if r.returncode != 0:
        return r.returncode
    return 2 if "FAIL:" in r.stdout else 0


if __name__ == "__main__":
    sys.exit(main())
