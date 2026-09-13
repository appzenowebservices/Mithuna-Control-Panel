---
name: algo-trader
description: >
  Operate the live algo-trader system (MT5 market data, market-state analysis,
  order execution) through its MCP server. Use for trading research and order
  management - NOT for development work on the algo-trader codebase.
metadata:
  hermes:
    house: 10
    domains: ["algo trading", "trading bot", "trade execution", "market trading"]
    contract:
      max_retries: 1
      checks:
        forbidden_phrases:
          - "I cannot"
          - "I'm unable to"
          - "I can't do this"
          - "someone will have to do this"
        required_section:
          when:
            workMode: [standard]
          section: "Result"
        disposition_marker:
          when:
            workMode: [standard]
          phrases:
            - "done"
            - "in_review"
            - "blocked"
            - "cancelled"
            - "in_progress"
            - "complete"
            - "shipped"
---

# algo-trader Skill

You operate the live algo-trader system through its MCP server (`algo-trader`):
fetch MT5 market data, run the market-state analysis engine (trend, volatility,
compression, liquidity, astro) and place/manage orders. The MCP server is the
ONLY way to touch the live MT5 account - never call MT5 directly or guess
values you did not observe from a tool response.

## When to Use

- An issue asks to analyze a symbol's market state, scan a history window for
  structure/events, or manage positions/orders on the MT5 account.
- Any operational work against the trading terminal (data, analysis, orders).

## Prerequisites

- MCP server `algo-trader` registered in Hermes (`mcp_servers.algo-trader` in
  `config.yaml`) and enabled (`hermes mcp configure algo-trader`).
- The server auto-spawns its Python MT5 bridge; the MT5 terminal must be
  running and logged in (demo account for this environment).
- `TRADING_ENABLED` is `false` unless execution is explicitly intended. If an
  order tool fails with "Trading is disabled", report it and mark the issue
  `blocked` - do not attempt to bypass it.
- If a tool call fails with 401/403, report the auth config problem and mark
  the issue `blocked`.

## Tools

| Tool | Purpose |
|---|---|
| `hello` | Connectivity check. |
| `market.get_history` | OHLC candles for a symbol/timeframe. |
| `market.get_price` | Live bid/ask tick. |
| `market.list_symbols` | Visible MT5 symbols + trade metadata. |
| `market.get_account` | Account balance/equity/margin/leverage/currency. |
| `market.analyze_state` | Analysis engine over history: trend/volatility/compression/liquidity/astro state + events. Optional `astroChart` input. |
| `market.scan_window` | Candle-by-candle event scan over a history window. |
| `trade.place_order` | Market or pending order (gated by TRADING_ENABLED + MAX_VOLUME). |
| `trade.close_position` | Close a position by ticket. |
| `trade.get_positions` / `trade.get_orders` | Open positions / pending orders. |
| `trade.modify_order` / `trade.cancel_order` | Modify / cancel a pending order. |
| `trade.get_history_deals` | Recent closed deals. |
| `config.get_defaults` / `config.set_defaults` | Read/set trading defaults (volume, magic, deviation, comment, filling). |

## Procedure

1. **Read the issue** - extract the symbol, timeframe, and action (analyze,
   scan, order, close, etc.).
2. **Check the environment** - `hello` to confirm connectivity, then
   `market.get_account` to confirm which account you are on before any order.
3. **Set defaults once** - if the task involves orders, call
   `config.set_defaults` with the intended volume/magic, then omit them on
   later order calls.
4. **Analyze** - `market.get_history` (or pass `history` directly) then
   `market.analyze_state`, or `market.scan_window` when the issue wants events
   over a window. Pass an optional `astroChart` from the astrologics MCP server
   (`compute_transits`) when astro context is available.
5. **Act** - for orders, `trade.place_order` (BUY/SELL or a pending type) with
   the symbol and volume; confirm the returned `retcode`/`order`/`deal`.
6. **Verify** - re-read `trade.get_positions` / `trade.get_orders` to confirm
   the change took effect.
7. **Report** - post the outcome under a "Result" section, including the
   symbol, ticket/order id, volume, price and any changed fields.

## Presentation Rules

- Lead with the Result section: what changed and what it now looks like.
- Include the order/position ticket and symbol in every report.
- If a step failed, say exactly which tool and argument failed and why.

## Verification

- The issue is only `done` after the mutation is confirmed by a re-read.
- Never claim a result you did not observe via a tool response.
- If `TRADING_ENABLED=false` blocks an order, mark the issue `blocked` with
  the exact error - do not improvise an execution.
