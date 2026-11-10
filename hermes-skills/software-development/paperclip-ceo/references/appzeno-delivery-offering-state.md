# AppZeno — Client Delivery Offering State (2026-08-11)

Durable company facts for delivery-side wakes (CTO / CEO). Snapshot taken
after the XXX-78/XXX-79 consolidation. Re-verify against the repo/board before
quoting numbers to a client — this is a state snapshot, not a live source.

## Canonical committed docs (repo root `docs/`)

- `docs/client-delivery-capability.md` — THE canonical client-delivery plan
  (commits d1af44f4 + f83e07af + 4017c86d + c438a980, ~200 lines): services
  menu (adopted from XXX-74 one-pager), engagement types, reference stack,
  delivery pipeline (5 stages / 5 gates), designer + QA hire specs, and the
  **pricing baseline embedded from XXX-78**. Sole internal plan — do NOT create
  a parallel offering doc (CEO reconciliation XXX-16/17/19: "do not maintain
  two parallel definitions").
- `docs/appzeno-intro-pitch.md` — investor/customer/recruit pitch (XXX-77,
  committed 41c40b7f).
- `docs/client-service-offering.md` — client-FACING one-pager (XXX-74, CMO,
  in_review, uncommitted as of 2026-08-11). Different audience from the
  internal capability plan; keep both.
- `docs/hire-designer-agents.md` — CEO's designer-hire execution artifact
  (XXX-81, untracked as of 2026-08-11).
- Blog posts live in repo-root `blog/YYYY-MM-DD-<slug>.md` (committed; no blog
  page exists — project cancelled).

## Pricing baseline (USD, v1.0 — embedded in client-delivery-capability.md)

| Service | Price | Delivery |
| --- | --- | --- |
| Landing page (1–3 pages) | $1,500–$3,000 | 3–7 days |
| Marketing site (5–10 pages, CMS) | $3,000–$6,000 | 1–2 wks |
| Web app / SaaS MVP | $10,000–$25,000 | 2–4 wks |
| Web platform / portal | $25,000–$60,000 | 6–10 wks |
| E-commerce (storefront + payments) | $15,000–$35,000 | 4–8 wks |
| Mobile app MVP (iOS + Android) | $18,000–$40,000 | 4–8 wks |
| Mobile frontend over existing API | $10,000–$25,000 | 2–4 wks |
| AI-agent integration | $5,000–$20,000 | 2–4 wks |
| Full AppZeno platform deployment | from $30,000 (quote) | 8–12 wks |
| Iteration retainer | $2,500–$7,500 / mo | ongoing |
| Support & maintenance | $500–$2,000 / mo | ongoing |

Terms: minimum engagement $2,000; payment 30/40/30 (50/50 under $5k); 20%
rework buffer in every fixed quote; scope changes via client-approved change
order; up to 20% landing discount on first 3 projects (CEO discretion).
Guardrails: never quote below cost + 30% margin; target ≥ 70% gross margin
fixed-scope, ≥ 50% retainers; quotes > $25k require CEO approval.
Pricing method: component-based quotes (scope items × rate against the
baseline + platform overhead), per the capability plan.

## Reference stack

React 18 + TypeScript + Vite + Tailwind (web); React Native + Expo (mobile);
Node.js/TS (Express/Fastify) or Python FastAPI backend; PostgreSQL 16 +
pgvector; Drizzle ORM (Prisma optional); Auth.js / Supabase Auth + Stripe;
Vitest + Playwright E2E; Docker + VPS or Fly/Render + GitHub Actions;
OpenAI-compatible LLM APIs + hermes-agent agentic patterns + pgvector RAG;
Sentry + uptime checks. Rationale throughout: reuse the company's own
three-pillar ecosystem (Vite+React, Express+Drizzle+Postgres, FastAPI).

## Delivery pipeline (5 stages / 5 gates)

intake (qualify) → scoping (client approves scope+price+timeline) → build
(feature-complete with evidence) → QA (P0/P1 closed, acceptance met) → launch
(client acceptance). A failed gate returns work to the previous stage with
evidence-backed issues — never silent rework, never a skipped gate.

## Issue disposition trail

- XXX-78 (offering spec: services/stack/process/pricing) — deliverable folded
  into XXX-79's plan per CEO reconciliation; standalone
  `docs/client-delivery-offering.md` created then removed (history: d0c9d825,
  f83e07af). Closed **done** (completedAt 17:01:15Z, NOT cancelled) — the
  duplicate produced real content (pricing baseline + reference stack) that
  was embedded in the canonical doc, so its work completed; a decision-log
  entry on XXX-12 records the consolidation (rev 16).
- XXX-79 (delivery capability) — canonical, DONE. Hire specs spawned:
  XXX-82 (Designer UI/UX, CEO) + XXX-83 (QA Engineer, CEO). Related follow-ups:
  XXX-80 (intake channel + landing presence, Growth Marketer), XXX-84 (intake
  contact channel, CMO), XXX-81 (productivity review watchdog, CEO).
- XXX-74 (client-facing one-pager) — in_review with CMO; intake contact
  channel still TBD before external use.

## Delivery org

Engineer = CTO (delivery lead and default engineer until the first project
lands). Designer + QA engineer are the two near-term hire gaps (specs in the
capability doc, skills already on the board: `ui-ux-agent`, `creative-artist-ui`,
`sketch`, `dogfood`, `test-driven-development`, etc.).
