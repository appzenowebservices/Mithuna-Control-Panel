import { describe, expect, it } from "vitest";
import {
  HERMES_SESSION_MAX_HISTORY,
  HERMES_SESSION_TTL_DAYS,
  hermesSessionExpiryCutoff,
  isHermesSessionExpired,
  normalizeHermesSnapshot,
} from "./hermes-sessions.js";

describe("normalizeHermesSnapshot", () => {
  it("rejects non-objects and unserializable input", () => {
    expect(normalizeHermesSnapshot(null).error).toBeTruthy();
    expect(normalizeHermesSnapshot([1, 2]).error).toBeTruthy();
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(normalizeHermesSnapshot(circular).error).toBeTruthy();
  });

  it("keeps the tail of an oversized history and drops non-objects", () => {
    const history = Array.from({ length: HERMES_SESSION_MAX_HISTORY + 50 }, (_, i) => ({ role: "user", i }));
    const input = { model: "m", provider: "p", skills: ["a"], conversation_history: [...history, 42, "nope"] };
    const { snapshot, error } = normalizeHermesSnapshot(input);
    expect(error).toBeUndefined();
    const kept = snapshot!.conversation_history as unknown[];
    expect(kept).toHaveLength(HERMES_SESSION_MAX_HISTORY);
    expect((kept[0] as { i: number }).i).toBe(50);
  });

  it("strips mistyped model/provider/skills fields", () => {
    const { snapshot } = normalizeHermesSnapshot({ model: 7, provider: null, skills: "x", conversation_history: [] });
    expect(snapshot).toEqual({ conversation_history: [] });
  });
});

describe("isHermesSessionExpired", () => {
  it("expires rows older than the TTL", () => {
    expect(isHermesSessionExpired(new Date(Date.now() - 31 * 24 * 60 * 60 * 1000))).toBe(true);
    expect(isHermesSessionExpired(new Date())).toBe(false);
    expect(isHermesSessionExpired(new Date(Date.now() - 1000), 0)).toBe(true);
  });
});

describe("hermesSessionExpiryCutoff", () => {
  it("sits TTL days in the past and agrees with the expiry predicate", () => {
    const cutoff = hermesSessionExpiryCutoff();
    const ageDays = (Date.now() - cutoff.getTime()) / (24 * 60 * 60 * 1000);
    expect(ageDays).toBeCloseTo(HERMES_SESSION_TTL_DAYS, 3);
    expect(isHermesSessionExpired(new Date(cutoff.getTime() - 1000))).toBe(true);
    expect(isHermesSessionExpired(new Date(cutoff.getTime() + 60 * 1000))).toBe(false);
  });
});
