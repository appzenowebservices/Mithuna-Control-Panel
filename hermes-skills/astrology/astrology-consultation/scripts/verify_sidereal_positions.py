#!/usr/bin/env python
"""Independently verify a committed sidereal-positions JSON against Swiss Ephemeris.

Usage:
    python verify_sidereal_positions.py --json SDS/artifacts/SDS-57/positions_sidereal.json

Reads the artifact's own reference moment / lat / lon (CLI overrides
available), recomputes every value in Lahiri sidereal mode (Moshier, speed
flags, Placidus houses), and diffs against the JSON. Exit code 0 = all
checks pass.

Expected JSON schema (SDS-57 shape):
    reference_moment_utc: "2026-08-16T06:30:00Z"
    lat, lon, ayanamsa_deg
    lagna:      {longitude, sign, degree, minute}
    midheaven:  {longitude, sign, degree, minute}
    planets:    [{name, longitude, sign, degree, minute, speed, retrograde, house}]

Works with both `pyswisseph` and the raw `swisseph` extension (handles the
raw module's 2-tuple calc_ut return shape). 74/74 PASS on the SDS-57
artifact (2026-08-16, Lucknow 26.85N 80.95E, 12:00 IST).
"""
import argparse
import datetime
import json
import sys

try:
    import pyswisseph as swe
except ImportError:
    import swisseph as swe

SIGN_NAMES = ["Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo",
              "Libra", "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces"]

PLANET_IDS = {
    "Sun": swe.SUN, "Moon": swe.MOON, "Mars": swe.MARS, "Mercury": swe.MERCURY,
    "Jupiter": swe.JUPITER, "Venus": swe.VENUS, "Saturn": swe.SATURN,
    "Rahu": swe.MEAN_NODE, "Ketu": swe.MEAN_NODE, "Uranus": swe.URANUS,
    "Neptune": swe.NEPTUNE, "Pluto": swe.PLUTO,
}


def calc(jd, body_id, flags):
    """calc_ut normalized across pyswisseph (flat tuple) and raw swisseph
    ((positions, retval) 2-tuple)."""
    r = swe.calc_ut(jd, body_id, flags)
    if len(r) == 2 and isinstance(r[0], tuple):
        return r[0]
    return r


def fmt_pos(lon):
    lon = lon % 360.0
    sign_idx = int(lon // 30)
    deg = int(lon % 30)
    minute = int(round((lon % 1.0) * 60))
    if minute == 60:
        minute = 0
        deg += 1
    return sign_idx, SIGN_NAMES[sign_idx], deg, minute


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--json", required=True, help="path to positions_sidereal.json")
    ap.add_argument("--utc", default=None, help="override reference moment (YYYY-MM-DDTHH:MM:SSZ)")
    ap.add_argument("--lat", type=float, default=None)
    ap.add_argument("--lon", type=float, default=None)
    args = ap.parse_args()

    data = json.load(open(args.json, encoding="utf-8"))
    utc = (args.utc or data["reference_moment_utc"]).rstrip("Z")
    t = datetime.datetime.fromisoformat(utc)
    jd = swe.julday(t.year, t.month, t.day, t.hour + t.minute / 60.0 + t.second / 3600.0)
    lat = args.lat if args.lat is not None else data["lat"]
    lon = args.lon if args.lon is not None else data["lon"]

    swe.set_ephe_path("")
    swe.set_sid_mode(swe.SIDM_LAHIRI)
    FLAGS = swe.FLG_MOSEPH | swe.FLG_SIDEREAL | swe.FLG_SPEED

    checks = 0
    fails = 0

    def check(cond, msg):
        nonlocal checks, fails
        checks += 1
        if not cond:
            fails += 1
            print("FAIL:", msg)

    ayan = swe.get_ayanamsa_ut(jd)
    check(abs(ayan - data["ayanamsa_deg"]) < 0.001,
          "ayanamsa %.6f != json %.6f" % (ayan, data["ayanamsa_deg"]))

    for p in data["planets"]:
        name = p["name"]
        if name == "Ketu":
            lon_p = (calc(jd, swe.MEAN_NODE, FLAGS)[0] + 180.0) % 360.0
            speed = None
        else:
            pos = calc(jd, PLANET_IDS[name], FLAGS)
            lon_p, speed = pos[0], pos[3]
        sign_idx, sign_name, deg, minute = fmt_pos(lon_p)
        check(abs(lon_p - p["longitude"]) < 0.01,
              "%s lon %.4f != json %.4f" % (name, lon_p, p["longitude"]))
        check(sign_name == p["sign"],
              "%s sign %s != json %s" % (name, sign_name, p["sign"]))
        check(deg == p["degree"] and minute == p["minute"],
              "%s deg/min %d/%d != json %d/%d" % (name, deg, minute, p["degree"], p["minute"]))
        if speed is not None:
            check(abs(speed - p["speed"]) < 0.005,
                  "%s speed %.4f != json %.4f" % (name, speed, p["speed"]))
            check((speed < 0) == p["retrograde"],
                  "%s retrograde %s != json %s" % (name, speed < 0, p["retrograde"]))
        else:
            check(p["retrograde"] is True, "Ketu retrograde flag")

    cusps, ascmc = swe.houses_ex(jd, lat, lon, b"P", FLAGS)
    lagna, mc = ascmc[0], ascmc[1]
    check(abs(lagna - data["lagna"]["longitude"]) < 0.01,
          "lagna %.4f != json %.4f" % (lagna, data["lagna"]["longitude"]))
    check(abs(mc - data["midheaven"]["longitude"]) < 0.01,
          "MC %.4f != json %.4f" % (mc, data["midheaven"]["longitude"]))

    cusps_full = list(cusps) + [cusps[0] + 360.0]
    for p in data["planets"]:
        lon_p = p["longitude"]
        house = None
        for i in range(12):
            c1, c2 = cusps_full[i], cusps_full[i + 1]
            if c1 <= lon_p < c2:
                house = i + 1
                break
        check(house == p["house"],
              "%s house %s != json %s (cusp pair %.4f..%.4f)"
              % (p["name"], house, p["house"], c1, c2))

    print("checks=%d fails=%d" % (checks, fails))
    sys.exit(1 if fails else 0)


if __name__ == "__main__":
    main()
