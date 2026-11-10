# Astrologics MCP wiring — runtime gaps seen on SDS-67

Symptom on SDS-67 ("tell me today mars sideral position?"): the run could NOT
compute anything even though the system prompt listed astrology skills and
`config.yaml` registers the `astrologics` MCP server.

## What was actually true in the run (2026-09-01)

- `skills_list` → empty ("No skills found in skills/ directory").
- `skill_view('astrology-consultation')` and `skill_view('astrologics')` → not found.
- Skill content DID exist on disk, the runtime just didn't register it:
  - `D:\Dev\agent-bellwether\hermes-agent\skills\astrology\astrology-consultation\`
    (SKILL.md + scripts/compute_chart.py, scripts/compute_transits.py,
    scripts/verify_sidereal_positions.py, references/significations.md,
    templates/report-structure.md)
  - legacy `C:\Users\pc\.hermes\skills\astrologics\SKILL.md` (company variant)
- `config.yaml` (HERMES_HOME agent-bellwether) DOES register
  `mcp_servers.astrologics` → `node .../Astro-Logics/mcp-server/.../index.ts --stdio`.
- BUT the Astrologer agent's `adapterConfig.toolsets` = `["terminal","file","web","skills"]`
  — no `mcp` toolset ⇒ `compute_natal_chart` / `compute_transits` / `generate_reading`
  never appear in the session regardless of config.yaml.

## Correct disposition (per astrologics skill + board rules)

1. Do NOT hand-compute ephemeris (Swiss Ephemeris is server-side only).
2. Do NOT substitute another skill or improvise a reading.
3. Post an agent comment on the issue:
   `missing_skillset: astrology-consultation skill (runtime registry empty despite
   on-disk SKILL.md) + astrologics MCP tools (config.yaml registers server but
   agent toolsets lack 'mcp')`.
4. Close with bare PATCH `{"status":"blocked"}` — no comment bundled (SDS-37 wake loop
   is about USER-type comments; an agent comment + bare PATCH is the sanctioned path).

## Diagnostic snippet for future runs

```bash
echo $HERMES_HOME; ls $HERMES_HOME/skills; ls ~/.hermes/skills
grep -A6 mcp_servers $HERMES_HOME/config.yaml
curl -s $PAPERCLIP_API_URL/api/agents/$PAPERCLIP_AGENT_ID   # adapterConfig.toolsets
```

The fix is a board-side/setup change (register skills in the runtime the agent actually
loads, and/or add `mcp` to the agent's toolsets) — not something the agent can self-heal
mid-run.