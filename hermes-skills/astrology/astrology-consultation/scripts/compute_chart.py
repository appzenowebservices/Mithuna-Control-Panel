#!/usr/bin/env python3
"""Compute a natal chart from birth data (Swiss Ephemeris).

Ephemeris chart computation for the astrology-consultation skill. Uses the
Swiss Ephemeris (pyswisseph / swisseph) with the built-in Moshier ephemeris
(no ephemeris files or network needed). Outputs planet positions, houses,
Ascendant, Midheaven, and a major-aspect table as JSON and as a readable
table.

Usage:
    python compute_chart.py --date 1990-06-15 --time 14:30 --utc-offset -4 \
        --lat 40.7128 --lon -74.0060 --place "New York City, NY, USA"

Arguments:
    --date          Birth date, YYYY-MM-DD (required)
    --time          Birth time, HH:MM in LOCAL clock time (required)
    --utc-offset    UTC offset of the birth location at birth moment in
                    hours, including DST (e.g. -4 for EDT, -5 for EST,
                    +5.5 for IST). Required if --time is given.
    --lat, --lon    Birth place geocoordinates (decimal degrees, S/W
                    negative). Required.
    --place         Free-text birth place name (for the record).
    --house         House system: P (Placidus, default), W (whole sign),
                    K (Koch), R (Regiomontanus), E (Equal).
    --json          Emit JSON only (machine-readable).
    --time-unknown  Birth time unknown: compute with 12:00 noon local time
                    and mark the chart "time unknown" (Ascendant/MC and
                    house positions are then unreliable).

Notes on accuracy:
    - The built-in Moshier ephemeris is accurate to ~0.1 arcsec for
      planets over the modern era; it is the standard fallback when the
      full Swiss Ephemeris files are not installed.
    - Always double-check the timezone/DST offset against the birth
      location's actual clocks at the birth moment; a 1-hour DST error
      moves the Ascendant by roughly 15 degrees and can change the rising
      sign.
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

# Major aspects: (angle, name, orb in degrees).
ASPECTS = [(0, "conjunction", 8.0), (60, "sextile", 4.0),
           (90, "square", 8.0), (120, "trine", 8.0), (180, "opposition", 8.0)]
# Slow-planet pairs (both >= Saturn) get tighter orbs: conjunction/opposition
# 6, trine/square 5, sextile 3.
OUTER = {"Saturn", "Uranus", "Neptune", "Pluto", "Mean Node"}

HOUSE_SYSTEMS = {"P": b"P", "W": b"W", "K": b"K", "R": b"R", "E": b"E"}


def fmt_position(lon_deg):
    """(sign_name, degrees, minutes) for an ecliptic longitude."""
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
    """Which of the 12 Placidus-style houses contains lon_deg."""
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


def aspect_angle(a, b):
    d = abs(a - b) % 360
    if d > 180:
        d = 360 - d
    return d


def compute(jd_ut, lat, lon, house_sys):
    cusps, ascmc = swe.houses(jd_ut, lat, lon, house_sys)
    positions = {}
    for body, name in BODIES:
        pos, _ = swe.calc_ut(jd_ut, body, swe.FLG_MOSEPH | swe.FLG_SPEED)
        positions[name] = {"lon": pos[0], "speed": pos[3]}
    asc, mc = ascmc[0], ascmc[1]
    planets = []
    for name, p in positions.items():
        sign, deg, minute = fmt_position(p["lon"])
        planets.append({
            "name": name,
            "longitude": round(p["lon"], 4),
            "sign": sign,
            "degree": deg,
            "minute": minute,
            "speed_deg_day": round(p["speed"], 4),
            "retrograde": p["speed"] < 0,
            "house": house_of(p["lon"], cusps),
        })
    asc_sign, asc_deg, asc_min = fmt_position(asc)
    mc_sign, mc_deg, mc_min = fmt_position(mc)
    aspects = []
    for i in range(len(planets)):
        for j in range(i + 1, len(planets)):
            pa, pb = planets[i], planets[j]
            raw = (pa["longitude"] - pb["longitude"]) % 360
            d = raw if raw <= 180 else 360 - raw
            direction = 1.0 if raw <= 180 else -1.0
            d_rate = (pa["speed_deg_day"] - pb["speed_deg_day"]) * direction
            both_outer = pa["name"] in OUTER and pb["name"] in OUTER
            for angle, aname, orb in ASPECTS:
                orb_eff = orb
                if both_outer:
                    orb_eff = 3.0 if angle == 60 else (5.0 if angle in (90, 120) else 6.0)
                if abs(d - angle) <= orb_eff:
                    aspects.append({
                        "p1": pa["name"], "p2": pb["name"],
                        "aspect": aname, "angle": angle,
                        "orb": round(abs(d - angle), 2),
                        "applying": d_rate * (d - angle) < 0,
                    })
                    break
    return {
        "ascendant": {"longitude": round(asc, 4), "sign": asc_sign,
                      "degree": asc_deg, "minute": asc_min},
        "midheaven": {"longitude": round(mc, 4), "sign": mc_sign,
                      "degree": mc_deg, "minute": mc_min},
        "cusps": [round(c, 4) for c in cusps],
        "planets": planets,
        "aspects": aspects,
    }


def to_text(r):
    lines = []
    asc = r["ascendant"]
    mc = r["midheaven"]
    lines.append(f"Ascendant: {asc['degree']}\u00b0{asc['minute']:02d} {asc['sign']}  "
                 f"Midheaven: {mc['degree']}\u00b0{mc['minute']:02d} {mc['sign']}")
    lines.append("")
    lines.append(f"{'Planet':<10}{'Position':<18}{'House':<7}{'Speed':<10}Notes")
    lines.append("-" * 60)
    for p in r["planets"]:
        note = "Rx" if p["retrograde"] else ""
        lines.append(f"{p['name']:<10}{p['degree']}\u00b0{p['minute']:02d} {p['sign']:<12}"
                     f"{p['house']:<7}{p['speed_deg_day']:<10}{note}")
    lines.append("")
    lines.append("Major aspects:")
    if not r["aspects"]:
        lines.append("  (none within standard orbs)")
    for a in r["aspects"]:
        app = "applying" if a["applying"] else "separating"
        lines.append(f"  {a['p1']} {a['aspect']} {a['p2']}  "
                     f"(orb {a['orb']}\u00b0, {app})")
    return "\n".join(lines)


def main():
    ap = argparse.ArgumentParser(description="Natal chart computation (Swiss Ephemeris)")
    ap.add_argument("--date", required=True, help="YYYY-MM-DD")
    ap.add_argument("--time", required=True, help="HH:MM local clock time")
    ap.add_argument("--utc-offset", required=True, type=float, help="UTC offset hours (incl. DST)")
    ap.add_argument("--lat", required=True, type=float)
    ap.add_argument("--lon", required=True, type=float)
    ap.add_argument("--place", default="")
    ap.add_argument("--house", default="P", choices=sorted(HOUSE_SYSTEMS))
    ap.add_argument("--json", action="store_true")
    ap.add_argument("--time-unknown", action="store_true",
                    help="use 12:00 noon local, mark time unknown")
    args = ap.parse_args()

    y, m, d = (int(x) for x in args.date.split("-"))
    hh, mm = (int(x) for x in args.time.split(":"))
    if args.time_unknown:
        hh, mm = 12, 0
    utc_hour = hh + mm / 60.0 - args.utc_offset
    jd_ut = swe.julday(y, m, d, utc_hour, swe.GREG_CAL)

    result = compute(jd_ut, args.lat, args.lon, HOUSE_SYSTEMS[args.house])
    result["birth_data"] = {
        "date": args.date, "time": args.time, "utc_offset": args.utc_offset,
        "time_unknown": args.time_unknown, "place": args.place,
        "lat": args.lat, "lon": args.lon, "house_system": args.house,
        "jd_ut": round(jd_ut, 6),
    }
    if args.json:
        print(json.dumps(result, indent=2))
    else:
        print(f"Chart for {args.place or args.date} "
              f"({args.date} {args.time} UTC{args.utc_offset:+.0f})")
        if args.time_unknown:
            print("NOTE: birth time unknown - Ascendant/houses computed for noon, unreliable.")
        print("")
        print(to_text(result))


if __name__ == "__main__":
    sys.exit(main())
