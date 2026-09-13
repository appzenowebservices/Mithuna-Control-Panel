// KNOWLEDGE_GRAPH diary regions — pure helpers (no I/O, no deps).
//
// The file has marked manual regions the agent owns ([[Self]] diary + dated
// UTC day sections) and one generated region the refresh rebuilds. Refresh
// parses + preserves manual regions byte-identical; only the generated block
// is rewritten. Day sections older than 7 UTC days are pruned ONLY when Self
// carries a `distilled: YYYY-MM-DD` marker — nothing undistilled is dropped.

export const KG_SELF_START = "<!-- KG:SELF-START -->";
export const KG_SELF_END = "<!-- KG:SELF-END -->";
export const KG_HOUSES_START = "<!-- KG:HOUSES-START -->";
export const KG_HOUSES_END = "<!-- KG:HOUSES-END -->";
export const KG_GENERATED_START = "<!-- KG:GENERATED-START -->";
export const KG_GENERATED_END = "<!-- KG:GENERATED-END -->";

// Twelve Houses (Vedic life domains) — fixed skeleton seeded into every
// graph. Diary entries tag `house: N`; a house line is rewritten only when
// something durable changed there. Deep house meanings belong to the SOUL
// phase; this index is the stable addressing scheme.
export const KG_HOUSES: Array<{ n: number; name: string; domain: string }> = [
  { n: 1, name: "Self", domain: "identity, body, beginnings" },
  { n: 2, name: "Wealth & Speech", domain: "money, possessions, voice, values" },
  { n: 3, name: "Courage & Kin", domain: "initiative, siblings, short efforts" },
  { n: 4, name: "Home & Roots", domain: "home, mother, inner stability" },
  { n: 5, name: "Creativity & Joy", domain: "art, children, romance, play" },
  { n: 6, name: "Routines & Service", domain: "daily routines, health, work, service" },
  { n: 7, name: "Partnership", domain: "spouse, allies, contracts, open rivals" },
  { n: 8, name: "Transformation", domain: "crises, shared resources, renewing endings" },
  { n: 9, name: "Dharma & Fortune", domain: "purpose, teachers, luck, long journeys" },
  { n: 10, name: "Career & Standing", domain: "work, reputation, authority" },
  { n: 11, name: "Gains & Network", domain: "friends, allies, income from work" },
  { n: 12, name: "Rest & Release", domain: "sleep, solitude, foreign lands, letting go" },
];

const KG_DAY_RE = /<!-- KG:DAY:(\d{4}-\d{2}-\d{2})-START -->([\s\S]*?)<!-- KG:DAY:\1-END -->/g;
const KG_SELF_RE = /<!-- KG:SELF-START -->([\s\S]*?)<!-- KG:SELF-END -->/;
const KG_HOUSES_RE = /<!-- KG:HOUSES-START -->([\s\S]*?)<!-- KG:HOUSES-END -->/;
const KG_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function kgValidDate(s: string): boolean {
  const m = KG_DATE_RE.exec(s);
  if (!m) return false;
  const d = new Date(`${s}T00:00:00.000Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

export function kgTodayUtc(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export function kgSeedSelf(agentName: string): string {
  return `${KG_SELF_START}
## [[Self]]

> Autobiography — read whole, then rewrite/extend from what you just lived. Extend, never delete the past.
> When you distill a day into this story, record \`distilled: YYYY-MM-DD\` so refresh may prune it.

_I am ${agentName}. My story starts here._
${KG_SELF_END}`;
}

export function kgSeedDay(date: string): string {
  return `<!-- KG:DAY:${date}-START -->
## ${date}

_No entries yet._
<!-- KG:DAY:${date}-END -->`;
}

const KG_HOUSE_SKILLS: Record<number, string> = {
  1: "hermes self-help",
  2: "finance, packages, builds",
  3: "comms, docs, screenshots",
  4: "infra, storage, memory",
  5: "all creative/media",
  6: "testing, debugging, maintenance",
  7: "git/collab, hiring",
  8: "security, migration, recovery",
  9: "research, models, planning",
  10: "ops, leadership, publishing",
  11: "runners, teams, meetings",
  12: "teardown, archiving",
};

export function kgSeedHouses(): string {
  const lines = KG_HOUSES.map(
    (h) => `- House ${h.n} — ${h.name}: ${h.domain}; skills: ${KG_HOUSE_SKILLS[h.n] ?? "—"}.`,
  );
  return `${KG_HOUSES_START}
## Twelve Houses

> Fixed life domains. Tag diary entries like \`house: 6\`. Rewrite a house line only when something durable changed there; deep meanings belong to the SOUL phase.

${lines.join("\n")}
${KG_HOUSES_END}`;
}

export function kgDistilledDates(selfBody: string): Set<string> {
  const out = new Set<string>();
  const re = /distilled:\s*(\d{4}-\d{2}-\d{2})/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(selfBody)) !== null) {
    if (kgValidDate(m[1])) out.add(m[1]);
  }
  return out;
}

export interface DiaryRegions {
  selfBody: string | null;
  housesBody: string | null;
  daySections: Map<string, string>;
}

export function parseDiaryRegions(existingText: string): DiaryRegions {
  const selfMatch = KG_SELF_RE.exec(existingText);
  const housesMatch = KG_HOUSES_RE.exec(existingText);
  const daySections = new Map<string, string>();
  const dayRe = new RegExp(KG_DAY_RE.source, "g");
  let dm: RegExpExecArray | null;
  while ((dm = dayRe.exec(existingText)) !== null) {
    if (kgValidDate(dm[1]) && !daySections.has(dm[1])) daySections.set(dm[1], dm[2]);
  }
  return {
    selfBody: selfMatch ? selfMatch[1] : null,
    housesBody: housesMatch ? housesMatch[1] : null,
    daySections,
  };
}

export interface PruneResult {
  prunedDays: string[];
  pendingDistill: string[];
}

/** Drop days older than 7 UTC days only when distilled; ensure today exists. */
export function applyPruneGate(
  daySections: Map<string, string>,
  selfBody: string | null,
  today: string,
): PruneResult {
  const cutoff = new Date(`${today}T00:00:00.000Z`).getTime() - 6 * 86400000;
  const distilled = selfBody ? kgDistilledDates(selfBody) : new Set<string>();
  const prunedDays: string[] = [];
  const pendingDistill: string[] = [];
  for (const date of [...daySections.keys()].sort()) {
    if (new Date(`${date}T00:00:00.000Z`).getTime() < cutoff) {
      if (distilled.has(date)) {
        daySections.delete(date);
        prunedDays.push(date);
      } else {
        pendingDistill.push(date);
      }
    }
  }
  if (!daySections.has(today)) daySections.set(today, `\n## ${today}\n\n_No entries yet.\n`);
  return { prunedDays, pendingDistill };
}

export function buildManualBlock(
  selfBody: string | null,
  daySections: Map<string, string>,
  agentName: string,
  housesBody?: string | null,
): string {
  const ordered = [...daySections.entries()].sort(([a], [b]) => (a < b ? -1 : 1));
  return [
    selfBody !== null ? `${KG_SELF_START}${selfBody}${KG_SELF_END}` : kgSeedSelf(agentName),
    housesBody !== null && housesBody !== undefined
      ? `${KG_HOUSES_START}${housesBody}${KG_HOUSES_END}`
      : kgSeedHouses(),
    ...ordered.map(([date, body]) => `<!-- KG:DAY:${date}-START -->${body}<!-- KG:DAY:${date}-END -->`),
  ].join("\n\n");
}
