# SDS-85 — Capability question: "CAN YOU DO VIDEO EDITING ?"

Pattern this session confirmed: a capability question whose deliverable is text/spec is **base capability** → answer YES and prove it with a produced work product (never just promise). Fourth data point in the taxonomy: SDS-90 (music) is the skill-gated counterexample — see below.

## Capability-question taxonomy (SDS-82 / SDS-83 / SDS-85 / SDS-90)

| Question | Classification | Action taken |
|---|---|---|
| "where is the sun ?" (SDS-82) | skill-gated (astrology/astronomy computation) | post `missing_skillset: astrology`, bare-PATCH done |
| "can you do creative writing? like a screenplay?" (SDS-83) | base capability (LLM text production) | answer YES + produced screenplay artifact |
| "CAN YOU DO VIDEO EDITING ?" (SDS-85) | base capability (editorial deliverables + ffmpeg via terminal) | answer YES + produced EDL/render-pipeline/captions artifact |
| "can you do music?" (SDS-90) | **skill-gated** (music production needs a dedicated un-assigned craft-skill) | post `missing_skillset: music`, bare-PATCH done |

Rule (with the SDS-90 caveat): creative/media-production questions deliverable as text/spec **within
the agent's standing identity** (astrology-themed screenplay, astro-reel EDL) are base capability — no
missing_skillset. But when producing the real deliverable needs a dedicated craft-skill/toolset NOT in
the (empty) assigned block AND the question isn't scoped back to the agent's identity, gate STOP →
`missing_skillset`. See `sds-90-missing-skillset-music-recovery.md` (also: stranded-recovery wake on a
missing_skillset issue — check the comments trail first, don't re-post an already-posted gate comment,
just restore `done`).

## Delivery pattern for video-editing capability questions
Answer YES with honest scope: editorial/creative editing, EDLs, captions, graphics specs, automated render pipelines — and a rendered MP4 if footage is supplied (no GUI NLE on the box; ffmpeg via terminal).
Artifact structure that worked (`sds-85-video-editing-edl.md`):
1. Short direct answer + honest scope line
2. Capability menu table (cut/trim, pacing, transitions, captions, graphics, format, audio loudness, packaging, rendered output)
3. Concrete EDL grounded in existing series work — tie to the prior locked episode (SDS-83 EP1: 60 s, 9:16, timing 3+7+8+20+10+12, current-event slot at 10–18 s with verified ephemeris facts)
4. Real executable ffmpeg commands (normalize → xfade/concat assembly → loudnorm → subtitle burn-in)
5. Complete .srt caption file
6. Handoff ask (what inputs are needed: footage/VO/music)

## API facts confirmed this session
- `POST /api/issues/{id}/comments` requires JSON `{"body": "..."}` — sending `{"content": ...}` returns 400 `Validation error ... path ["body"]`. Probe with a tiny dummy body first when the contract is unknown.
- Bare `PATCH /api/issues/{id}` `{"status":"done"}` works on local_trusted (no auth).
- Large markdown payloads: build JSON with python (`json.dump` to a file) then `curl --data-binary @file` — avoids shell-quoting and secret-redaction mangling of long bodies.

## Status flip nuance (extends the SDS-83 cross-wake lesson)
On SDS-85 the issue flipped back to `in_progress` **within the same wake** — minutes after a confirmed done-PATCH (completedAt cleared), no new comments, no user action. Previously only seen across wakes (SDS-83). Remedy: bare-PATCH done again + verify the response field, and do a **final end-of-wake re-read** of status after every other closeout step (KG update, refresh). Never trust an earlier PATCH if the last read shows in_progress.