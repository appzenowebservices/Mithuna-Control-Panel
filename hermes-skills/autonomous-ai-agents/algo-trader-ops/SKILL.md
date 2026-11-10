---
name: algo-trader-ops
description: "Operate the algo-trader MCP server (MT5 market data, analysis, gated orders) for the VANIK/GUP trading company: stdio JSON-RPC client pattern, mock-bridge mode, tool reference."
version: 1.0.0
author: Hermes Agent
license: MIT
platforms: [windows, macos, linux]
metadata:
  hermes:
    house: 10
    domains: ["trading ops", "algo ops"]
    tags: [paperclip, vanik, trading, mt5, mcp, algo-trader]
    category: autonomous-ai-agents
    related_skills: [board-ops, paperclip-ceo]
---

# algo-trader Ops Skill

Operate the live algo-trader trading system (MT5 market data, market-state
analysis, gated order execution) through its MCP server. Used by **VANIK**
(Paperclip company prefix `GUP`, "A Gupta Trading House", companyId
`b59dbf88-88c2-4627-89c9-53ebc8b1eb70`).

Companion to the paperclip-side skill at
`D:\Dev\agent\paperclip\skills\algo-trader\SKILL.md` — that one is NOT indexed
by Hermes (`skill_view` fails), so read it from disk for the canonical
procedure. This skill carries the operational lessons for reaching and driving
the server, mirroring how `board-ops` documents paperclip-managed
skills.

## When to Use

- Any GUP/VANIK issue asking to check connectivity (`hello`), report account
  info, list symbols, analyze market state, scan history, or manage
  positions/orders on the MT5 account.
- Task text mentioning `market.get_account`, `market.list_symbols`,
  `market.analyze_state`, `trade.*`, MT5, or symbols.

## Server facts

- Repo: `D:/Dev/trade-mcp` (TypeScript MCP server + Python MT5 bridge).
  Registered in Hermes `config.yaml` under `mcp_servers.algo-trader`
  (stdio transport, enabled).
- stdio is the default mode:
  `node D:/Dev/trade-mcp/node_modules/tsx/dist/cli.mjs --tsconfig D:/Dev/trade-mcp/tsconfig.json D:/Dev/trade-mcp/src/index.ts --stdio`.
  HTTP mode (`npm run dev`, `http://127.0.0.1:8767/mcp`) is usually NOT running.
- The server spawns its own Python bridge as a child process
  (`bridge/env/Scripts/python.exe -m uvicorn bridge:app` or `bridge_mock:app`),
  so no separate bridge process is needed.
- `hermes mcp test algo-trader` verifies connectivity and lists the discovered
  tools (16: `hello`, `market.*`, `trade.*`, `config.*`) — a good first
  diagnostic.

## Tools

| Tool | Purpose |
|---|---|
| `hello` | Connectivity check |
| `market.get_history` / `market.get_price` | OHLC candles / live tick |
| `market.list_symbols` | Visible MT5 symbols + trade metadata |
| `market.get_account` | Account balance/equity/margin/leverage/currency |
| `market.analyze_state` / `market.scan_window` | Analysis engine over history |
| `trade.place_order` / `close_position` / `get_positions` / `get_orders` / `modify_order` / `cancel_order` / `get_history_deals` | Orders & positions (gated) |
| `config.get_defaults` / `config.set_defaults` | Trading defaults |

## Procedure

1. **Verify connectivity** — `hermes mcp test algo-trader` (fast, shows the
   tool list), or go straight to a `hello` tool call.
2. **Reach the tools** — if MCP tools are exposed in the direct toolset, call
   them normally. If not (observed 2026-08-15: not exposed), drive the stdio
   server with the bundled JSON-RPC client:
   `python "D:/Dev/agent/hermes-agent/skills/autonomous-ai-agents/algo-trader-ops/scripts/mcp_stdio_client.py" [--mock] hello market.get_account market.list_symbols`
   (stdlib-only, no SDK; run from any cwd, e.g. `D:/Dev/trade-mcp` — the
   script is NOT inside the trade-mcp repo, it lives in this skill's
   `scripts/` dir; resolve it via `skill_view` or the absolute path above).
   There is NO `hermes mcp call` CLI subcommand.
3. **Check the account first** — `market.get_account` before any order work
   (algo-trader skill rule: confirm which account you are on).
4. **Orders are gated** — `TRADING_ENABLED=false` in `D:/Dev/trade-mcp/.env`
   makes trade tools refuse. Never bypass; report and mark the issue `blocked`
   if an order is genuinely required.
5. **Mock bridge for no-MT5 environments** — when `.env` MT5 credentials are
   empty and the terminal is not running, the real bridge fails with
   `Bridge error 503: MT5 terminal initialization failed ... Invalid login argument`.
   The documented fallback is mock mode: `--mock` (sets `MT5_BRIDGE_MOCK=true`
   → spawns `bridge_mock.py`, canned data) — the same mode the official smoke
   test (`D:/Dev/trade-mcp/scripts/smoke.mjs`) uses. Smoke/connectivity tasks
   complete honestly with mock data; **flag the live-data gap in the issue
   report** so the operator knows the values are not live MT5.
6. **Report + close** — post a `Result` section with only observed tool
   responses, then the standard single-call close PATCH on the board issue.

## Mock bridge data (`bridge_mock.py`, observed 2026-08-15)

- account: login 1234567, server MockServer, name "Mock Demo", currency USD,
  balance/equity/freeMargin 10000.0, margin 0.0, leverage 100, tradeMode 0
- symbols: 2 — EURUSD, GBPUSD (digits 5, point 0.00001, volume 0.01–100 step 0.01)

## Pitfalls

- `hermes mcp call` does not exist — don't hunt for a CLI call subcommand; use
  the stdio client script.
- The mock flag must be in the CLIENT process env before spawning node (the
  server reads `process.env.MT5_BRIDGE_MOCK` at bridge spawn); the `--mock`
  flag handles this.
- Real bridge needs `MT5_LOGIN` / `MT5_PASSWORD` / `MT5_SERVER` / `MT5_PATH`
  in `.env` AND the MT5 terminal running (`C:\Program Files\MetaTrader 5\terminal64.exe`,
  check via `tasklist //FI "IMAGENAME eq terminal64.exe"`). Empty creds → 503
  with `(-2, 'Invalid "login" argument')`.
- On Windows run the client with `python`; use forward-slash paths; write any
  ad-hoc variants under the OS temp dir, never the repo tree.
- Never claim values you did not observe from a tool response (algo-trader
  skill rule).

## Verification

- `hello` returns the server identity + timestamp.
- `market.get_account` returns login/server/currency/balance/equity/margin/
  freeMargin/leverage/tradeMode.
- `market.list_symbols` returns `count` + per-symbol metadata.
- Smoke tasks ("no orders"): assert no `trade.*` call was made.

## References

- `scripts/mcp_stdio_client.py` — stdlib-only stdio MCP client: spawns the
  server, initializes, calls the named tools, prints JSON responses.
