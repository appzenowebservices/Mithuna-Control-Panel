#!/usr/bin/env python3
"""Call an addies MCP tool via direct stdio JSON-RPC (no Hermes MCP toolset needed).

Usage:
  python addies-mcp-call.py hello
  python addies-mcp-call.py orders.list '{"limit": 500}'
  python addies-mcp-call.py orders.get '{"orderId": "ADD-1234"}'

Spawns the addies MCP server with the Atlas SRV-DNS fix preloaded
(dns.setServers 8.8.8.8/1.1.1.1 — the ISP resolver refuses SRV queries),
runs initialize + notifications/initialized, calls the requested tool, and
prints result.content[].text. List tools default to {"limit": 50} when no
args are given.

Exit codes: 0 = ok, 2 = MCP tool error (isError), 3 = connection failure.
If a DB-backed tool fails while `hello` succeeds, the server process is fine
and the failure is at the DB layer (e.g. Atlas IP-whitelist rejection) —
confirm with a second DB tool (users.list) before reporting blocked.
"""
import json
import os
import subprocess
import sys
import tempfile

SERVER_CMD = [
    "node",
    "D:/Dev/appZeno/ADDies/mcp/node_modules/tsx/dist/cli.mjs",
    "--tsconfig", "D:/Dev/appZeno/ADDies/mcp/tsconfig.json",
    "D:/Dev/appZeno/ADDies/mcp/src/index.ts",
    "--stdio",
]

LIST_TOOLS = {"orders.list", "trips.list", "vendors.list", "stores.list",
              "partners.list", "users.list", "leads.list"}


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)
    tool = sys.argv[1]
    if len(sys.argv) > 2:
        args = json.loads(sys.argv[2])
    elif tool in LIST_TOOLS:
        args = {"limit": 50}
    else:
        args = {}

    # DNS fix: preload setServers so the Atlas SRV lookup does not hit the ISP resolver
    dnsfix = os.path.join(tempfile.gettempdir(), "dnsfix_atlas.cjs")
    with open(dnsfix, "w") as f:
        f.write("require('node:dns').setServers(['8.8.8.8','1.1.1.1']);\n")
    env = dict(os.environ)
    env["NODE_OPTIONS"] = ("--require " + dnsfix + " " + env.get("NODE_OPTIONS", "")).strip()

    proc = subprocess.Popen(
        SERVER_CMD, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
        stderr=subprocess.PIPE, text=True, bufsize=1, env=env,
    )
    req_id = 0

    def call(method, params=None):
        nonlocal req_id
        req_id += 1
        req = {"jsonrpc": "2.0", "id": req_id, "method": method}
        if params is not None:
            req["params"] = params
        proc.stdin.write(json.dumps(req) + "\n")
        proc.stdin.flush()
        while True:
            line = proc.stdout.readline()
            if not line:
                raise RuntimeError("MCP server closed stdout")
            msg = json.loads(line)
            if msg.get("id") == req_id:
                return msg

    try:
        call("initialize", {
            "protocolVersion": "2024-11-05", "capabilities": {},
            "clientInfo": {"name": "addies-stdio-client", "version": "1.0.0"},
        })
        proc.stdin.write(json.dumps({"jsonrpc": "2.0", "method": "notifications/initialized"}) + "\n")
        proc.stdin.flush()
        res = call("tools/call", {"name": tool, "arguments": args})
        result = res.get("result", {})
        if result.get("isError"):
            for c in result.get("content", []):
                print("MCP ERROR:", c.get("text", ""))
            sys.exit(2)
        for c in result.get("content", []):
            print(c.get("text", ""))
    except Exception as e:  # noqa: BLE001 - report any failure mode to the caller
        print("CONNECTION ERROR:", e)
        sys.exit(3)
    finally:
        proc.terminate()


if __name__ == "__main__":
    main()
