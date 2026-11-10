#!/usr/bin/env python3
"""Call tools on the ADDies MCP server over stdio - no MCP SDK needed.

Usage:
  python addies_mcp.py tools.list
  python addies_mcp.py hello
  python addies_mcp.py orders.list '{"status":"created","limit":3}'

Prints the text content of each tool response. Exits non-zero if any tool
call times out or reports isError.

Spawns the server through addies_bootstrap.ts (same dir), which forces
public DNS servers BEFORE the MCP entry loads - the local router DNS fails
Atlas SRV lookups (querySrv ECONNREFUSED _mongodb._tcp.<cluster>.mongodb.net).
"""
import json
import subprocess
import sys
import threading
import time
import os

HERE = os.path.dirname(os.path.abspath(__file__))
BOOTSTRAP = os.path.join(HERE, "addies_bootstrap.ts").replace("\\", "/")

CMD = [
    "node",
    "D:/Dev/appZeno/ADDies/mcp/node_modules/tsx/dist/cli.mjs",
    "--tsconfig", "D:/Dev/appZeno/ADDies/mcp/tsconfig.json",
    BOOTSTRAP,
    "--stdio",
]


def main():
    args = sys.argv[1:]
    if not args:
        print(__doc__)
        return 2

    proc = subprocess.Popen(
        CMD, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
        stderr=subprocess.PIPE, text=True, bufsize=1,
        encoding="utf-8", errors="replace",
    )
    responses = {}
    lock = threading.Lock()

    def reader():
        for line in proc.stdout:
            line = line.strip()
            if not line:
                continue
            try:
                msg = json.loads(line)
            except Exception:
                continue
            if "id" in msg:
                with lock:
                    responses[msg["id"]] = msg

    threading.Thread(target=reader, daemon=True).start()

    def send(msg):
        proc.stdin.write(json.dumps(msg) + "\n")
        proc.stdin.flush()

    def wait_for(req_id, timeout=120):
        deadline = time.time() + timeout
        while time.time() < deadline:
            with lock:
                if req_id in responses:
                    return responses[req_id]
            time.sleep(0.25)
        return None

    send({"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {
        "protocolVersion": "2024-11-05",
        "capabilities": {},
        "clientInfo": {"name": "stdio-client", "version": "1.0"}}})
    init = wait_for(1)
    print("INIT:", json.dumps(init, default=str)[:300])
    send({"jsonrpc": "2.0", "method": "notifications/initialized", "params": {}})

    failures = 0
    i = 0
    while i < len(args):
        tool = args[i]
        i += 1
        if tool == "tools.list":
            rid = "tools_list"
            send({"jsonrpc": "2.0", "id": rid, "method": "tools/list", "params": {}})
            resp = wait_for(rid)
            if resp is None:
                print("tools.list: TIMEOUT")
                failures += 1
                continue
            res = resp.get("result", {})
            for t in res.get("tools", []):
                print(f"TOOL: {t.get('name')} - {t.get('description','')[:80]}")
            continue
        arguments = {}
        if i < len(args) and args[i].startswith("{"):
            try:
                arguments = json.loads(args[i])
            except Exception as e:
                print(f"{tool}: bad args JSON: {e}")
                return 2
            i += 1
        rid = tool.replace(".", "_") + "_" + str(i)
        send({"jsonrpc": "2.0", "id": rid, "method": "tools/call",
              "params": {"name": tool, "arguments": arguments}})
        resp = wait_for(rid)
        if resp is None:
            print(f"{tool}: TIMEOUT")
            failures += 1
            continue
        result = resp.get("result", {})
        for c in result.get("content", []):
            if c.get("type") == "text":
                print(f"{tool} {json.dumps(arguments)}: {c.get('text', '')}")
            else:
                print(f"{tool}: {json.dumps(c, default=str)}")
        if result.get("isError"):
            failures += 1

    proc.stdin.close()
    proc.terminate()
    try:
        proc.wait(timeout=5)
    except Exception:
        proc.kill()
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
