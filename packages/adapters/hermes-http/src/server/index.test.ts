import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync } from "node:fs";
import fs from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const { chatMock } = vi.hoisted(() => ({
  chatMock: vi.fn(),
}));

vi.mock("./http-client.js", () => ({
  AgentHttpConnection: class {
    constructor(_endpoint: string, _timeoutSec: number) {}
    async chat(request: unknown) {
      return chatMock(request);
    }
  },
}));

import { DEFAULT_HERMES_BASELINE_TOOLSETS, execute, resolveHermesToolsets } from "./index.js";

describe("resolveHermesToolsets", () => {
  it("returns undefined when toolsets is not configured", () => {
    expect(resolveHermesToolsets({})).toBeUndefined();
    expect(resolveHermesToolsets({ endpoint: "http://localhost:8765/api/v1" })).toBeUndefined();
  });

  it("returns the baseline alone for an empty configured list", () => {
    expect(resolveHermesToolsets({ toolsets: [] })).toEqual(DEFAULT_HERMES_BASELINE_TOOLSETS);
  });

  it("merges the baseline with configured toolsets, deduped, baseline first", () => {
    expect(resolveHermesToolsets({ toolsets: ["browser", "file"] })).toEqual([
      ...DEFAULT_HERMES_BASELINE_TOOLSETS,
      "browser",
    ]);
  });

  it("drops non-string entries from the configured list", () => {
    expect(resolveHermesToolsets({ toolsets: ["browser", 42] as unknown as string[] })).toEqual([
      ...DEFAULT_HERMES_BASELINE_TOOLSETS,
      "browser",
    ]);
  });
});

describe("hermes_http execute", () => {
  afterEach(() => {
    chatMock.mockReset();
  });

  it("forwards no toolsets when none are configured", async () => {
    chatMock.mockResolvedValue({
      session_id: "s1",
      response: "ok",
      exitCode: 0,
    });

    await execute({
      runId: "run1",
      agent: { id: "a1", companyId: "c1" } as never,
      runtime: {} as never,
      config: {},
      context: { prompt: "hello" },
      onLog: vi.fn(async () => {}),
    } as never);

    expect(chatMock).toHaveBeenCalledTimes(1);
    expect(chatMock.mock.calls[0][0].toolsets).toBeUndefined();
  });

  it("forwards the merged baseline when toolsets are configured", async () => {
    chatMock.mockResolvedValue({
      session_id: "s1",
      response: "ok",
      exitCode: 0,
    });

    await execute({
      runId: "run1",
      agent: { id: "a1", companyId: "c1" } as never,
      runtime: {} as never,
      config: { toolsets: ["browser"] },
      context: { prompt: "hello" },
      onLog: vi.fn(async () => {}),
    } as never);

    expect(chatMock).toHaveBeenCalledTimes(1);
    expect(chatMock.mock.calls[0][0].toolsets).toEqual([...DEFAULT_HERMES_BASELINE_TOOLSETS, "browser"]);
  });

  it("mirrors the contract result into resultJson", async () => {
    chatMock.mockResolvedValue({
      session_id: "s1",
      response: "done",
      exitCode: 0,
      contract: { passed: false, retries: 1, violations: ["max_output_chars"] },
    });

    const result = await execute({
      runId: "run1",
      agent: { id: "a1", companyId: "c1" } as never,
      runtime: {} as never,
      config: {},
      context: { prompt: "hello" },
      onLog: vi.fn(async () => {}),
    } as never);

    expect(result.resultJson.contract).toEqual({
      passed: false,
      retries: 1,
      violations: ["max_output_chars"],
    });
  });

  it("writes the structured transcript into the run log via onLog", async () => {
    chatMock.mockResolvedValue({
      session_id: "s1",
      response: "ok",
      exitCode: 0,
      transcript: [
        { kind: "thinking", text: "Root cause candidate." },
        { kind: "tool_call", name: "patch", input: { path: "Portfolio.jsx" }, toolUseId: "c1" },
        { kind: "tool_result", toolUseId: "c1", content: "ok", isError: false },
        { kind: "assistant", text: "Root cause found." },
      ],
    });

    const onLog = vi.fn(async () => {});
    await execute({
      runId: "run1",
      agent: { id: "a1", companyId: "c1" } as never,
      runtime: {} as never,
      config: {},
      context: { prompt: "hello" },
      onLog,
    } as never);

    expect(onLog).toHaveBeenCalledTimes(1);
    const [stream, body] = onLog.mock.calls[0] as unknown as [string, string];
    expect(stream).toBe("stdout");
    const lines = body.trim().split("\n");
    expect(lines).toHaveLength(4);
    expect(JSON.parse(lines[0]!)).toMatchObject({ kind: "thinking", text: "Root cause candidate." });
    expect(JSON.parse(lines[1]!)).toMatchObject({ kind: "tool_call", name: "patch" });
    expect(JSON.parse(lines[3]!)).toMatchObject({ kind: "assistant", text: "Root cause found." });
  });

  it("skips onLog when the transcript is absent", async () => {
    chatMock.mockResolvedValue({ session_id: "s1", response: "ok", exitCode: 0 });
    const onLog = vi.fn(async () => {});
    await execute({
      runId: "run1",
      agent: { id: "a1", companyId: "c1" } as never,
      runtime: {} as never,
      config: {},
      context: { prompt: "hello" },
      onLog,
    } as never);

    expect(onLog).not.toHaveBeenCalled();
  });

  it("mirrors the run error into resultJson", async () => {
    chatMock.mockResolvedValue({
      session_id: "s1",
      response: "",
      exitCode: 1,
      error: "model credit error",
    });

    const result = await execute({
      runId: "run1",
      agent: { id: "a1", companyId: "c1" } as never,
      runtime: {} as never,
      config: {},
      context: { prompt: "hello" },
      onLog: vi.fn(async () => {}),
    } as never);

    expect(result.exitCode).toBe(1);
    expect(result.resultJson.error).toBe("model credit error");
  });

  it("forwards workMode and issueId from paperclipIssue context", async () => {
    chatMock.mockResolvedValue({
      session_id: "s1",
      response: "ok",
      exitCode: 0,
    });

    await execute({
      runId: "run1",
      agent: { id: "a1", companyId: "c1" } as never,
      runtime: {} as never,
      config: {},
      context: {
        prompt: "hello",
        paperclipIssue: { id: "issue-9", workMode: "planning", title: "Plan first" },
      },
      onLog: vi.fn(async () => {}),
    } as never);

    expect(chatMock).toHaveBeenCalledTimes(1);
    expect(chatMock.mock.calls[0][0].workMode).toBe("planning");
    expect(chatMock.mock.calls[0][0].issueId).toBe("issue-9");
  });

  it("omits workMode and issueId when paperclipIssue is absent", async () => {
    chatMock.mockResolvedValue({
      session_id: "s1",
      response: "ok",
      exitCode: 0,
    });

    await execute({
      runId: "run1",
      agent: { id: "a1", companyId: "c1" } as never,
      runtime: {} as never,
      config: {},
      context: { prompt: "hello" },
      onLog: vi.fn(async () => {}),
    } as never);

    expect(chatMock.mock.calls[0][0].workMode).toBeUndefined();
    expect(chatMock.mock.calls[0][0].issueId).toBeUndefined();
  });

  it("survives a failed skills fetch: wake completes, gate stays deny-closed, disk untouched", async () => {
    chatMock.mockResolvedValue({
      session_id: "s1",
      response: "ok",
      exitCode: 0,
    });
    const tmp = mkdtempSync(path.join(tmpdir(), "hexec-"));
    vi.stubEnv("HOME", tmp);
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new Error("paperclip down");
    }));
    try {
      await execute({
        runId: "run1",
        agent: { id: "a9", companyId: "c9" } as never,
        runtime: {} as never,
        config: { apiUrl: "http://127.0.0.1:3100", apiKey: "k" },
        context: { prompt: "hello" },
        onLog: vi.fn(async () => {}),
      } as never);

      expect(chatMock).toHaveBeenCalledTimes(1);
      // fail-closed: no assignment could be established
      expect(chatMock.mock.calls[0][0].assignedSkills).toEqual([]);
      // ...but last-known disk state is preserved (no per-agent dir created)
      await expect(fs.lstat(path.join(tmp, ".hermes", "skills", "@a9"))).rejects.toThrow();
    } finally {
      vi.unstubAllGlobals();
      vi.unstubAllEnvs();
    }
  });
});
