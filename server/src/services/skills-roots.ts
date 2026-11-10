import path from "node:path";
import { fileURLToPath } from "node:url";

export const SKILLS_ROOTS_ENV = "PAPERCLIP_SKILLS_ROOTS";

/**
 * Ordered repo-relative roots that are always scanned for bundled skills.
 * Resolution is anchored to the module directory, which is the same depth in
 * the TypeScript source tree (server/src/services) and the compiled tree
 * (server/dist/services), so both dev and the container image resolve to
 * <repo>/....
 */
const BUNDLED_SKILLS_ROOTS = [
  "../../skills",
  "../../../skills",
  // Vendored Hermes agent libraries. Optional comes first so the core
  // library wins slug collisions (last root wins).
  "../../../hermes-optional-skills",
  "../../../hermes-skills",
  // Legacy sibling checkout from the pre-split monorepo layout.
  "../../../../hermes-agent/skills",
];

/**
 * Split a PAPERCLIP_SKILLS_ROOTS value into individual paths.
 * Accepts the platform path delimiter plus semicolons/newlines everywhere,
 * so a Linux-style value pasted into a Windows shell still parses.
 */
export function splitSkillRootsEnv(raw: string | undefined | null): string[] {
  if (!raw) return [];
  const separators = process.platform === "win32" ? /[;\r\n]+/ : /[:;\r\n]+/;
  return raw
    .split(separators)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

/**
 * Resolve the ordered skill roots used to import bundled skills.
 *
 * Precedence is "last root wins" for duplicate skill keys:
 *   1. paperclip baseline skills (repo + cwd)
 *   2. vendored Hermes optional + core libraries
 *   3. legacy sibling hermes-agent checkout (dev machines)
 *   4. PAPERCLIP_SKILLS_ROOTS entries (operator overrides / bind mounts)
 */
export function resolveBundledSkillsRoot(
  env: NodeJS.ProcessEnv = process.env,
  moduleDir: string = path.dirname(fileURLToPath(import.meta.url)),
  cwd: string = process.cwd(),
): string[] {
  const roots = BUNDLED_SKILLS_ROOTS.map((relative) => path.resolve(moduleDir, relative));
  roots.splice(1, 0, path.resolve(cwd, "skills"));
  for (const extra of splitSkillRootsEnv(env[SKILLS_ROOTS_ENV])) {
    roots.push(path.resolve(extra));
  }
  // Same directory can be reached through several candidates (repo, cwd, env).
  // Scan each once, keeping first-seen precedence order.
  return Array.from(new Set(roots));
}
