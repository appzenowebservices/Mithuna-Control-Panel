#!/usr/bin/env python3
"""Call tools on the algo-trader MCP server over stdio - no MCP SDK needed.

Usage:
  python mcp_stdio_client.py [--mock] TOOL_NAME [TOOL_NAME ...]

Examples:
  python mcp_stdio_client.py hello market.get_account market.list_symbols
  python mcp_stdio_client.py --mock hello market.get_account market.list_symbols

--mock sets MT5_BRIDGE_MOCK=true before spawning the server, selecting the
canned bridge_mock.py backend (no MT5 terminal required) - the same mode the
official smoke test (D:/Dev/trade-mcp/scripts/smoke.mjs) uses.

Prints the text content of each tool response. Exits non-zero if any tool
call times out or reports isError.
"""
import json
import os
import subprocess
import sys
import threading
import time

CMD = [
    "node",
    "D:/Dev/trade-mcp/node_modules/tsx/dist/cli.mjs",
    "--tsconfig", "D:/Dev/trade-mcp/tsconfig.json",
    "D:/Dev/trade-mcp/src/index.ts",
    "--stdio",
]


def main():
    args = sys.argv[1:]
    mock = False
    if args and args[0] == "--mock":
        mock = True
        args = args[1:]
    if not args:
        print(__doc__)
        return 2
    if mock:
        os.environ["MT5_BRIDGE_MOCK"] = "true"

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

    # handshake
    send({"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {
        "protocolVersion": "2024-11-05",
        "capabilities": {},
        "clientInfo": {"name": "stdio-client", "version": "1.0"}}})
    init = wait_for(1)
    print("INIT:", json.dumps(init, default=str)[:300])
    send({"jsonrpc": "2.0", "method": "notifications/initialized", "params": {}})

    def call_tool(tool, rid):
        send({"jsonrpc": "2.0", "id": rid, "method": "tools/call",
              "params": {"name": tool, "arguments": {}}})
        return wait_for(rid)

    failures = 0
    for tool in args:
        rid = tool.replace(".", "_")
        resp = call_tool(tool, rid)
        if resp is None:
            print(f"{tool}: TIMEOUT")
            failures += 1
            continue
        result = resp.get("result", {})
        for c in result.get("content", []):
            if c.get("type") == "text":
                print(f"{tool}: {c.get('text', '')}")
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
