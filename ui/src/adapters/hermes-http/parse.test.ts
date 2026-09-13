import { describe, expect, it } from "vitest";
import { parseHermesHttpStdoutLine } from "./parse";

const TS = "2026-08-15T16:49:44.436Z";

describe("parseHermesHttpStdoutLine", () => {
  it("decodes structured thinking and assistant lines", () => {
    const thinking = parseHermesHttpStdoutLine(
      JSON.stringify({ kind: "thinking", text: "Root cause candidate: missing useMemo deps." }),
      TS,
    );
    expect(thinking).toEqual([{ kind: "thinking", ts: TS, text: "Root cause candidate: missing useMemo deps." }]);

    const assistant = parseHermesHttpStdoutLine(
      JSON.stringify({ kind: "assistant", text: "Root cause found: missing deps." }),
      TS,
    );
    expect(assistant).toEqual([{ kind: "assistant", ts: TS, text: "Root cause found: missing deps." }]);
  });

  it("decodes structured tool_call and tool_result pairs with real inputs", () => {
    const call = parseHermesHttpStdoutLine(
      JSON.stringify({
        kind: "tool_call",
        name: "patch",
        input: { path: "src/pages/Portfolio.jsx" },
        toolUseId: "call_1",
      }),
      TS,
    );
    expect(call).toEqual([
      {
        kind: "tool_call",
        ts: TS,
        name: "patch",
        input: { path: "src/pages/Portfolio.jsx" },
        toolUseId: "call_1",
      },
    ]);

    const result = parseHermesHttpStdoutLine(
      JSON.stringify({ kind: "tool_result", toolUseId: "call_1", content: "ok", isError: false }),
      TS,
    );
    expect(result).toEqual([{ kind: "tool_result", ts: TS, toolUseId: "call_1", content: "ok", isError: false }]);
  });

  it("decodes structured stderr and preserves the entry ts when present", () => {
    const stderr = parseHermesHttpStdoutLine(
      JSON.stringify({ kind: "stderr", text: "Traceback: boom", ts: "2026-08-15T16:50:00.000Z" }),
      TS,
    );
    expect(stderr).toEqual([{ kind: "stderr", ts: "2026-08-15T16:50:00.000Z", text: "Traceback: boom" }]);
  });

  it("falls back to the upstream parser for non-structured lines", () => {
    const system = parseHermesHttpStdoutLine('[paperclip] Using company workspace "D:\\Dev\\appZeno\\appZeno-web"', TS);
    expect(system).toEqual([{ kind: "system", ts: TS, text: '[paperclip] Using company workspace "D:\\Dev\\appZeno\\appZeno-web"' }]);
  });

  it("falls back to the upstream parser for invalid JSON", () => {
    const plain = parseHermesHttpStdoutLine("┊ 💬 A regular assistant reply", TS);
    expect(plain).toEqual([{ kind: "assistant", ts: TS, text: "A regular assistant reply" }]);
  });

  it("ignores blank lines", () => {
    expect(parseHermesHttpStdoutLine("", TS)).toEqual([]);
    expect(parseHermesHttpStdoutLine("   ", TS)).toEqual([]);
  });
});
