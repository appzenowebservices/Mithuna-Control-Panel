---
name: npm-build-troubleshooting
description: "Fix npm install/build failures that only reproduce in fresh environments (ERESOLVE, missing-module on build, gitignore-swallowed source, untracked lockfiles)."
version: 1.0.0
author: Hermes Agent
license: MIT
platforms: [windows, macos, linux]
metadata:
  hermes:
    house: 2
    domains: ["npm build fails", "build error", "dependency conflict", "package install"]
    tags: [npm, node, build, vite, dependencies, gitignore, troubleshooting]
    category: software-development
    related_skills: [systematic-debugging, board-ops]
---

# npm Build Troubleshooting

Diagnose and fix `npm run build` / `npm install` failures, especially the
class where **the build works in the local working tree but the user reports
it broken** ("npm run build not working"). The local success is almost always
stale `node_modules` masking breakage — the bug lives in the committed state.

## When to Use

- Issue/wake says "npm run build not working" or "fix the build error".
- A fresh `npm install` fails with `ERESOLVE`, ENOSPC, or peer conflicts.
- `npm run build` fails with `Could not resolve "<path>"` on a module that
  exists in the working tree.

## Core Rule: Reproduce From the Committed State

NEVER trust the local working tree's `node_modules` — it was installed on
some past date when different versions were current. Reproduce what a fresh
clone gets:

```bash
# Extract ONLY the committed state of the project (no working-tree extras):
git archive HEAD <project-dir> | tar -x -C /tmp/fresh-test  # then move contents up
cd /tmp/fresh-test && npm install --no-audit --no-fund && npm run build
```

If the fresh install/build fails but the working tree builds → the bug is in
the committed state, and the working tree's `node_modules` is the reason the
local build "works". Always run the final verification in BOTH the clean
clone and the real repo.

## Diagnostic Checklist (known root-cause classes)

Run these in order — each is a distinct class of "build works locally, fails
fresh". **Step 0 first when the task arrives from an issue tracker** (wake
with a run feed full of infra failures): the complete fix may already be
APPLIED but uncommitted in the working tree — a prior run edited everything
then died before `git commit`. Run `git status`; if the tree is dirty with
fix-looking changes, diff + build them before redoing any work
(XXX-102, 2026-08-15: 42 modified files, builds already green, job was
verify-and-commit only). A sibling run may commit mid-session — reflog shows
it; narrow-commit your delta and re-verify the combined state:

1. **Lockfile not committed → unreproducible installs.** `git ls-files
   --error-unmatch package-lock.json` errors → lockfile untracked. Fresh
   installs then float `^` ranges and can resolve incompatible versions.
   Fix: commit the lockfile (gitignore negation works:
   `package-lock.json` then `!<project>/package-lock.json` — but the negation
   must come AFTER the ignore rule).
2. **Caret-range drift → ERESOLVE on fresh install.** `npm install` dies with
   `ERESOLVE unable to resolve dependency tree` / `peer ... from ...`. A
   library's NEWEST minor in the declared range now requires a peer major the
   app doesn't use (e.g. drei `^10.7.7` resolving to 10.7.8 which peers
   `@react-three/fiber@^9` while the app uses fiber 8). Check the compat
   matrix with `npm view <pkg>@<ver> peerDependencies --json` and pin the
   range to the major whose peers match the app's actual versions.
3. **Unanchored `.gitignore` rule swallows source dirs.** Patterns without a
   leading slash (`data/`, `build/`, `dist/`) match at ANY depth — a root
   rule meant for a top-level dir silently excludes `src/data/` etc. Symptom:
   `Could not resolve "../../data/<file>"` on a clean build while the file
   exists locally. Detect: `git check-ignore -v <path>`; fix: anchor the rule
   to `/data/` and `git add` the swallowed file.
4. **Source files exist on disk but never committed.** Cross-check:
   `for f in $(find src -type f); do git ls-files --error-unmatch "$f" || echo "UNTRACKED: $f"; done`
   — catches any file excluded by any ignore rule.
5. **CI-mode warnings-as-errors (CRA/react-scripts).** `npm run build`
   passes locally but fails on Vercel/GH Actions/Docker-with-CI: CI servers
   set `CI=true`, and react-scripts then treats every eslint WARNING as an
   error (`Failed to compile. [eslint] ... Treating warnings as errors because
   process.env.CI = true`). Template-generated pages carry hundreds of
   `no-unused-vars` + a few `react-hooks/exhaustive-deps`. Reproduce with
   `CI=true npm run build > /tmp/b.log 2>&1; echo $?`, then parse the log
   (file:line sections) with a script to enumerate every file + warning.
   Fix: clean the warnings — see "Unused-code cleanup" below.
6. **Stale framework-migration config.** Repo migrated (e.g. Next.js → CRA)
   but deploy config still targets the old framework: Dockerfile copies
   `.next` (CRA emits `build/` → `docker compose build` hard-fails at COPY),
   `eslint.config.js` extends `next/core-web-vitals` (inert for CRA, which
   uses package.json `eslintConfig`), dead `prisma/` + `npx prisma generate`.
   Confirm dead code before deleting: `grep -rn "@prisma/client" src/ server/`
   (no hits → safe to drop) and check Dockerfile COPY paths against the real
   build output dir. Also fix the runtime: an express API server that never
   serves the SPA needs `express.static(build)` + an SPA fallback route
   registered AFTER the API routes (regex `/^\/(?!api(?:\/|$)).*/` keeps
   `/api/*` on the API layer and 404s unknown API paths).

## Environment Pitfalls (fixes, not blockers)

- **esbuild `The service was stopped: write EPIPE`** — transient crash of the
  esbuild service (often under memory/disk pressure). RETRY the build; it
  typically passes on the second run.
- **ENOSPC during `npm install`** — disk full. Redirect the cache to another
  drive: `npm install --cache /d/Dev/.npm-cache`. A 100%-full C: drive also
  causes intermittent build crashes (temp/pagefile) — flag it to the user,
  don't fight it.
- **Fresh clone + `git archive`**: the extracted tree has no `.gitignore`
  untracked extras and no node_modules — exactly what the user's fresh clone
  sees. Remember `mkdir -p` the nested dirs before copying files into place
  when the archive lands files at `<dir>/...` paths.
- **Terminal cwd ≠ repo path (Windows)**: the terminal session can start in a
  DIFFERENT directory than the repo under repair — in one case it was a
  non-git duplicate copy (`/d/Dev/appzeno-origin-test`) while the real repo
  sat at `D:/Dev/appZeno/appZeno-web`. `pwd` + `git status` (fatal: not a git
  repository) exposes the mismatch. Verify before editing, and when delegating
  cleanup to subagents, give them the exact path AND warn them about the
  duplicate-copy trap.
- **MSYS `/tmp` vs Windows Python**: files written to `/tmp/...` in git-bash
  are invisible to a Windows `python` process (e.g. the execute_code sandbox)
  — resolve the real path with `cygpath -w /tmp/file` or copy the file into
  the repo. Also, bash heredocs feeding python mangle backslashes
  (`unterminated string literal`); write the script to a file instead.

## Unused-code cleanup (CRA warnings-as-errors fix)

- **Preserve side effects**: `const _response = await fetch(...)` flagged as
  unused — drop only the binding: `await fetch(...);`. The call submits
  forms / writes cookies; deleting the whole line breaks runtime behavior.
- **exhaustive-deps**: an effect meant to run once on mount (e.g. geolocation
  fetch) must NOT get a plain in-component function added to its deps — the
  effect would re-run every render. Prefer
  `// eslint-disable-next-line react-hooks/exhaustive-deps` above the effect.
  For a useMemo over component-scope derived data, add the derived const to
  the deps (`[query, SECTIONS]`).
- **Verify every removal**: before deleting a symbol, `grep -n Symbol file`
  must show zero remaining usages; after editing, diff-check that no removed
  line contains JSX or logic (`<Component`, `.map(`, `.find(`, `.filter(`).
- **Delegated cleanup → no-undef over-deletion**: parallel subagents doing
  "remove unused imports" occasionally delete an import that IS used → build
  fails with `'X' is not defined (no-undef)`. Run the FULL `CI=true npm run
  build` after delegation and grep the log for `no-undef`. Also: builds run
  WHILE subagents are mid-edit show transient spurious errors in files being
  actively rewritten — don't chase them; wait for the agents to finish, then
  build once.
- **ForkTsChecker crash on Windows** (`Process ... exited with code
  "3221226505"`, "Issues checking service aborted - probably out of memory")
  is a Node/Windows quirk under memory pressure; it does NOT fail the build —
  the warnings do, and only under CI.

## Verification

1. Clean-room clone: `npm install` completes AND `npm run build` exits 0 with
   `✓ built in <t>s` and emitted chunks.
2. Real repo: same build passes after applying the fix + regenerating the
   lockfile.
3. Git state: the fix commit includes package.json (pin), the lockfile (if
   the project tracks one), and any previously-swallowed source files.

## References

- `references/mithuna-build-xxx102.md` — full XXX-102 case: drei 10.x vs
  fiber-8 peer conflict, `data/` gitignore swallowing `src/data/agentic.js`,
  and the clean-room reproduction recipe as executed.
- `references/cra-ci-mode-build-xxx102.md` — full case: CRA app whose local
  build passed but CI build failed (411 eslint warnings as errors), stale
  Next.js→CRA Dockerfile, SPA static-serving fix, and the 3-agent parallel
  cleanup playbook with the no-undef over-deletion pitfall.
