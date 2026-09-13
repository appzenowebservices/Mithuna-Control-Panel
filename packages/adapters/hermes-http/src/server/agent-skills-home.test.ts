import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import fs from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ensureAgentSkillLinks, resolveAgentSkillsHome } from "./index.js";

describe("resolveAgentSkillsHome", () => {
  it("returns the shared home without an agent id", () => {
    const home = resolveAgentSkillsHome();
    expect(home).toMatch(/\.hermes.skills$/);
    expect(resolveAgentSkillsHome("")).toBe(home);
  });

  it("scopes to a per-agent subdirectory for valid ids", () => {
    const home = resolveAgentSkillsHome("d8f3c457-3fe7-4b24-adc3-44f37b97ed86");
    expect(home).toMatch(/\.hermes.skills.@d8f3c457-3fe7-4b24-adc3-44f37b97ed86$/);
  });

  it("rejects traversal and shape-shifting ids", () => {
    const home = resolveAgentSkillsHome();
    expect(resolveAgentSkillsHome("../evil")).toBe(home);
    expect(resolveAgentSkillsHome("a/b")).toBe(home);
    expect(resolveAgentSkillsHome("@x")).toBe(home);
  });
});

describe("ensureAgentSkillLinks", () => {
  let tmpHome = "";
  let agentId = "test-agent-1";

  function useTempHome() {
    tmpHome = mkdtempSync(path.join(tmpdir(), "htag-"));
    vi.stubEnv("HOME", tmpHome);
  }

  function makeSource(skill: string): string {
    const dir = path.join(tmpHome, "sources", skill);
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, "SKILL.md"), `# ${skill}\n`);
    return dir;
  }

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("is a no-op for invalid agent ids without calling the loader", async () => {
    useTempHome();
    const loader = vi.fn(async () => []);
    await ensureAgentSkillLinks("../evil", ["foo"], loader);
    expect(loader).not.toHaveBeenCalled();
  });

  it("links only assigned skills and skips reload when unchanged", async () => {
    useTempHome();
    const entries = [
      { key: "paperclipai/paperclip/alpha", runtimeName: "alpha", source: makeSource("alpha") },
      { key: "paperclipai/paperclip/beta", runtimeName: "beta", source: makeSource("beta") },
    ];
    const loader = vi.fn(async () => entries);
    await ensureAgentSkillLinks(agentId, ["paperclipai/paperclip/alpha"], loader);
    expect(loader).toHaveBeenCalledTimes(1);
    const home = resolveAgentSkillsHome(agentId);
    expect(await fs.readlink(path.join(home, "alpha"))).toBe(entries[0]!.source);
    await expect(fs.lstat(path.join(home, "beta"))).rejects.toThrow();
    // steady state: manifest match → loader not called again
    await ensureAgentSkillLinks(agentId, ["alpha"], loader);
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it("prunes revoked symlinks but keeps foreign files", async () => {
    useTempHome();
    const entries = [
      { key: "paperclipai/paperclip/alpha", runtimeName: "alpha", source: makeSource("alpha") },
    ];
    const loader = vi.fn(async () => entries);
    await ensureAgentSkillLinks(agentId, ["alpha"], loader);
    const home = resolveAgentSkillsHome(agentId);
    await fs.writeFile(path.join(home, "notes.txt"), "keep me");
    // revoke: empty assignment prunes the link, keeps the foreign file + manifest
    await ensureAgentSkillLinks(agentId, [], loader);
    await expect(fs.lstat(path.join(home, "alpha"))).rejects.toThrow();
    expect(await fs.readFile(path.join(home, "notes.txt"), "utf8")).toBe("keep me");
  });
});
