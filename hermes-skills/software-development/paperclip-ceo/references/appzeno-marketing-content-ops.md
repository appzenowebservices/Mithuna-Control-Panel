# AppZeno Marketing & Content Operations

Company-specific context for content/marketing board tasks (AppZeno, prefix XXX).

## Marketing team

- **CMO** — `92dca494-8b7b-4354-94b0-88b76bea51dd` (role `cmo`, reports to CEO, hermes_http).
- **Growth Marketer** — `b9df7adc-a3df-4cfb-92bb-11672ade2f9a` (reports to CMO, hermes_http, budget 2000 cents/mo).
- Both idle-capable; the CEO reassigns marketing issues between them freely. Wakes addressed to "CMO" may arrive after the issue was reassigned to Growth Marketer — either way, execute as the marketing owner.

## Marketing Content project

- Project `2a51c2f8-d370-4567-ba17-fdaa393ab448` — "Marketing Content" (planned), owned by the Marketing team.
- XXX-63 "write the first blog" → done 2026-08-11 (first post published).
- XXX-73 "Review and promote the first blog (marketing pass)" — follow-up that reviews/promotes the published post; keep it actionable by citing the post path in the disposition.

## Publishing surface — there is NO blog page

- Project "Add a new blog page" (`c6cc4316-62b2-4a57-be9e-cd27adc85c57`) was CANCELLED — no blog UI exists in Mithuna (3D board, port 3000) or the Paperclip control plane (no `/blog` routes; grep hits like `jobLog` are false positives).
- Content issues therefore "publish" as **committed markdown artifacts** in the AppZeno monorepo (`D:\Dev\agent`), matching prior deliverables: `README.md` (XXX-61), `test.md` (XXX-8), `test-blog.txt` (XXX-10).
- Blog home convention: repo-root `blog/` directory — post as `blog/YYYY-MM-DD-<slug>.md`, plus `blog/README.md` index table. Wiring the page into Mithuna is engineering scope (separate issue), NOT part of content issues.

## Publish recipe (verified XXX-63, 2026-08-11)

1. Write the post (ground content in real repo/board facts — three pillars, goal, org).
2. Write/update `blog/README.md` index (date | title | link table).
3. Narrow commit: `git add blog/ && git commit -m "blog: ..." -- blog/` — the monorepo has constant unrelated dirty state (hermes-agent, paperclip); never sweep it in.
4. Verify: `git log --oneline -1 -- blog/` shows the commit; `git status --short blog/` clean.
5. Close the issue: `PATCH /api/issues/<uuid> {"status":"done","comment":"..."}` citing file paths, byte counts, commit SHA; confirm `completedAt` on follow-up GET.

First post: `blog/2026-08-11-introducing-appzeno.md` (4,126 bytes), commit `d280a9ef` "blog: publish first AppZeno blog post (introducing AppZeno)".

## Promotion assets (verified XXX-73, 2026-08-11)

The marketing pass ("review + promote") publishes a companion announcement file
as its own narrow commit: `blog/YYYY-MM-DD-launch-announcement.md`. Convention
from `blog/2026-08-11-launch-announcement.md` (2,757 bytes, commit `4b1f2473`
"blog: add CMO launch announcement copy for first AppZeno post (XXX-73)"):
sections = one-liner, LinkedIn / company announcement, X / social thread
(numbered 1/N), email / outreach blurb (with [name] placeholder), pointer to the
post path. Same narrow-commit + `git log`/`git status` verification as the post
itself. The review verdict goes on the PARENT issue (XXX-63), not the promotion
issue — that keeps the blog trail on the publish issue.

## Company facts for content

- AppZeno = autonomous AI-agent company that lands and delivers client web/mobile projects profitably. Goal `5e07189b-8d0e-496f-a194-5de4a3c08305`.
- Three pillars: **Paperclip** (control plane, port 3100, Express 5 + TS + Drizzle + Postgres — agents/issues/runs/scheduler/adapters), **hermes-agent** (executor, port 8765, Python FastAPI — conversation loop, tools, skills, terminal), **Mithuna** (body/face, port 3000, Vite + React 18 + Three.js R3F — 3D board UI, visualization only).
- Org: CEO (babac997) → CTO (a7e18461) + CMO; heartbeat scheduler wakes agents on assigned issues; every issue traces to the goal.

## Official client intake channel (DEFINED + VERIFIED, XXX-84, 2026-08-11)

- **Channel: open an intake issue on the AppZeno board — `http://127.0.0.1:3100`.** The brief (what/for-whom/when) becomes a goal-linked lead issue and enters the intake pipeline (qualification → scoping) within one business day.
- Why this channel: it is the ONLY externally reachable mechanism that actually receives messages in the current environment — no public domain/MX records, GitHub org `appzenowebservices` is fully private (org page 200, repo 404 anon, no public email/website), no form URL exists.
- Verified end-to-end: a real test brief posted via the board intake path landed as XXX-94 with content intact (then cancelled, audit trail kept). Docs: `docs/client-service-offering.md` Reach out step (commit `312d0f0f`, TBD + REVIEW NOTE removed), `docs/client-delivery-capability.md` Stage 1.
- Related issues: XXX-84 (canonical, closed done 17:05:45Z), XXX-85 (parallel-wake duplicate, closed cancelled 17:06:49Z), XXX-80 (Growth Marketer, broader acquisition-landing scope).

## Non-blog marketing deliverables (intro pitch / one-pagers) — verified XXX-77, 2026-08-11

- **User asks on the standing Board Operations issue (XXX-12) are answered THERE.** The user watches XXX-12; a deliverable posted only on a closed content issue is invisible. Post the full answer as a comment on XXX-12 and point at the repo artifact.
- **Reusable pitch deliverable shape:** repo artifact `docs/appzeno-intro-pitch.md` (narrow commit `git add docs/<file> && git commit -m "docs: ..." -- docs/<file>`, verify via `git log --oneline -1` + clean `git status --short`), plus the answer comment on XXX-12. Pitch structure that satisfied the ask: company description/mission line + core 1-2 paragraph pitch + one-liner + audience-tailored variants (investors / customers / recruits), grounded in goal facts and the three pillars.
- **Company description / mission line lives on the company profile:** `PATCH /api/companies/{CID}` with `{"description": "..."}` (updateCompanySchema = createCompanySchema.partial, description optional nullable). AppZeno's was `null` until XXX-77 set it — the description the profile shows is now the mission line from `docs/appzeno-intro-pitch.md`.
- **Predecessor-issue check:** if the ask was previously issued and closed with zero comments (XXX-76 `done`, succeeded run, nothing posted), the re-ask is the real delivery — verify the predecessor posted nothing, deliver, and note the no-op in the disposition.
