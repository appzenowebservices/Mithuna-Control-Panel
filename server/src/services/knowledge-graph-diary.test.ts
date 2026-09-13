import { describe, expect, it } from "vitest";
import {
  KG_HOUSES,
  applyPruneGate,
  buildManualBlock,
  kgDistilledDates,
  kgSeedDay,
  kgSeedHouses,
  kgSeedSelf,
  kgTodayUtc,
  kgValidDate,
  parseDiaryRegions,
} from "./knowledge-graph-diary.js";

function fileWith(selfInner: string, days: Array<[string, string]>): string {
  return [
    `<!-- KG:SELF-START -->${selfInner}<!-- KG:SELF-END -->`,
    ...days.map(([d, b]) => `<!-- KG:DAY:${d}-START -->${b}<!-- KG:DAY:${d}-END -->`),
    "<!-- KG:GENERATED-START -->\nold graph\n<!-- KG:GENERATED-END -->",
  ].join("\n\n");
}

describe("kgValidDate", () => {
  it("accepts real UTC dates and rejects the rest", () => {
    expect(kgValidDate("2026-09-03")).toBe(true);
    expect(kgValidDate("2026-13-01")).toBe(false);
    expect(kgValidDate("2026-02-30")).toBe(false);
    expect(kgValidDate("not-a-date")).toBe(false);
    expect(kgValidDate("2026-9-3")).toBe(false);
  });
});

describe("kgTodayUtc", () => {
  it("uses UTC, not local time", () => {
    expect(kgTodayUtc(new Date("2026-09-03T00:30:00.000Z"))).toBe("2026-09-03");
  });
});

describe("parseDiaryRegions", () => {
  it("extracts Self byte-identical and every valid day section", () => {
    const self = "\n## [[Self]]\n\nI am Astrologer.\n";
    const text = fileWith(self, [
      ["2026-09-03", "\n## 2026-09-03\n\n- wake 1\n"],
      ["2026-09-02", "\n## 2026-09-02\n\n- wake 9\n"],
    ]);
    const { selfBody, daySections } = parseDiaryRegions(text);
    expect(selfBody).toBe(self);
    expect([...daySections.keys()].sort()).toEqual(["2026-09-02", "2026-09-03"]);
  });

  it("ignores malformed day markers and keeps the first duplicate", () => {
    const text = [
      "<!-- KG:DAY:2026-13-99-START -->x<!-- KG:DAY:2026-13-99-END -->",
      "<!-- KG:DAY:2026-09-03-START -->first<!-- KG:DAY:2026-09-03-END -->",
      "<!-- KG:DAY:2026-09-03-START -->second<!-- KG:DAY:2026-09-03-END -->",
    ].join("\n");
    const { selfBody, daySections } = parseDiaryRegions(text);
    expect(selfBody).toBeNull();
    expect(daySections.get("2026-09-03")).toBe("first");
    expect(daySections.has("2026-13-99")).toBe(false);
  });

  it("returns empty regions for a fresh file", () => {
    const { selfBody, daySections } = parseDiaryRegions("# Knowledge Graph\n");
    expect(selfBody).toBeNull();
    expect(daySections.size).toBe(0);
  });
});

describe("kgDistilledDates", () => {
  it("collects valid distilled markers only", () => {
    const self = "story\ndistilled: 2026-08-27\ndistilled: nope\ndistilled: 2026-02-30\n";
    expect([...kgDistilledDates(self)]).toEqual(["2026-08-27"]);
  });
});

describe("applyPruneGate", () => {
  it("prunes distilled days older than 7 UTC days, retains the rest", () => {
    const days = new Map<string, string>([
      ["2026-08-20", "old distilled"],
      ["2026-08-21", "old undistilled"],
      ["2026-08-28", "within window"],
    ]);
    const self = "story\ndistilled: 2026-08-20\n";
    // today 2026-09-03 → cutoff 2026-08-28; older: 08-20, 08-21
    const { prunedDays, pendingDistill } = applyPruneGate(days, self, "2026-09-03");
    expect(prunedDays).toEqual(["2026-08-20"]);
    expect(pendingDistill).toEqual(["2026-08-21"]);
    expect(days.has("2026-08-20")).toBe(false);
    expect(days.has("2026-08-21")).toBe(true);
    expect(days.has("2026-08-28")).toBe(true);
  });

  it("never drops undistilled days, even very old ones", () => {
    const days = new Map<string, string>([["2026-01-01", "ancient"]]);
    const { prunedDays, pendingDistill } = applyPruneGate(days, "no markers", "2026-09-03");
    expect(prunedDays).toEqual([]);
    expect(pendingDistill).toEqual(["2026-01-01"]);
    expect(days.has("2026-01-01")).toBe(true);
  });

  it("seeds today when missing", () => {
    const days = new Map<string, string>();
    applyPruneGate(days, null, "2026-09-03");
    expect(days.has("2026-09-03")).toBe(true);
  });
});

describe("buildManualBlock", () => {
  it("seeds Self + today on a fresh file", () => {
    const days = new Map<string, string>([["2026-09-03", "\n## 2026-09-03\n\nx\n"]]);
    const md = buildManualBlock(null, days, "Astrologer");
    expect(md).toContain("<!-- KG:SELF-START -->");
    expect(md).toContain("I am Astrologer");
    expect(md).toContain("<!-- KG:DAY:2026-09-03-START -->");
  });

  it("round-trips: build → parse returns identical regions", () => {
    const self = "\n## [[Self]]\n\nstory distilled: 2026-08-20\n";
    const days = new Map<string, string>([
      ["2026-09-02", "\n## 2026-09-02\n\n- a\n"],
      ["2026-09-03", "\n## 2026-09-03\n\n- b\n"],
    ]);
    const md = buildManualBlock(self, days, "Astrologer");
    const parsed = parseDiaryRegions(md);
    expect(parsed.selfBody).toBe(self);
    expect(parsed.daySections.get("2026-09-02")).toBe("\n## 2026-09-02\n\n- a\n");
    expect(parsed.daySections.get("2026-09-03")).toBe("\n## 2026-09-03\n\n- b\n");
  });
});

describe("seeds", () => {
  it("seed helpers produce parseable regions", () => {
    const md = [kgSeedSelf("Astrologer"), kgSeedDay("2026-09-03")].join("\n\n");
    const { selfBody, daySections } = parseDiaryRegions(md);
    expect(selfBody).toContain("I am Astrologer");
    expect(daySections.has("2026-09-03")).toBe(true);
  });
});

describe("twelve houses", () => {
  it("defines exactly 12 Vedic domains with daily routines at house 6", () => {
    expect(KG_HOUSES).toHaveLength(12);
    expect(KG_HOUSES.map((h) => h.n)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(KG_HOUSES[5].domain).toMatch(/daily routines/);
  });

  it("seeds houses on fresh files and preserves custom house lines", () => {
    const md = buildManualBlock(null, new Map([["2026-09-03", "\n## 2026-09-03\n\nx\n"]]), "Astrologer");
    expect(md).toContain("<!-- KG:HOUSES-START -->");
    expect(md).toContain("House 6 — Routines & Service");
    const parsed = parseDiaryRegions(md);
    expect(parsed.housesBody).toContain("House 1 — Self");
    const edited = (parsed.housesBody as string).replace(
      "House 6 — Routines & Service",
      "House 6 — Routines & Service — runs every heartbeat",
    );
    const rebuilt = buildManualBlock(parsed.selfBody, parsed.daySections, "Astrologer", edited);
    expect(rebuilt).toContain("runs every heartbeat");
    expect(rebuilt).not.toContain("House 6 — Routines & Service:");
  });
});
