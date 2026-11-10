#!/usr/bin/env python3
"""Compute exact new/full moon instants + zodiac placement — Meeus, Astronomical
Algorithms 2nd ed., ch. 49 (lunar phases) + ch. 25 (solar longitude). Stdlib-only;
no Swiss Ephemeris required. Verified SDS-83 (2026-09-04): New Moon in Virgo 18.4 deg,
Fri 2026-09-11 03:32:50 UTC; anchor check — previous new moon 2026-08-12 17:42:57 UTC
= the known total solar eclipse.

PITFALLS (learned the hard way on SDS-83):
- jd_to_utc year formula: year = C - 4716 if month > 2 else C - 4715.
  Inverting it shifts every date by +1 calendar year.
- Derive weekdays from the computed datetime; never state them from memory.
- Anchor-verify against a known event (eclipse) before trusting the series.
"""
import argparse, datetime, math


def jd_to_utc(jd):
    jd = jd + 0.5
    Z = int(jd)
    F = jd - Z
    if Z < 2299161:
        A = Z
    else:
        alpha = int((Z - 1867216.25) / 36524.25)
        A = Z + 1 + alpha - int(alpha / 4)
    B = A + 1524
    C = int((B - 122.1) / 365.25)
    D = int(365.25 * C)
    E = int((B - D) / 30.6001)
    day = B - D - int(30.6001 * E) + F
    month = E - 1 if E < 14 else E - 13
    year = C - 4716 if month > 2 else C - 4715   # DO NOT invert: +1yr shift
    d = int(day)
    frac = day - d
    total_sec = round(frac * 86400)
    return datetime.datetime(year, month, d, total_sec // 3600,
                             (total_sec % 3600) // 60, total_sec % 60)


def phase_time(k):
    """JDE of a lunar phase: integer k = new moon, k+0.5 = full moon."""
    T = k / 1236.85
    JDE = (2451550.09766 + 29.530588861 * k + 0.00015437 * T**2
           - 0.000000150 * T**3 + 0.00000000073 * T**4)
    E = 1 - 0.002516 * T - 0.0000074 * T**2
    def r(x):
        return math.radians(x)
    M = r(2.5534 + 29.10535670 * k - 0.0000014 * T**2)
    Mp = r(201.5643 + 385.81693528 * k + 0.0107582 * T**2
           + 0.00001238 * T**3 - 0.000000058 * T**4)
    F = r(160.7108 + 390.67050284 * k - 0.0016118 * T**2
          - 0.00000227 * T**3 + 0.000000011 * T**4)
    Om = r(124.7746 - 1.56375588 * k + 0.0020672 * T**2 + 0.00000215 * T**3)
    corr = (-0.40720 * math.sin(Mp)
            + 0.17241 * E * math.sin(M)
            + 0.01608 * math.sin(2 * Mp)
            + 0.01039 * math.sin(2 * F)
            + 0.00739 * E * math.sin(Mp - M)
            - 0.00514 * E * math.sin(Mp + M)
            + 0.00208 * E * E * math.sin(2 * M)
            - 0.00111 * math.sin(Mp - 2 * F)
            - 0.00057 * math.sin(Mp + 2 * F)
            + 0.00056 * E * math.sin(2 * Mp + M)
            - 0.00042 * math.sin(3 * Mp)
            + 0.00042 * E * math.sin(M + 2 * F)
            + 0.00038 * E * math.sin(M - 2 * F)
            - 0.00024 * E * math.sin(2 * Mp - M)
            - 0.00017 * math.sin(Om)
            - 0.00007 * math.sin(Mp + 2 * M)
            + 0.00004 * math.sin(2 * Mp - 2 * F)
            + 0.00004 * math.sin(3 * M)
            + 0.00003 * math.sin(Mp + M - 2 * F)
            + 0.00003 * math.sin(2 * Mp + 2 * F)
            - 0.00003 * math.sin(Mp + M + 2 * F)
            + 0.00003 * math.sin(Mp - M + 2 * F)
            - 0.00002 * math.sin(Mp - M - 2 * F)
            - 0.00002 * math.sin(3 * Mp + M)
            + 0.00002 * math.sin(4 * Mp))
    # Table 49.B additional planetary terms + W term
    W = (0.00306 - 0.00038 * E * math.cos(M) + 0.00026 * math.cos(Mp)
         - 0.00002 * math.cos(Mp - M) + 0.00002 * math.cos(Mp + M)
         + 0.00002 * math.cos(2 * F))
    corr += W
    corr += 0.000325 * math.sin(r(299.77 + 0.107408 * k - 0.009173 * T**2))
    corr += 0.000165 * math.sin(r(251.88 + 0.016321 * k))
    corr += 0.000164 * math.sin(r(251.83 + 26.651886 * k))
    corr += 0.000126 * math.sin(r(349.42 + 36.412478 * k))
    corr += 0.000110 * math.sin(r(84.66 + 18.206239 * k))
    corr += 0.000062 * math.sin(r(141.74 + 53.303771 * k))
    corr += 0.000060 * math.sin(r(207.14 + 2.453732 * k))
    corr += 0.000056 * math.sin(r(154.84 + 7.306860 * k))
    corr += 0.000047 * math.sin(r(34.52 + 27.261239 * k))
    corr += 0.000042 * math.sin(r(207.19 + 0.121824 * k))
    corr += 0.000040 * math.sin(r(291.34 + 1.844379 * k))
    corr += 0.000037 * math.sin(r(161.72 + 24.198154 * k))
    corr += 0.000035 * math.sin(r(239.56 + 25.513099 * k))
    corr += 0.000023 * math.sin(r(331.55 + 3.592518 * k))
    return JDE + corr


def sun_longitude(jd):
    """Apparent solar longitude (deg) — Meeus ch. 25, truncated (~0.01 deg)."""
    T = (jd - 2451545.0) / 36525.0
    L0 = 280.46646 + 36000.76983 * T + 0.0003032 * T**2
    M = math.radians(357.52911 + 35999.05029 * T - 0.0001537 * T**2)
    C = ((1.914602 - 0.004817 * T - 0.000014 * T**2) * math.sin(M)
         + (0.019993 - 0.000101 * T) * math.sin(2 * M)
         + 0.000289 * math.sin(3 * M))
    Om = math.radians(125.04 - 1934.136 * T)
    return (L0 + C - 0.00569 - 0.00478 * math.sin(Om)) % 360.0


SIGNS = ["Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo",
         "Libra", "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces"]


def placement(lon):
    i = int(lon // 30)
    return "%s %.1f deg" % (SIGNS[i], lon - i * 30)


def events_after(jd0, phase_offset, n):
    """Next n events after jd0: phase_offset 0.0 = new moon, 0.5 = full moon."""
    k = math.floor((jd0 - 2451550.09766) / 29.530588861) + phase_offset
    out = []
    while len(out) < n:
        jde = phase_time(k)
        if jde > jd0:
            t = jd_to_utc(jde)
            sun = sun_longitude(jde)
            moon = (sun + 180.0 * phase_offset) % 360.0
            out.append((t, placement(moon), jde))
        k += 1
    return out


def main():
    ap = argparse.ArgumentParser(description="Meeus lunar-phase events (stdlib-only)")
    ap.add_argument("--date", default=datetime.date.today().isoformat(),
                    help="reference date YYYY-MM-DD (UTC noon)")
    ap.add_argument("--count", type=int, default=3)
    args = ap.parse_args()
    ref = datetime.datetime.strptime(args.date, "%Y-%m-%d").replace(hour=12)
    jd0 = 2451545.0 + (ref - datetime.datetime(2000, 1, 1, 12)).total_seconds() / 86400.0
    print("reference: %s UTC (JD %.3f)" % (ref, jd0))
    anchor_t, anchor_p, _ = events_after(jd0 - 40.0, 0.0, 1)[0]
    print("anchor (new moon before ref - check vs known eclipse): %s  [%s]"
          % (anchor_t, anchor_p))
    for label, off in (("NEW MOON", 0.0), ("FULL MOON", 0.5)):
        print("\n%sS after %s:" % (label, args.date))
        for t, p, jde in events_after(jd0, off, args.count):
            print("  %s UTC (JD %.5f)  %s" % (t, jde, p))


if __name__ == "__main__":
    main()