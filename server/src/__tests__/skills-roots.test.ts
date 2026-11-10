import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  resolveBundledSkillsRoot,
  SKILLS_ROOTS_ENV,
  splitSkillRootsEnv,
} from "../services/skills-roots.js";

const moduleDir = path.resolve("/repo/server/dist/services");
const cwd = path.resolve("/repo");

function relativeRoots(roots: string[]) {
  return roots.map((root) => path.relative(moduleDir, root).split(path.sep).join("/"));
}

describe("skills roots", () => {
  it("orders baseline, vendored Hermes libraries, then legacy sibling root", () => {
    expect(relativeRoots(resolveBundledSkillsRoot({}, moduleDir, cwd))).toEqual([
      "../../skills",
      "../../../skills",
      "../../../hermes-optional-skills",
      "../../../hermes-skills",
      "../../../../hermes-agent/skills",
    ]);
  });

  it("appends PAPERCLIP_SKILLS_ROOTS entries last so operator roots win collisions", () => {
    const roots = resolveBundledSkillsRoot(
      { [SKILLS_ROOTS_ENV]: path.resolve("/mounted/hermes-skills") },
      moduleDir,
      cwd,
    );
    expect(roots.at(-1)).toBe(path.resolve("/mounted/hermes-skills"));
  });

  it("splits platform delimiters, semicolons, and newlines", () => {
    const separator = process.platform === "win32" ? ";" : ":";
    expect(
      splitSkillRootsEnv(
        [`/one${separator}/two`, "/three", "  /four  ", "", "/five"].join(";"),
      ),
    ).toEqual(["/one", "/two", "/three", "/four", "/five"]);
  });

  it("ignores empty or unset values", () => {
    expect(splitSkillRootsEnv(undefined)).toEqual([]);
    expect(splitSkillRootsEnv("  ;;  \n ")).toEqual([]);
  });

  it("dedupes an env root that is already a bundled root", () => {
    const bundled = path.resolve(moduleDir, "../../../hermes-skills");
    const roots = resolveBundledSkillsRoot(
      { [SKILLS_ROOTS_ENV]: bundled },
      moduleDir,
      cwd,
    );
    expect(roots.filter((root) => root === bundled)).toHaveLength(1);
  });
});
