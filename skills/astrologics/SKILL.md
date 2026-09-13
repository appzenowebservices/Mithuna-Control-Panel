---
name: astrologics
description: >
  Operate the live Astrologics system (ephemeris, natal charts, transits,
  readings) through its MCP server. Use for client advisory work - NOT for
  development work on the Astrologics codebase.
metadata:
  hermes:
    house: 9
    domains: [ephemeris, natal charts, transits, client advisory, advisory work, mcp server data, live astrologics system, readings]
    intent_examples:
      - "check the ephemeris"
      - "client advisory"
      - "compute transits"
      - "natal charts"
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
          section: "Reading"
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

# Astrologics Skill

You deliver astrology consultations against the **live Astrologics engine** via
its MCP server (`astrologics`). The MCP server computes ephemeris data with the
real Swiss Ephemeris, runs transit calculations, and generates the final
reading prose server-side with the project's LLM pipeline. You never compute
positions yourself and never touch the Astrologics database or web app.

## When to Use

- A client requests a natal chart, transit forecast, or consultation reading.
- An issue references a birth moment + location (or a saved chart) and asks for
  interpretation.

## Prerequisites

- The `astrologics` MCP server is registered in Hermes
  (`mcp_servers.astrologics` in `config.yaml`) and enabled.
- If a tool call fails with 401/403, the MCP server auth is misconfigured:
  report it in the issue thread and mark the issue `blocked`.

## Tools

| Tool | Purpose |
|---|---|
| `compute_natal_chart` | Compute a natal chart (sidereal Lahiri by default): planets, houses, aspects, dignity, profiles. Input: birth ISO timestamp, latitude, longitude, optional coordinateSystem. |
| `compute_transits` | Compute live transit positions for a moment + location. |
| `generate_reading` | Generate the final reading from a natal chart object (returned by `compute_natal_chart`) + optional focus prompt. The LLM interpretation is done server-side. |
| `hello` | Connectivity check. |

## Procedure

1. **Read the issue** — extract the birth moment (ISO 8601 UTC), location
   (lat/lon if given), and the client's focus (career, relationships, finance,
   general).
2. **Compute the chart** — call `compute_natal_chart` with the birth data.
3. **Compute transits** — call `compute_transits` for the current moment (or
   the date named in the issue) using the same location.
4. **Generate the reading** — call `generate_reading` passing the chart object
   from step 2 back **as-is**, with the client's focus as `prompt`.
5. **Present** — post the reading in the issue thread under a **"Reading"**
   section, and include a compact chart summary (Ascendant, Sun, Moon signs)
   above it.

## Presentation Rules

- Lead with the **Reading** section (the final prose from `generate_reading`).
- Below it, a short data block: `Asc: <sign> · Sun: <sign> in house <n> ·
  Moon: <sign> in house <n> · notable aspects: <list>`.
- If transits were computed, add one line: `Transits for <date>: <top 3
  transits>`.
- Never invent or alter positions or reading text returned by the tools.

## Deliverable location

Write the consultation artifact to the **company execution workspace**, one
folder per issue:

```
<workspace cwd>/SDS/artifacts/<SDS-NN>/
  astrologics-consultation-<sds-nn>.md   the reading record (full scaffolding)
  <compute outputs>                      chart/transit JSON or txt for the issue
```

- The workspace is a local git repo — commit the record + outputs and cite the
  **commit hash** in the issue close comment (it is the authoritative locator).
- Register a work product for the record with `provider: "git"`,
  `workspaceId: e07b53e0-a6de-4430-89a5-fb4069cc90be` (Astrologics company
  workspace `homeGround`), and `relativePath`/`displayPath`
  `SDS/artifacts/<SDS-NN>/astrologics-consultation-<sds-nn>.md`.
- Tooling (compute scripts) stays in the astrology skill's `scripts/` — only
  per-issue records and outputs are artifacts here.

## Verification

- The issue is only `done` after the reading is posted and confirmed present in
  the thread.
- If `generate_reading` fails (e.g. the reading LLM is offline), report the
  exact error and mark the issue `blocked` - do not improvise a reading.
