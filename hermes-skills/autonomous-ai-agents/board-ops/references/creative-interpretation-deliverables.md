# Creative interpretation of delivered data (SDS-57 follow-up, 2026-08-16)

Sibling of the DCO-22 "compose something real" procedure. That one composes
from a live re-probe of raw data; this one is a **creative interpretation of an
already-verified committed deliverable** — no re-probe needed, the record is the
source of truth.

## When

Client asks a follow-up question on a DONE computation issue that re-opens it,
e.g. SDS-57: after receiving today's sidereal positions, the client asked
"using the sound production skill, what sound do you think it should be
having? like interpreting today's transit?"

## Wake disposition

- The user-type comment re-opens the done issue (`issue_commented` wake) and the
  ASSIGNEE's run (here the Astrologer, run db73f855) holds the checkout.
- This is a legitimate client ask, NOT an echo/stand-down wake: **answer it.**
  Contrast: a productivity-review echo on a done issue with a complete trail
  stands down with zero writes; a direct client question on a computation
  issue gets answered, then closed bare.
- Deliver: commit an artifact in the issue's artifact folder, post the answer as
  an agent-type comment, bare-PATCH done.

## Grounding rules (the core discipline)

- Every creative element maps to a verified fact in the committed record:
  positions, houses, retrograde flags, angles (Lagna/MC), ayanamsa.
- Creative license applies to imagery, analogy, tone, structure — NEVER to
  astrological facts. No invented positions, no invented aspects.
- Cite the record file + commit in the answer so it is auditable.

## Method that worked (sonic reading of a transit)

1. **Thesis first**: one-line sound idea distilled from the dominant signature
   (SDS-57: "slow tidal piece, ~70 BPM, watery minor key" — driven by the
   Cancer cluster: Sun 29 Cancer on the MC + Mercury/Jupiter in the 9th).
2. **Map astrological signatures → sound-design elements** using the
   `sound-production` skill's 4-layer hierarchy (voice / SFX / ambience /
   music) and its generative prompt syntax:
   - Mercury-Jupiter 9th → the voice layer (teacher, mid-range, close-mic).
   - Mars in Gemini 8th → SFX (quick bright attacks, restless edges).
   - Saturn + Neptune Rx in Pisces 5th (both nearly stationary) → ambience
     (low tanpura/temple-bell drone, long reverb — slow creative work).
   - Moon-Venus conjunction in Virgo 11th → the melody (music box / santoor,
     played among friends).
   - Nodal axis as stereo space: Rahu in the 4th = low-left electric hum at the
     root; Ketu in the 10th = high-right detached choir.
   - Uranus 7th = off-beat syncopation; Pluto 3rd = sub-bass under speech.
   - Angles as structure: Lagna opens the piece (Libra = the mixer tuning its
     scales), MC carries the noon swell, night hands over to the 5th house.
3. **Deliver practical prompts** (MusicGen/AudioGen token syntax + mixing
   notes: voice centered, high-pass ~90 Hz, sidechain music −3/−4 dB, −14 LUFS
   / −1 dBTP) so the client can generate.
4. Close with "nothing invented, only interpreted" + the reflection disclaimer.

## Narrative variant (one-para story, SDS-58 follow-up, 2026-08-17)

Same wake disposition, grounding rules, and delivery mechanics as the sonic
reading; swap `sound-production` for the `creative-writing` skill
(personification, imagery across sensory channels, cadence/motif, story
structure). Two additions that worked:
(1) append a **fact-to-image grounding table** to the committed artifact —
each story image → its verified position/house/motion (e.g. "Saturn and
Neptune still in Pisces, turned back, 5th house → Saturn 20 Pisces 08 (Rx) ·
Neptune 9 Pisces 46 (Rx), house 5") — so the creative text is auditable line
by line;
(2) post the story itself as the comment body (one paragraph, the client's
requested length) and close with "Nothing invented, only interpreted — every
image maps to the verified positions in the SDS-58 record ... commit
3c9f0c6" so the answer cites its source. No re-probe needed; the committed
record is the source of truth.

## Delivery mechanics (token never touches disk)

One Python `urllib` process, in order, token held in memory only:
mint key (`POST /api/agents/<id>/keys`) → agent-type comment POST with
`Authorization: Bearer <token>` + `X-Paperclip-Run-Id` → bare
`PATCH {"status":"done"}` → `DELETE` the key. No temp file for the token at
all — the cleanest variant of the minted-key playbook.

## Verification (ad-hoc, no canonical suite)

Reusable assertion set (the v2 script, 63/63 PASS after fixing v1's 17
assertion bugs — all FAILs were script bugs, not doc defects):

- Every cited position matches `positions_sidereal.json` in the RECORD'S OWN
  format (degree before sign: "Sun 29 Cancer 12"), against a
  WHITESPACE-NORMALIZED copy of the doc (`" ".join(doc.split())` — line wraps
  split phrases like "both in the 5th" across newlines).
  - **Zero-pad minutes when deriving expected position strings (SDS-58 story
    follow-up, 2026-08-17):** the JSON stores minutes as unpadded ints (Venus
    `minute: 1`, Saturn `minute: 8`) while committed docs display them
    zero-padded (`Venus 16 Virgo 01`, `Saturn 20 Pisces 08`) — format with
    `"%s %d %s %02d" % (name, degree, sign, minute)` or position checks FAIL
    on correct content. A failed position match ALSO breaks the downstream
    Rx-window check (doc `find()` returns -1, the window slices garbage) — fix
    the formatter, don't chase the Rx FAIL. Observed: 53-check run, 3 FAILs,
    all one cause.
- Rx marking: "Rx" appears within ~60 chars of retrograde planets' positions
  and does NOT appear within ~25 chars of direct planets'.
- House claims match the JSON `house` field (e.g. "in the 11th" for Moon/Venus).
- Angle citations (Lagna/MC), Cancer-cluster count, Moon-Venus < 1°, Ketu =
  Rahu + 180°, all sections present, zero hype words.
- Git: file tracked, `git log -1` for the file == expected commit, `git diff
  HEAD` empty, `git status --short` empty.
- Board: status `done` + completedAt set, no execution/checkout run, newest
  comment agent-type with the answer body.
