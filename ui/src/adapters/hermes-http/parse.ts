import type { TranscriptEntry } from "../types";
import { parseHermesStdoutLine } from "hermes-paperclip-adapter/ui";

const STRUCTURED_KINDS = new Set([
  "thinking",
  "assistant",
  "tool_call",
  "tool_result",
  "stderr",
  "system",
  "stdout",
]);

/**
 * Parse a single run-log line for the hermes_http adapter.
 *
 * The HTTP adapter persists a structured transcript (one JSON object per line,
 * produced by the hermes server's `_build_transcript`) directly into the run
 * log, so this parser decodes those lines into rich TranscriptEntry objects
 * (thinking / assistant / tool_call / tool_result with the real inputs).
 * Any non-structured line (system notices, legacy CLI output) falls back to
 * the upstream `parseHermesStdoutLine`.
 */
export function parseHermesHttpStdoutLine(line: string, ts: string): TranscriptEntry[] {
  const trimmed = line.trim();
  if (!trimmed) return [];

  if (trimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(trimmed) as Record<string, unknown>;
      if (parsed && typeof parsed.kind === "string" && STRUCTURED_KINDS.has(parsed.kind)) {
        return [structuredEntry(parsed, ts)];
      }
    } catch {
      // Not valid JSON — fall through to the upstream parser.
    }
  }

  return parseHermesStdoutLine(line, ts);
}

function structuredEntry(parsed: Record<string, unknown>, fallbackTs: string): TranscriptEntry {
  const kind = parsed.kind as TranscriptEntry["kind"];
  const ts = typeof parsed.ts === "string" && parsed.ts.length > 0 ? parsed.ts : fallbackTs;

  switch (kind) {
    case "thinking":
      return { kind: "thinking", ts, text: String(parsed.text ?? "") };
    case "assistant":
      return { kind: "assistant", ts, text: String(parsed.text ?? "") };
    case "tool_call":
      return {
        kind: "tool_call",
        ts,
        name: typeof parsed.name === "string" && parsed.name.length > 0 ? parsed.name : "tool",
        input: parsed.input,
        toolUseId: typeof parsed.toolUseId === "string" ? parsed.toolUseId : undefined,
      };
    case "tool_result":
      return {
        kind: "tool_result",
        ts,
        toolUseId: typeof parsed.toolUseId === "string" ? parsed.toolUseId : "",
        content: parsed.content == null ? "" : String(parsed.content),
        isError: parsed.isError === true,
      };
    case "stderr":
      return { kind: "stderr", ts, text: String(parsed.text ?? "") };
    case "system":
      return { kind: "system", ts, text: String(parsed.text ?? "") };
    case "stdout":
    default:
      return { kind: "stdout", ts, text: String(parsed.text ?? "") };
  }
}
