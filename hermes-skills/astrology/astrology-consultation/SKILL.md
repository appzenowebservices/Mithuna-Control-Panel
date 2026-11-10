---
name: astrology-consultation
description: "Natal chart computation and consultation workflow."
version: 1.0.0
author: Hermes Agent (Astrology Consultant Lead, Astrologics)
license: MIT
platforms: [windows, macos, linux]
metadata:
  hermes:
    house: 9
    tags: [astrology, ephemeris, natal-chart, consultation, astrologics]
    category: astrology
    related_skills: [humanizer, maps]
    domains: [natal chart, birth chart, synastry, yearly forecast, life-theme reading, consultation report, ephemeris computation, planetary position, planetary positions, where is the sun, where is the moon, where is mars, where is saturn, where is jupiter, where is venus, sky position, in the sky, transits reading, new moon in, full moon in, horoscope, zodiac reading]
    intent_examples:
      - "where is the sun"
      - "where is the moon"
      - "where is mars in the sky"
      - "tell me where is the saturn"
      - "compute my natal chart"
      - "planetary positions"
---

# Astrology Consultation Skill

Computes a natal chart from a client's actual birth data (date, time, place)
using the Swiss Ephemeris, interprets it against the client's stated question,
and produces a personalized written consultation report. This is the delivery
skill for Astrologics consultations: chart-first, question-tied, human-voiced,
never a generic horoscope. It does not replace judgment about ethics, privacy,
or the disclaimer — those are enforced in the checklist, not here.

## When to Use

- A consultation request has cleared intake (Gate 1) and booking (Gate 2):
  complete birth data + a stated question exists.
- Any production of a natal, relationship/synastry, yearly-forecast, or
  life-theme reading for a paying client.
- Drafting a pilot or sample reading (use explicit synthetic birth data and
  label it PILOT).

## Prerequisites

- Birth data: date (YYYY-MM-DD), local clock time (HH:MM), place, and the
  location's UTC offset at the birth moment (including DST). Time unknown is
  acceptable only with an explicit limitation note (see Pitfalls).
- `pyswisseph` (Python, pip-installable; the raw `swisseph` extension also
  works). The script uses the built-in Moshier ephemeris — no ephemeris files
  or network needed. If missing: `python -m pip install pyswisseph`.
- Place → coordinates: geocode with the `maps` skill (OpenStreetMap/OSRM), or
  `web_search`/`web_extract` for a reliable source. S/W coordinates are
  negative.
- `humanizer` skill loaded for the tone bar; the consultation checklist
  (Astrologics internal) for the review gate.

## How to Run

```bash
python scripts/compute_chart.py --date 1990-06-15 --time 14:30 \
    --utc-offset -4 --lat 40.7128 --lon -74.0060 \
    --place "New York City, NY, USA"
```

Output: Ascendant, Midheaven, planet positions (sign/degree/house, retrograde
flags), house cusps, and a major-aspect table (orb + applying/separating). Add
`--json` for machine-readable output. House system defaults to Placidus
(`--house W` for whole sign, etc.).

Transits (forecast services): feed the natal chart's `--json` output to
`scripts/compute_transits.py` (same coordinates as the birth place, so
transit planets fall into the natal houses). It prints transit planet
positions, the transit→natal aspect table at standard orbs, and with
`--exact START END` the dated exact-aspect windows for chosen natal factors:

```bash
python scripts/compute_chart.py --date 1995-07-11 --time 19:58 \
    --utc-offset 0 --lat 26.85 --lon 80.95 --json > natal.json
python scripts/compute_transits.py --natal natal.json \
    --date 2026-08-14 --time 12:00 --lat 26.85 --lon 80.95
python scripts/compute_transits.py --natal natal.json \
    --exact 2026-06-01 2028-06-01 --factors "Venus,Moon,Mars,Descendant" \
    --slow-only --lat 26.85 --lon 80.95
```

`--exact` takes the transit moment as UTC with NO `--utc-offset` flag, and it
DEDUPES to one date per (transit, aspect, natal-factor) pair — see the
Pitfalls entry on exact-date scans before trusting a full-range run.

## Sidereal (Vedic) positions — "today's planet positions" requests

Daily sidereal-position requests ("tell me just today's planet sidereal
position, <city>", e.g. SDS-57 for Lucknow) are a recurring Astrologics
client type. `compute_chart.py` is tropical-only and has NO `--sidereal`
flag — compute sidereal directly with the Swiss Ephemeris:

```python
import pyswisseph as swe                       # raw swisseph also works
swe.set_ephe_path("")
swe.set_sid_mode(swe.SIDM_LAHIRI)
FLAGS = swe.FLG_MOSEPH | swe.FLG_SIDEREAL | swe.FLG_SPEED
jd = swe.julday(2026, 8, 16, 6.5)              # UTC moment: 12:00 IST = 06:30 UTC
pos = swe.calc_ut(jd, swe.SUN, FLAGS)          # see calc_ut shape pitfall below
lon, speed = pos[0], pos[3]
cusps, ascmc = swe.houses_ex(jd, lat, lon, b"P", FLAGS)   # sidereal Placidus
```

Conventions that held for SDS-57 (2026-08-16, Lucknow 26.85N 80.95E):
- Reference moment = 12:00 noon IST (06:30 UTC) for "today" — compute in UTC
  from the local noon moment; the client's local date is the operative one.
- "My current time" phrasing (SDS-58, 2026-08-17): the reference moment is
  the EXACT request timestamp (issue `createdAt`, e.g. 2026-08-17T06:28:15Z =
  11:58:15 IST), not noon — document it as "the moment of your request".
  Positions shift negligibly within minutes (Moon ~0.55°/hour), so the
  practical answer is unchanged; the precision is for the record.
- **No location given ("tell me the position of the moon", SDS-76, 2026-09-02):**
  geocentric ecliptic longitude is location-independent — answer without
  lat/lon, but DROP houses/Lagna/Ascendant (they need coordinates; state that
  scope explicitly so the answer isn't mistaken for a full chart). The
  direct-ephemeris snippet above is the ONLY path — `compute_chart.py` demands
  `--lat/--lon` (required args), so it cannot run for a location-less query.
  Reference moment = issue `createdAt` UTC pasted directly (SDS-58 rule holds
  even without a city). Location-less cross-check set (house/lagna checks don't
  apply): (a) tropical−sidereal delta == ayanamsa for the computed body,
  (b) the computed body's OWN speed band — the 12–15°/day figure is MOON-ONLY;
  never reuse it for other bodies (Venus direct: 0–1.6°/day; near its station
  the speed →0 and decelerates, so a mid-band value like 0.78°/day is normal —
  confirm by sampling ±1 day and asserting the trend, SDS-77: 0.79→0.78→0.77→0.75
  toward the early-Oct-2026 Rx station), (c) motion state matches expectation —
  for fast planets "direct (speed > 0)" is the default, but RETROGRADE
  (speed < 0) is a normal, EXPECTED state for slow outer planets (Saturn etc.)
  inside their annual Rx window — never treat a negative speed as an automatic
  FAIL; confirm with the station-window sweep + day-over-day trend (SDS-78),
  (d) tropical Sun sign matches the season (2026-09-02 → Virgo) — 4/4 PASS on
  SDS-76,
  5/5 PASS on SDS-77 (Venus: speed-band assertion corrected after first run
  FAILed on the borrowed Moon band — the FAIL was MY assertion, not the
  ephemeris; fix the band, don't distrust the compute). Enrich a bare
  position with nakshatra+pada (27 × 13°20' segments from Aries 0°; pada =
  quarter within the segment) and lunar phase (elongation from tropical Sun:
  <180° waxing, >180° waning; illumination = (1 − cos elong)/2). SDS-76 result:
  Moon 18°14' Aries sidereal (12°28' Taurus tropical), Bharani pada 2, waning
  gibbous, 72.95% illuminated, direct 13.88°/day.

- **Venus version of the location-less query (SDS-77, 2026-09-02):** same
  flow, body = Venus, reference moment = `createdAt`
  2026-09-02T06:20:25.291Z. Result: Venus 29°56' Virgo sidereal (24°10' Libra
  tropical), nakshatra Chitra pada 2, direct at 0.78°/day, decelerating toward
  its early-Oct-2026 retrograde station. Nakshatra/pada enrichment applies to
  any body; lunar phase enrichment is Moon-only (skip for Venus). The
  location-less cross-check set above generalizes — just replace the Moon
  speed band with the body's own.
- **Saturn version of the location-less query (SDS-78, 2026-09-02) — slow
  outer planets are RETROGRADE for months, that is expected, not an error:**
  body = Saturn, reference moment = `createdAt` 2026-09-02T06:32:33.682Z.
  Result: Saturn 19°22' Pisces sidereal (13°36' Aries tropical), nakshatra
  Revati pada 1, retrograde at −0.058°/day. Saturn's own speed band is
  ±0.03–0.13°/day apparent (Rx speeds ~−0.05…−0.06), so mid-Rx −0.058 is
  in-band — Moon's 12–15°/day and Venus' 0–1.6°/day bands BOTH must be
  discarded. Retrograde verification that worked: (1) day-over-day longitude
  trend (Sep 01 19°25' → Sep 02 19°22' → Sep 03 19°19' Pisces — decreasing =
  genuine backward motion); (2) **station-window sweep** — scan `swe.calc_ut`
  speed signs across ~6 months at 5-day granularity and log the sign changes
  (Rx began ~late-Jul-2026, stationary-direct 2026-12-11, so early Sep sits
  mid-Rx). The sweep is the slow-planet analog of the fast-planet ±1-day
  sampling trick: it proves a negative speed is a genuine Rx window, not an
  ephemeris glitch. Nakshatra/pada enrichment and the location-less
  cross-check set apply unchanged — flip check (c) to "motion matches the
  Rx window" instead of "direct".
- **Jupiter version of the location-less query (SDS-79, 2026-09-02):** body =
  Jupiter, reference moment = `createdAt` 2026-09-02T11:23:38.618Z. Result:
  Jupiter 19°41' Cancer sidereal (13°55' Leo tropical), nakshatra Ashlesha pada
  1, direct at +0.209°/day. Jupiter's own speed band is ~0.05–0.3°/day apparent
  (direct phase ~0.1–0.22°/day), so +0.209 mid-direct is in-band — Moon's
  12–15 and Venus' 0–1.6°/day bands both discarded. Motion verification: the
  station-window sweep (Mar–Dec 2026, 5-day steps) shows rx→direct 2026-03-16
  and direct→rx 2026-12-16, so early Sep sits mid-direct — for a fast-ish outer
  planet in its direct phase expect a POSITIVE speed near the upper end of its
  band (accelerating toward the coming station), and confirm with the
  ±1/±5/±10-day longitude trend (monotonic increase). Nakshatra/pada
  enrichment and the location-less cross-check set apply unchanged.
- Ketu = mean node + 180°; retrograde flag = speed sign (negative → Rx).
- Cross-check: sidereal = tropical − Lahiri ayanamsa for EVERY body (constant
  small artifact); Moon speed 12–15°/day; tropical Sun sign matches the
  season; Lagna = ascmc[0], MC = ascmc[1].
- House column = Placidus cusp-pair containment of the sidereal longitude
  (wrap cusps[0] + 360° for the 0°-Aries edge).
- Independent verification: `scripts/verify_sidereal_positions.py --json
  <positions_sidereal.json>` — recomputes and diffs every body's
  longitude/sign/deg-min/speed/retrograde, ayanamsa, Lagna/MC, and house
  assignment (74/74 PASS on the SDS-57 artifact).

## Quick Reference

| Step | Tool / script | Output |
|---|---|---|
| 1. Validate birth data | read intake fields | clean date/time/place/offset |
| 2. Compute chart | `scripts/compute_chart.py` | planets, Asc, MC, houses, aspects |
| 3. Cross-check | sanity rules below | confirmation or re-compute |
| 4. Extract question factors | significations reference | 2-5 chart factors tied to the question |
| 5. Interpret | references/significations.md | coherent narrative, not a dump |
| 6. Draft report | templates/report-structure.md | personalized report |
| 7. Humanize | `humanizer` skill pass | human-voiced prose |
| 8. Review | consultation checklist | pass all Stage-3/4 checks |

Chart parameters always extracted: **Ascendant (rising)**, **Sun**, **Moon**,
**Midheaven**, **house placements**, and **major aspects** (conjunction,
sextile, square, trine, opposition). Question factors: ruler of the relevant
house, planets in the relevant house, aspects from transiting slow planets
(forecasts only).

## Procedure

1. **Validate birth data.** Confirm date/time/place/offset are explicit and
   complete. If time is unknown, note it and compute with noon (script
   `--time-unknown`); the report must state that Ascendant/houses are
   approximate. Never invent a birth time.
2. **Compute the chart** with `scripts/compute_chart.py`. Use the geocoded
   coordinates for the actual birthplace, the correct UTC offset for that
   date (DST changes!), and one house system consistently (Placidus default).
3. **Cross-check the result.** Sun sign must match the birth date's sign
   range; Moon position should be plausible (13°/day); Ascendant changes
   ~1°/4 minutes — for a given local time of day the rising sign should be in
   a plausible range for the latitude. Outer planets (Saturn, Uranus, Neptune,
   Pluto) move slowly — check them against their known sign-by-year windows.
   Any mismatch → re-check input (esp. UTC offset) and recompute.
4. **Extract question factors.** Map the client's question to life areas
   (career → 10th/MC + Saturn + house rulers; relationships → 7th/Venus/Moon;
   money → 2nd/8th + Venus/Jupiter/Pluto; timing → transits of Saturn/Jupiter
   to natal factors). Identify 2-5 chart factors that speak to that area:
   ruler of the relevant house, planets there, and aspects involving them.
5. **Interpret.** Follow references/significations.md. Blend: core self
   (Sun/Moon/Asc), the question's area (house + rulers + aspects), and
   character of the timing (forecast/solar-return services only — transits of
   slow planets to natal factors). Be specific and honest: name the actual
   placements, degrees, and orbs. Where the chart is mixed (e.g. supportive
   and challenging aspects together), say so rather than cherry-picking.
   Avoid deterministic prediction language — frame as tendencies and
   conditions, not fate.
6. **Draft the report** following templates/report-structure.md: opening,
   core self, the question answered, supporting detail, practical notes,
   closing, standard disclaimer. The report must reference the client's
   actual chart parameters (placements, aspects by name) and address the
   exact question asked.
7. **Humanize.** Run the `humanizer` skill pass over the draft: remove AI
   boilerplate, vary rhythm, keep warmth and specificity. A report that reads
   like a template fails the review gate regardless of accuracy.
8. **Review against the checklist.** Chart accuracy (computed values match
   the script output, cross-check passed), personalization (question
   addressed, no templating), humanizer bar, standard disclaimer present,
   PII handled (no birth data outside the client record/issue). Fix defects
   before handoff.

## Artifact location

Deliverable artifacts are written to the **company execution workspace**, one
folder per issue:

```
<workspace cwd>/SDS/artifacts/<SDS-NN>/
  astrologics-consultation-<sds-nn>.md   the reading record (full scaffolding)
  <compute outputs>                      chart/transit JSON or txt for the issue
```

The workspace is a local git repo: commit the record + outputs and cite the
commit hash in the issue close comment and work-product evidence (hash = the
authoritative locator, replacing the old docs-in-repo convention). Compute
**scripts** (`scripts/compute_chart.py`, `scripts/compute_transits.py`) are
reusable tooling — they stay in this skill's `scripts/` directory and are NOT
copied into the artifact folder; only per-issue records and outputs are
artifacts. See the workspace's `SDS/artifacts/README.md` for the full layout.

## Short-form answers (client-requested length limit)

When the client explicitly asks for a short deliverable ("give me one para
answer only", "brief answer"), the reading body becomes ONE paragraph, but
the record doc keeps the full scaffolding: chart basis table, computed
parameters + cross-check, the paragraph as the reading, pipeline/quality
record, and the standard disclaimer. The paragraph must still name actual
placements/degrees and address the exact question; it is a compressed
reading, not a generic horoscope. The issue close comment carries the
paragraph itself (that IS the answer), and the committed doc preserves the
audit trail. Do not silently expand a one-paragraph request into a full
report, and do not strip the scaffolding either — the doc stays a complete
record even when the reading is short.

## Brand short-form content (reels / video scripts)

When the brand asks for short-form video content (reels, teasers) rather than a
consultation, use `templates/astro-reel-screenplay.md` — the SDS-83-verified 45-60 s
vertical (9:16) structure: cold open → hook → zodiac-archetype montage → twist → CTA,
plus a current-event fill-in slot and production notes. Two rules: (1) **no invented
ephemeris** — the sky-event slot is filled with a COMPUTED event (see "Current/upcoming
sky events" below — `scripts/compute_lunar_phases.py`, Meeus, anchor-verified), never
recalled from memory and never left empty awaiting the operator when you can compute it;
creative license covers scene/tone, never astrological facts;
(2) speak like an astrologer — archetype language (fire/earth/air/water one-liners) beats
generic horoscope filler. Delivery mechanics live in `board-ops`
(`references/sds-83-capability-delivery.md`).
(3) **episode-lock pattern when the user's final inputs are missing** (SDS-83 11:41 UTC
2026-09-04 lock wake): a re-opened reel issue whose comment names inputs the user hasn't
given (e.g. `@handle` + VO gender) is a LOCK wake, not a stall —
   - **Resolve-by-construction:** audit every VO line for gendered pronouns; if none
     exist, adopt and document a gender-neutral series standard ("warm, close-mic,
     gender-neutral") so any voice can record. Never guess the brand's voice.
   - **Isolate the un-inventable:** a brand `@handle` is a publish-time macro — keep it
     marked `@HANDLE` on the title card, ask for it ONCE in the lock comment, never
     fabricate it to force closure.
   - **Re-budget runtime to the platform cap:** scene timings must sum to the cap
     (60 s for reels); the weekly sky slot (~8 s) pushes the draft over, so tighten the
     flexible scenes (montage ~5 s, outro ~3 s) and publish the per-scene budget
     (3+7+8+20+10+12 = 60 s).
   - **Re-execute before locking:** run `scripts/compute_lunar_phases.py` again and verify
     EVERY promised anchor, not just the headline event — SDS-83 re-verified New Moon
     Sep 11 Virgo 18.4° + Full Moon Sep 26 16:57 UTC + New Moon Oct 10 15:55 UTC Libra 17.4°
     before declaring the lock (the Oct anchor had only been quoted in a prior comment).
   - **Deliver a lock-status list** (✅ locked / ⏳ open macro) so the user sees exactly one
     decision remains, then close (comment + bare-PATCH done, board-ops).

## Current/upcoming sky events (new moons, full moons)

Any "current sky event" / "what's the next new moon?" ask — for reels, forecasts, or
consultation timing — is COMPUTED, never recalled. `scripts/compute_lunar_phases.py`
implements the Meeus lunar-phase algorithm (Astronomical Algorithms 2nd ed., ch. 49) +
solar longitude (ch. 25) in pure stdlib — no Swiss Ephemeris needed:

```bash
python scripts/compute_lunar_phases.py --date 2026-09-04 --count 3
```

Prints, for every new/full moon after the reference date: exact UTC instant, weekday,
and zodiac placement (new moon = Sun longitude, full moon = Sun + 180°). SDS-83 output:
New Moon in Virgo 18.4°, Fri 2026-09-11 03:32:50 UTC; anchor check — the prior new moon
computed to 2026-08-12 17:43 UTC, the known total solar eclipse.

Pitfalls (all hit live on SDS-83):
- **jd_to_utc year formula:** `year = C - 4716 if month > 2 else C - 4715`. Inverting
  it shifts every date +1 calendar year (2026-09-11 rendered as 2027-09-11). The script
  ships the correct form — if you re-implement, don't "fix" it.
- **Weekdays and dates come from the computed datetime, never from memory.** A "Mon
  Oct 10" claim was wrong — the computed new moon was Saturday (2026-10-10 15:55 UTC,
  Libra 17.4°). Derive, then assert.
- **Anchor-verify before quoting:** the event immediately BEFORE the reference date must
  match a known event (e.g. 2026-08-12 total solar eclipse = new moon) to within a few
  minutes; then the rest of the series is trustworthy.
- Sanity: the event's sign must sit in the season's plausible range (Sept new moon →
  Virgo/Libra, never Aries).

## Pitfalls

- **DST/timezone errors** are the #1 chart-killer. A 1-hour error moves the
  Ascendant ~15°, often changing the rising sign. Verify the offset for the
  exact date, not "the city's timezone."
- **Birth time unknown:** never fabricate a time; use noon with an explicit
  limitation. Ascendant, Midheaven, and house placements are unreliable in
  that case — restrict the reading to signs and aspects.
- **House system inconsistency:** compute every chart in the same system
  (Placidus default). Never mix systems across a client's reports.
- **High-latitude Placidus failures** (interception/undefined houses): switch
  to whole sign (`--house W`) and note it.
- **Aspect orbs:** the script applies standard orbs (8° majors, 4° sextile)
  and tighter orbs for outer-planet pairs. Do not widen orbs ad hoc to force
  an aspect — if it is not in the output, do not interpret it.
- **Orb units: the scripts report orbs in DECIMAL degrees — write them as
  decimals (`2.24°`) and never as degrees-minutes.** `compute_chart.py` /
  `compute_transits.py` print `orb: 2.24` (decimal), while planet POSITIONS
  are degrees+minutes (21 Taurus 42). Naive digit-splits like "orb 2°24"
  (from 2.24) or "7°44" (from 7.44) are wrong: 2.24° = 2°14', 7.44° = 7°26'.
  Observed SDS-56 (2026-08-14, health focus): the draft rendered orbs
  degrees-minutes-style, a "correction" of Mercury-Mars 7.44 → "7°44" made it
  worse, and the fix was decimal everywhere — which also keeps every cited
  value string-matchable against the script JSON in verification (93/93).
  When "fixing" an orb, re-derive from the script value; never hand-adjust
  the rendered text.
- **Don't dump the chart.** A report that lists every placement without
  connecting them to the question is a failed Gate 3 (personalization).
- **No fatalism, no guarantees.** Interpretations are tendencies and
  conditions. Never present astrology as medical, legal, or financial advice,
  and never guarantee outcomes — the disclaimer is not optional.
- **PII discipline:** birth data is PII. It lives only on the client's
  board issue/record, never in public docs or the report body beyond what the
  client needs (e.g. "your Sun in Gemini").
- **pyswisseph wheel quirks:** some installs ship only the raw `swisseph`
  extension — `import pyswisseph` raises ModuleNotFoundError while
  `import swisseph` works (the script falls back automatically), and the raw
  module does NOT export house-system constants (`swe.HOUSES_PLACIDUS` →
  AttributeError — the script passes byte codes `b"P"`/`b"W"`). Don't
  "fix" the script to use named constants. The raw module's
  `swe.calc_ut` returns a 2-tuple `((lon, lat, dist, speed_lon, speed_lat,
  speed_dist), retval)` — index the INNER tuple: `pos = swe.calc_ut(jd,
  body, FLAGS)` then `lon, speed = pos[0][0], pos[0][3]`; `swe.calc_ut(...)[3]`
  raises IndexError (observed 2026-08-16, SDS-57 verification). `pyswisseph`
  returns the flat tuple — normalize with `pos = r[0] if len(r) == 2 and
  isinstance(r[0], tuple) else r`.
- **Verify transit→natal aspects programmatically, never by eye.**
  Hand-mapping printed planet tables to aspect angles is error-prone (an
  Aquarius→Gemini trine was mis-mapped by hand; the computed check showed the
  real aspect was to Mercury, not the Sun). Compute orbs with the script and
  cite only printed output.
- **Tight orb filters in ad-hoc transit scans silently drop real aspects.**
  A wealth/career transit pass filtered at orb ≤ 3.0° missed Saturn square
  natal Moon at 4.21° (real at the standard 8° major orb) and Saturn square
  natal Sun at 4.58° — the aspects only surfaced in a follow-up wide-orb
  pass. When scanning transits vs natal factors, use the script's standard
  orbs (8° majors, 4° sextile) or run a wide first pass and then report only
  aspects within standard orbs; a narrow filter for "the tight ones" is a
  distinct step, never the only pass. SDS-54 (2026-08-13): same birth data
  as SDS-53, wealth focus, one-paragraph answer.
- **`compute_transits.py --exact` dedupes to ONE date per (transit body,
  aspect, natal-factor) pair — secondary/retrograde passes vanish from
  full-range output. That is a script mask, NOT a doc error.** The scan
  keeps only the tightest-orb hit per pair (the script's `best[key]`
  dedupe), so a planet that exacts an aspect more than once (direct pass +
  retrograde re-touch, or a station-and-retrace planet) prints only the
  tighter pass. Observed SDS-55 (2026-08-14, love focus): a full-range scan
  `--exact 2026-01-01 2029-01-01 --factors Venus,Moon,Jupiter,Pluto,Descendant --slow-only`
  returned only Uranus opposition Jupiter at 2028-01-16 (orb 0.00), while
  the aspect is ALSO exact 2027-06-04 (orb 0.01) and re-touches 2028-03-11 —
  the doc's "June 2027" claim was right, the wide scan just masked it.
  Rule: never flag a claimed window because a wide scan doesn't show it;
  confirm EACH claimed date with a NARROW scan around it
  (`--exact 2027-05-15 2027-07-15 --factors Jupiter` → 2027-06-04), and
  report the full-range mask explicitly rather than calling the doc wrong.
  To enumerate ALL crossings of a stationing planet, scan monthly
  longitudes with a sign-change detection on
  `(prev - target) * (cur - target) <= 0` (linear-interpolate the crossing
  fraction); the SDS-53 record's first crossing 2027-06-05 matched.
- **Birth data given as a UTC timestamp (Z suffix): run the script in UTC
  directly, never hand-convert to local time.** Observed SDS-55
  (2026-08-14): `1995-07-11T19:58:00Z` entered via local-time conversion
  (`--date 1995-07-11 --time 01:28 --utc-offset 5.5`) produced a chart a
  full day off (Moon 25°07 Sagittarius, Asc 20°34 Taurus) because the local
  clock date is 12 July, not 11 July — the script applies the offset to the
  date you pass, so 11 July 01:28 IST silently becomes 10 July 19:58 UTC.
  Correct invocation for a Z timestamp: `--date 1995-07-11 --time 19:58
  --utc-offset 0`. The cross-check caught it: Moon ~15° off and Asc ~1° off
  the SDS-53/54 record for identical birth data. Heuristic: the Moon moves
  ~13°/day, so a ~15° Moon delta against a known-good record is a
  full-day date error, not an ephemeris error — re-check the date before
  touching anything else.
- **compute_transits.py takes the transit moment as UTC with NO
  --utc-offset flag** (unlike compute_chart.py) — passing one errors with
  `unrecognized arguments`. The transit moment is always UTC; do not
  convert to local time.

## Verification

- Script output parses and passes the cross-check rules in Procedure step 3.
- Every chart parameter quoted in the report appears in the script output
  (degree-accurate, correct sign).
- **Normalize before string-matching report values against script output.**
  The ephemeris prints leading zeros (`08°01`), reports conventionally write
  `8°01`, and line-wrapped prose breaks contiguous strings (`12°43\nCancer`).
  Observed SDS-55 (2026-08-14): a naive `"08°01 Cancer" in doc` check failed
  10/52 times on a correct report. Normalize BOTH sides before the `in`
  check: collapse whitespace (`re.sub(r"\s+", " ", s)`) then strip leading
  zeros from degrees (`re.sub(r"(?<!\d)0(\d+°)", r"\1", s)`).
- **Assert against the doc's ACTUAL layout, not prose expectations
  (re-observed SDS-56, 2026-08-14: 13 FAILs, all script bugs, 0 doc
  defects).** The reading record renders computed parameters as TABLE ROWS
  (`| Sun | 19 Cancer 03, 3rd house |`) — match
  `\| Name \| deg Sign 0*mm(, house)`, with `(?: Rx)?,` before the house for
  retrograde rows. Aspect names in prose can be split by fillers ("Mercury
  ... squares both Mars ... and Saturn") — add a second regex for that shape.
  Skip factors the reading deliberately does not cite (e.g. Mean Node). Same
  rule as the SDS-49 "FAIL in your own assertion is a script bug" pitfall,
  new cause: matching your layout assumption instead of the actual doc.
- **Zero-pad MINUTES when asserting doc figures against the JSON (observed
  SDS-58, 2026-08-17: 2 FAILs on a 64-check run, both script bugs).** The
  record's table/answer convention renders minutes zero-padded (`Venus 16
  Virgo 01`, `Saturn 20 Pisces 08`) while the JSON stores them as plain ints
  (`minute: 1`, `minute: 8`). Build expected figures with `"%s %d %s %02d"`
  (name, degree, sign, zero-padded minute), not `%d` — the unpadded figure
  fails to match a correct doc. (Mirror image of the degree-stripping note
  above: degrees drop leading zeros in prose, minutes keep them.)
- **Record headings are numbered (`## 1. Chart basis` … `## 5. Compute
  outputs`); section-assertion scripts must strip the `## N. ` prefix or
  match `## \d+\. <Section>` — a naive `"## Chart basis" in doc` check FAILs
  on a correct record (observed SDS-56, 2026-08-14: 5/63 script FAILs, all
  this class; script bug, not doc defect).** Also audit the OPENING prose
  birth-date line when adopting a sibling's record: SDS-56's adopted doc
  opened "19 July 1995... more precisely, 11 July 1995" — the wrong date was
  prose-only (a draft self-correction), the chart table was correct. Fix the
  prose line and re-commit the delta; do not re-compute or re-author the
  chart (verify computed values, then repair prose separately).
- Report structure matches templates/report-structure.md and includes the
  standard disclaimer.
- Humanizer pass applied; no AI boilerplate patterns remain in the final
  draft.
- Checklist (Stage 3/4) is fully green before the report leaves production;
  reviewer disposition recorded on the issue trail.
