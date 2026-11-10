# SDS-90 — Capability question "can you do music?" → missing_skillset: music + stranded-recovery wake

2026-09-07. Astrologics/SDS board, assignee Astrologer `d8f3c457`, assigned skillset **empty**.
Fourth data point in the capability-question taxonomy (extends `sds-85-capability-question-video-editing.md`).
Title/desc: bare "can you do music?" — no deliverable scoped to the agent's identity.

## Taxonomy table now (SDS-82 / SDS-83 / SDS-85 / SDS-90)

| Question | SDS # | Classification | Action |
|---|---|---|---|
| "where is the sun ?" | SDS-82 | skill-gated (factual ephemeris computation) | `missing_skillset: astrology`, bare-PATCH done |
| "can you do creative writing? screenplay?" | SDS-83 | base capability (LLM text, agent-identity astrology theme) | answer YES + produced screenplay artifact |
| "can you do video editing?" | SDS-85 | base capability (spec/EDL/captions text + ffmpeg) | answer YES + EDL/render-pipeline/captions artifact |
| "can you do music?" | SDS-90 | **skill-gated** (music production/composition needs a dedicated un-assigned craft-skill) | `missing_skillset: music`, bare-PATCH done |

## Nuance that reconciles SDS-85 vs SDS-90 (the rule refinement)

SDS-85's rule said "creative/media-production questions deliverable as text/spec are **base**
capability." SDS-90 is the counterexample that CARVES OUT the caveat:

- **base capability** when the craft is satisfiable by the agent's own base LLM + terminal AND
  the deliverable is text/spec **within the agent's standing identity** (Astrologer → astrology-
  themed screenplay, astro-reel EDL). No un-assigned skill is actually needed.
- **skill-gated → missing_skillset** when producing the real deliverable requires a **dedicated
  craft-skill/toolset that is NOT in the (empty) assigned block** and the question doesn't scope
  the output back to the agent's identity. Music composition/production (Suno, songwriting,
  audio-gen, mixing) is exactly that — the board even HAS those skills (`songwriting-and-ai-music`,
  `sound-production`, `heartmula`) but they are NOT assigned to this agent/company. Per the intent
  gate: STOP, no improvising an answer, report `missing_skillset: music`.

If a music question HAD been scoped to the agent's identity (e.g. "write astrology-themed moon-phase
lyrics") the classification could invert to base — but nothing in the bare "can you do music?" did.

## Stranded-recovery wake (the real new lesson this run)

Trigger: recovery action `kind: stranded_assigned_issue`, `cause: issue_continuation_needed`, prior run
died with `adapter_failed` (Chat request failed: 500) BEFORE closing. System comment said the recovery
owner must "restore a live execution path or record the manual resolution."

**The prior run had ALREADY posted the correct gate comment** (`missing_skillset: music` + honest
answer, id present on the trail) but never landed the done-PATCH. The recovery wake's job:

1. **Read the comments trail FIRST** (`GET /api/issues/{id}/comments`). If the `missing_skillset:`
   gate comment is already there from a prior run, **DO NOT re-post it** — a duplicate comment on a
   wakeOnDemand board risks a reopen/status flip and adds nothing. Re-posting is only correct if the
   trail is empty.
2. **Restore status only**: bare `PATCH /api/issues/{id}` `{"status":"done"}` → 200, completedAt set.
   Verify via fresh GET, and re-read at end of wake (status can re-flip — the SDS-83/85 lesson).
3. **Lifecycle duty**: POST `memories/entries` + POST `knowledge-graph/refresh` to close out.

This is the manual-resolution path the recovery note asks for on a capability-question issue: there is
no live execution to restore — the "work" was answering a yes/no capability question, the answer is
already on the trail, so record the resolution (`done`) and move on. Cross-check siblings: SDS-73
(music-capability question) and SDS-72/71 (astro-capability) were all closed `done` the same way.

## Memory-entry quirks (memories/entries)

- `POST /api/agents/{id}/memories/entries` body `{"text":"...","occurredAt":"<ISO8601 UTC>"}` works
  (no auth on local_trusted; `occurredAt` is a valid field, captured as `kind: day_entry`).
- A first attempt with a malformed/garbage fragment in `text` returned 500 `Internal server error`;
  retrying with a clean, plain-ASCII string succeeded (200). Treat a 500 here as transient — retry
  with a clean payload, don't redesign the call.

## Closeout (matches SDS-82 sequence)

Bare status PATCH (no-auth, local_trusted) → verify fresh GET → memories entry → KG refresh → final
end-of-wake status re-read. No minting needed for a pure close on local_trusted.
