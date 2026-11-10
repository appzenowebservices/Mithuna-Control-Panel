#!/usr/bin/env python3
"""Compute transits of the current sky against a natal chart (Swiss Ephemeris).

Companion to compute_chart.py for the astrology-consultation skill: takes a
natal chart (JSON produced by compute_chart.py --json, or a chart computed
here) and computes, for a transit moment:

  - transit planet positions (sign/degree/house),
  - major aspects from transit planets to natal planets, Ascendant,
    Midheaven, and Descendant (standard orbs: 8 deg majors, 4 deg sextile;
    tighter orbs for outer-planet pairs),
  - optionally (--exact START END) exact-aspect dates for the slow planets
    (Jupiter, Saturn, Uranus, Neptune, Pluto) against chosen natal factors,
    scanned day-by-day over the date range.

Usage:
    python compute_transits.py --natal natal.json --date 2026-08-14 --time 12:00 \
        --utc-offset 0 --lat 26.85 --lon 80.95 --place "chart basis"
    python compute_transits.py --natal natal.json --date 2026-08-14 --time 12:00 \
        --utc-offset 0 --lat 26.85 --lon 80.95 --json
    python compute_transits.py --natal natal.json --exact 2026-01-01 2027-12-31 \
        --factors "Venus,Moon,Mars,Descendant" --slow-only

--natal: JSON file from compute_chart.py --json (planets[], ascendant,
midheaven, cusps). The transit chart is computed for the same geographic
coordinates given on the command line (the birth place), so transit planets
fall into the natal houses.

--exact: scan [START, END) day by day and report the dates when a slow
transiting planet is within 0.5 deg of an exact major aspect to a listed
natal factor. --factors selects which natal factors to scan (default: all
planets + Ascendant + Midheaven + Descendant). --slow-only restricts the
transiting bodies to Jupiter/Saturn/Uranus/Neptune/Pluto.

Notes on accuracy: same ephemeris notes as compute_chart.py (built-in
Moshier ephemeris, ~0.1 arcsec accuracy). The transit moment is given in
UTC; use the actual UTC clock time, not local time.
"""

import argparse
import json
import math
import sys

try:
    import pyswisseph as swe
except ImportError:  # wheel sometimes ships the raw extension only
    import swisseph as swe

SIGNS = ["Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo",
         "Libra", "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces"]

BODIES = [
    (swe.SUN, "Sun"), (swe.MOON, "Moon"), (swe.MERCURY, "Mercury"),
    (swe.VENUS, "Venus"), (swe.MARS, "Mars"), (swe.JUPITER, "Jupiter"),
    (swe.SATURN, "Saturn"), (swe.URANUS, "Uranus"), (swe.NEPTUNE, "Neptune"),
    (swe.PLUTO, "Pluto"), (swe.MEAN_NODE, "Mean Node"),
]

SLOW = {"Jupiter", "Saturn", "Uranus", "Neptune", "Pluto"}

# Major aspects: (angle, name, orb in degrees).
ASPECTS = [(0, "conjunction", 8.0), (60, "sextile", 4.0),
           (90, "square", 8.0), (120, "trine", 8.0), (180, "opposition", 8.0)]
OUTER = {"Saturn", "Uranus", "Neptune", "Pluto", "Mean Node"}


def fmt_position(lon_deg):
    sign_idx = int(lon_deg // 30) % 12
    within = lon_deg - sign_idx * 30
    deg = int(within)
    minute = int(round((within - deg) * 60))
    if minute == 60:
        minute = 0
        deg += 1
    if deg == 30:
        deg = 0
        sign_idx = (sign_idx + 1) % 12
    return SIGNS[sign_idx], deg, minute


def house_of(lon_deg, cusps):
    n = len(cusps)
    for i in range(n):
        a, b = cusps[i], cusps[(i + 1) % n]
        if a <= b:
            if a <= lon_deg < b:
                return i + 1
        else:  # wrap across 0 Aries
            if lon_deg >= a or lon_deg < b:
                return i + 1
    return 1


def aspect_match(a_lon, b_lon, both_outer=False):
    """Return (aspect_name, orb, applying?) for the closest major aspect, or None."""
    raw = (a_lon - b_lon) % 360
    d = raw if raw <= 180 else 360 - raw
    direction = 1.0 if raw <= 180 else -1.0
    for angle, aname, orb in ASPECTS:
        orb_eff = orb
        if both_outer:
            orb_eff = 3.0 if angle == 60 else (5.0 if angle in (90, 120) else 6.0)
        if abs(d - angle) <= orb_eff:
            return aname, round(abs(d - angle), 2)
    return None


def transit_positions(jd_ut, lat, lon):
    """Planet longitudes + Asc/MC for a transit moment."""
    cusps, ascmc = swe.houses(jd_ut, lat, lon, b"P")
    pos = {}
    for body, name in BODIES:
        p, _ = swe.calc_ut(jd_ut, body, swe.FLG_MOSEPH | swe.FLG_SPEED)
        pos[name] = {"lon": p[0], "speed": p[3]}
    return pos, cusps, ascmc[0], ascmc[1]


def main():
    ap = argparse.ArgumentParser(description="Transit computation (Swiss Ephemeris)")
    ap.add_argument("--natal", required=True, help="natal JSON from compute_chart.py --json")
    ap.add_argument("--date", help="transit date YYYY-MM-DD (default: today, 12:00 UTC)")
    ap.add_argument("--time", default="12:00", help="transit time HH:MM UTC")
    ap.add_argument("--lat", required=True, type=float)
    ap.add_argument("--lon", required=True, type=float)
    ap.add_argument("--place", default="")
    ap.add_argument("--json", action="store_true")
    ap.add_argument("--exact", nargs=2, metavar=("START", "END"),
                    help="scan exact slow-planet aspect dates in [START, END)")
    ap.add_argument("--factors", default="",
                    help="comma-separated natal factors to scan (default: all)")
    ap.add_argument("--slow-only", action="store_true",
                    help="--exact: only Jupiter/Saturn/Uranus/Neptune/Pluto transits")
    args = ap.parse_args()

    with open(args.natal, "r", encoding="utf-8") as f:
        natal = json.load(f)

    natal_lon = {p["name"]: p["longitude"] for p in natal["planets"]}
    natal_lon["Ascendant"] = natal["ascendant"]["longitude"]
    natal_lon["Midheaven"] = natal["midheaven"]["longitude"]
    natal_lon["Descendant"] = (natal["ascendant"]["longitude"] + 180) % 360
    natal_lon["IC"] = (natal["midheaven"]["longitude"] + 180) % 360
    cusps = natal["cusps"]

    if args.exact:
        start, end = args.exact
        factors = [f.strip() for f in args.factors.split(",") if f.strip()]
        if not factors:
            factors = list(natal_lon.keys())
        sy, sm, sd = (int(x) for x in start.split("-"))
        ey, em, ed = (int(x) for x in end.split("-"))
        jd0 = swe.julday(sy, sm, sd, 12.0, swe.GREG_CAL)
        jd1 = swe.julday(ey, em, ed, 12.0, swe.GREG_CAL)
        hits = []
        jd = jd0
        while jd < jd1:
            pos, _, _, _ = transit_positions(jd, args.lat, args.lon)
            for tname, tlon in pos.items():
                if args.slow_only and tname not in SLOW:
                    continue
                for fname in factors:
                    if fname not in natal_lon:
                        continue
                    f_lon = natal_lon[fname]
                    both_outer = tname in OUTER and fname in OUTER
                    m = aspect_match(tlon["lon"], f_lon, both_outer)
                    if m and m[1] <= 0.5:
                        y, mo, d, h = swe.revjul(jd, swe.GREG_CAL)
                        hits.append((jd, f"{y:04d}-{mo:02d}-{d:02d}",
                                     tname, m[0], m[1], fname))
            jd += 1.0
        # Keep the tightest date per (transit body, aspect, factor) pair.
        best = {}
        for jd, ds, tname, aname, orb, fname in hits:
            key = (tname, aname, fname)
            if key not in best or orb < best[key][4]:
                best[key] = (jd, ds, tname, aname, orb, fname)
        for key in sorted(best):
            jd, ds, tname, aname, orb, fname = best[key]
            print(f"{ds}  {tname} {aname} natal {fname}  (orb {orb:.2f})")
        return

    # Transit chart + aspect table.
    if args.date:
        y, m, d = (int(x) for x in args.date.split("-"))
    else:
        import datetime
        now = datetime.datetime.now(datetime.timezone.utc)
        y, m, d = now.year, now.month, now.day
    hh, mm = (int(x) for x in args.time.split(":"))
    jd_ut = swe.julday(y, m, d, hh + mm / 60.0, swe.GREG_CAL)

    tpos, _, tasc, tmc = transit_positions(jd_ut, args.lat, args.lon)

    if args.json:
        out = {"transit_jd_ut": round(jd_ut, 6),
               "transit_planets": [], "aspects": []}
        for name, p in tpos.items():
            sign, deg, minute = fmt_position(p["lon"])
            out["transit_planets"].append({
                "name": name, "longitude": round(p["lon"], 4),
                "sign": sign, "degree": deg, "minute": minute,
                "speed_deg_day": round(p["speed"], 4),
                "retrograde": p["speed"] < 0,
                "house": house_of(p["lon"], cusps),
            })
        tasc_sign, tasc_deg, tasc_min = fmt_position(tasc)
        tmc_sign, tmc_deg, tmc_min = fmt_position(tmc)
        out["transit_ascendant"] = {"longitude": round(tasc, 4),
                                    "sign": tasc_sign, "degree": tasc_deg, "minute": tasc_min}
        out["transit_midheaven"] = {"longitude": round(tmc, 4),
                                    "sign": tmc_sign, "degree": tmc_deg, "minute": tmc_min}
        for tname, tp in tpos.items():
            for fname, f_lon in natal_lon.items():
                both_outer = tname in OUTER and fname in OUTER
                m = aspect_match(tp["lon"], f_lon, both_outer)
                if m:
                    aname, orb = m
                    out["aspects"].append({
                        "transit": tname, "natal": fname,
                        "aspect": aname, "orb": orb,
                        "transit_house": house_of(tp["lon"], cusps),
                    })
        print(json.dumps(out, indent=2))
        return

    a_sign, a_deg, a_min = fmt_position(tasc)
    m_sign, m_deg, m_min = fmt_position(tmc)
    print(f"Transits at {args.date or 'today'} {args.time} UTC "
          f"({args.place or ''})")
    print(f"Transit Ascendant: {a_deg}\u00b0{a_min:02d} {a_sign}  "
          f"Midheaven: {m_deg}\u00b0{m_min:02d} {m_sign}")
    print("")
    print(f"{'Planet':<10}{'Position':<18}{'House':<7}Notes")
    print("-" * 52)
    for name, p in tpos.items():
        sign, deg, minute = fmt_position(p["lon"])
        note = "Rx" if p["speed"] < 0 else ""
        print(f"{name:<10}{deg}\u00b0{minute:02d} {sign:<12}{house_of(p['lon'], cusps):<7}{note}")
    print("")
    print("Transit -> natal aspects (standard orbs):")
    printed = False
    for tname, tp in tpos.items():
        for fname, f_lon in natal_lon.items():
            both_outer = tname in OUTER and fname in OUTER
            m = aspect_match(tp["lon"], f_lon, both_outer)
            if m:
                aname, orb = m
                print(f"  {tname} {aname} natal {fname}  "
                      f"(orb {orb}\u00b0, in house {house_of(tp['lon'], cusps)})")
                printed = True
    if not printed:
        print("  (none within standard orbs)")


if __name__ == "__main__":
    sys.exit(main())
