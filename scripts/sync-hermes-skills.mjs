import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Refresh the vendored Hermes skill libraries in this repo.
 *
 * Usage:
 *   node scripts/sync-hermes-skills.mjs [path-to-Mithuna-Agent]
 *
 * Defaults to ../Mithuna-Agent (sibling checkout after the monorepo split).
 * Copies:
 *   <agent>/skills           -> hermes-skills/
 *   <agent>/optional-skills  -> hermes-optional-skills/
 */
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const agentRoot = path.resolve(process.argv[2] ?? process.env.HERMES_AGENT_ROOT ?? path.join(repoRoot, "..", "Mithuna-Agent"));

const EXCLUDED_DIRS = new Set([
  ".git",
  "node_modules",
  "index-cache",
  "__pycache__",
  ".venv",
  ".pytest_cache",
]);
const EXCLUDED_EXTENSIONS = new Set([".pyc", ".pyo"]);

function shouldCopy(source) {
  const base = path.basename(source);
  if (EXCLUDED_DIRS.has(base)) return false;
  if (EXCLUDED_EXTENSIONS.has(path.extname(base).toLowerCase())) return false;
  if (base === ".DS_Store" || base === "Thumbs.db") return false;
  return true;
}

async function countSkillManifests(root) {
  let count = 0;
  for (const entry of await fs.readdir(root, { withFileTypes: true })) {
    if (EXCLUDED_DIRS.has(entry.name)) continue;
    const absolute = path.join(root, entry.name);
    if (entry.isDirectory()) count += await countSkillManifests(absolute);
    else if (entry.isFile() && entry.name.toLowerCase() === "skill.md") count += 1;
  }
  return count;
}

const libraries = [
  { source: path.join(agentRoot, "skills"), target: path.join(repoRoot, "hermes-skills") },
  { source: path.join(agentRoot, "optional-skills"), target: path.join(repoRoot, "hermes-optional-skills") },
];

for (const { source, target } of libraries) {
  const stat = await fs.stat(source).catch(() => null);
  if (!stat?.isDirectory()) {
    console.error(`skip: ${source} does not exist`);
    continue;
  }
  await fs.rm(target, { recursive: true, force: true });
  await fs.mkdir(target, { recursive: true });
  await fs.cp(source, target, { recursive: true, filter: shouldCopy });
  const skills = await countSkillManifests(target);
  console.log(`${path.basename(target)}: ${skills} skills from ${source}`);
}
