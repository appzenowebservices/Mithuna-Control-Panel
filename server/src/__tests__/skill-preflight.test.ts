import { describe, expect, it } from "vitest";
import {
  evaluateSkillPreflight,
  hasSkillRequirements,
  parseSkillRequirements,
} from "../services/skill-preflight.js";

const skillMd = `---
name: Astrologics Screenplay
description: Turns chart facts into a screenplay spine
requires:
  mcp: ["astrologics"]
  tools: ["compute_natal_chart", "compute_transits", "generate_reading"]
---
# Body
`;

describe("skill requirements parsing", () => {
  it("parses mcp + tools from SKILL.md frontmatter", () => {
    const requirements = parseSkillRequirements(skillMd, null);
    expect(requirements).toEqual({
      mcp: ["astrologics"],
      tools: ["compute_natal_chart", "compute_transits", "generate_reading"],
    });
    expect(hasSkillRequirements(requirements)).toBe(true);
  });

  it("falls back to metadata.requirements and dedupes", () => {
    const requirements = parseSkillRequirements(null, {
      requirements: {
        mcp: ["astrologics", " astrologics ", ""],
        optionalTools: ["compute_transit_timeline"],
      },
    });
    expect(requirements).toEqual({
      mcp: ["astrologics"],
      optionalTools: ["compute_transit_timeline"],
    });
  });

  it("returns empty requirements for skills without a requires block", () => {
    expect(parseSkillRequirements("# Just a skill\n", {})).toEqual({});
    expect(hasSkillRequirements({})).toBe(false);
  });
});

const astroSkill = {
  key: "paperclipai/paperclip/astrologics-screenplay",
  name: "Astrologics Screenplay",
  requirements: {
    mcp: ["astrologics"],
    tools: ["compute_natal_chart", "compute_transits", "generate_reading"],
  },
};

describe("skill preflight evaluation", () => {
  it("passes when the provider and tools are bound", () => {
    const result = evaluateSkillPreflight({
      skills: [astroSkill],
      mcpServers: ["astrologics"],
      toolInventory: {
        astrologics: ["compute_natal_chart", "compute_transits", "generate_reading"],
      },
    });
    expect(result.ok).toBe(true);
    expect(result.issues).toEqual([]);
    expect(result.checkedSkills).toEqual([astroSkill.key]);
  });

  it("blocks when the MCP provider is not bound", () => {
    const result = evaluateSkillPreflight({
      skills: [astroSkill],
      mcpServers: [],
      toolInventory: null,
    });
    expect(result.ok).toBe(false);
    expect(result.issues[0]).toMatchObject({
      kind: "missing_mcp_provider",
      expected: "astrologics",
      severity: "error",
    });
  });

  it("blocks with the exact missing tool when inventory is known", () => {
    const result = evaluateSkillPreflight({
      skills: [astroSkill],
      mcpServers: ["astrologics"],
      toolInventory: {
        astrologics: ["compute_natal_chart", "generate_reading"],
      },
    });
    expect(result.ok).toBe(false);
    expect(result.issues).toContainEqual(
      expect.objectContaining({
        kind: "missing_tool",
        expected: "compute_transits",
        severity: "error",
      }),
    );
  });

  it("warns instead of failing when inventory is unknown", () => {
    const result = evaluateSkillPreflight({
      skills: [astroSkill],
      mcpServers: ["astrologics"],
      toolInventory: null,
    });
    expect(result.ok).toBe(true);
    expect(result.issues[0]).toMatchObject({ kind: "unknown_inventory", severity: "warning" });
  });

  it("passes skills that declare no requirements", () => {
    const result = evaluateSkillPreflight({
      skills: [{ key: "caveman", name: "Caveman", requirements: {} }],
      mcpServers: [],
      toolInventory: null,
    });
    expect(result.ok).toBe(true);
    expect(result.issues).toEqual([]);
  });
});
