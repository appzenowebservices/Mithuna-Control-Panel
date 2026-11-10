# Vendored Hermes Skill Libraries

The panel image ships two snapshots of the Hermes agent skill library so the
company skill catalog is populated without any external checkout:

| Repo directory | Source | Skills |
| --- | --- | --- |
| `hermes-skills/` | `Mithuna-Agent/skills` | 93 |
| `hermes-optional-skills/` | `Mithuna-Agent/optional-skills` | 101 |

Both are `category/skill/SKILL.md` trees. The panel baseline `skills/` (15
paperclip skills) is still scanned first; Hermes entries win slug collisions.

## Why these exist

Before the monorepo split this fork loaded them from
`<repo>/../../hermes-agent/skills`. After Paperclip, Hermes (`Mithuna-Agent`),
and the 3D app were separated into sibling checkouts, that path stopped
existing and the catalog silently collapsed to the 15 baseline skills. Vendoring
keeps the Docker image self-contained: `COPY . .` in the build stage picks these
directories up, so a plain `docker compose up -d --build` restores the catalog.

## Refreshing the snapshot

```sh
# from the repo root; defaults to ../Mithuna-Agent
node scripts/sync-hermes-skills.mjs [path-to-Mithuna-Agent]
```

The script replaces both directories (excluding `.git`, `node_modules`,
`index-cache`, `__pycache__`, virtualenvs, `.pyc`) and prints the skill counts.

## Loader order

`server/src/services/skills-roots.ts` resolves the roots; see AGENTS.md
"Bundled Skills Roots" for the full ordered list, including the
`PAPERCLIP_SKILLS_ROOTS` override.
