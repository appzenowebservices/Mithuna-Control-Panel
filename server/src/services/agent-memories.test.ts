import { afterEach, describe, expect, it } from "vitest";
import { contentHashForMemory, parseDayBullets } from "./agent-memories.js";
import {
  HASH_EMBEDDING_MODEL,
  MEMORY_EMBEDDING_DIMS,
  activeEmbeddingModel,
  hashEmbed,
  resolveEmbedStrategy,
} from "./memory-embedder.js";

describe("contentHashForMemory", () => {
  it("is deterministic and separates kinds", () => {
    const a = contentHashForMemory("day_entry", "- hello");
    expect(a).toBe(contentHashForMemory("day_entry", "- hello"));
    expect(a).not.toBe(contentHashForMemory("fact", "- hello"));
    expect(a).not.toBe(contentHashForMemory("day_entry", "- hello!"));
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("parseDayBullets", () => {
  it("extracts entries, skips headers and the empty placeholder", () => {
    const body = "\n## 2026-09-04\n\n_No entries yet.\n- 11:37 UTC wake: did X [[SDS-1]]\n- 11:41 UTC wake: did Y\n";
    expect(parseDayBullets(body)).toEqual([
      "- 11:37 UTC wake: did X [[SDS-1]]",
      "- 11:41 UTC wake: did Y",
    ]);
  });

  it("returns nothing for an untouched day", () => {
    expect(parseDayBullets("\n## 2026-09-04\n\n_No entries yet._\n")).toEqual([]);
    expect(parseDayBullets("")).toEqual([]);
  });
});

describe("hashEmbed (default, no model, no network)", () => {
  const cosine = (a: number[], b: number[]) => {
    let dot = 0;
    for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
    return dot; // inputs are L2-normalized
  };

  it("is deterministic, correctly sized, and L2-normalized", () => {
    const a = hashEmbed("new moon in virgo restart");
    const b = hashEmbed("new moon in virgo restart");
    expect(a).toHaveLength(MEMORY_EMBEDDING_DIMS);
    expect(a).toEqual(b);
    const norm = Math.sqrt(a.reduce((s, v) => s + v * v, 0));
    expect(norm).toBeCloseTo(1, 6);
    expect(cosine(a, b)).toBeCloseTo(1, 6);
  });

  it("ranks related texts above unrelated ones", () => {
    const query = hashEmbed("new moon virgo");
    const related = hashEmbed("new moon in virgo restart calendar");
    const unrelated = hashEmbed("ffmpeg render pipeline captions upload");
    expect(cosine(query, related)).toBeGreaterThan(cosine(query, unrelated));
  });

  it("handles empty input without NaNs", () => {
    const v = hashEmbed("   ");
    expect(v).toHaveLength(MEMORY_EMBEDDING_DIMS);
    expect(v.every((x) => Number.isFinite(x))).toBe(true);
  });
});

describe("embed strategy resolution", () => {
  const saved = { ...process.env };
  afterEach(() => {
    for (const key of Object.keys(process.env)) {
      if (!(key in saved)) delete process.env[key];
    }
    Object.assign(process.env, saved);
  });

  it("defaults to hash (no daemon, no key)", () => {
    delete process.env.MEMORY_EMBEDDINGS;
    expect(resolveEmbedStrategy()).toBe("hash");
    expect(activeEmbeddingModel()).toBe(HASH_EMBEDDING_MODEL);
  });

  it("honours off and provider modes", () => {
    process.env.MEMORY_EMBEDDINGS = "off";
    expect(resolveEmbedStrategy()).toBe("off");
    expect(activeEmbeddingModel()).toBeNull();
    process.env.MEMORY_EMBEDDINGS = "provider";
    delete process.env.MEMORY_EMBED_MODEL;
    expect(activeEmbeddingModel()).toBeNull();
    process.env.MEMORY_EMBED_MODEL = "text-embedding-3-small";
    expect(activeEmbeddingModel()).toBe("text-embedding-3-small@768");
  });
});
