// Memory embedding backend — Hermes-config-only, no extra daemons.
//
// Resolution (`MEMORY_EMBEDDINGS`, default "hash"):
//   "hash"     — deterministic hashed word-vectors, 768 dims, L2-normalized,
//                computed in-process. No model, no network, no key. Weaker
//                than neural embeddings (lexical overlap in continuous space,
//                roughly TF-cosine) but strictly better than keywords, free,
//                and instant. Model tag: "hash-768-v1".
//   "provider" — OpenAI-compatible `/embeddings` on the provider already
//                configured in Hermes (`HERMES_HOME/config.yaml` → model
//                provider/base_url + its key). The embedding model is NEVER
//                guessed: `MEMORY_EMBED_MODEL` is required in this mode.
//                Result must be exactly 768 dims or the row stays unembedded.
//                NOTE: Hermes' current provider (opencode-go/deepseek) has no
//                embeddings endpoint, so this mode returns null until the
//                Hermes provider itself supports `/embeddings`.
//   "off"      — always null; FTS carries retrieval alone.
//
// Vector spaces must never mix in one column: every row is tagged with its
// model, and switching strategies requires re-embedding (see
// POST /agents/:id/memories/re-embed). Best-effort throughout: null means
// "unembedded", never an error.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const MEMORY_EMBEDDING_DIMS = 768;
export const HASH_EMBEDDING_MODEL = "hash-768-v1";

interface EmbedResult {
  vector: number[];
  model: string;
}

type EmbedStrategy = "hash" | "provider" | "off";

export function resolveEmbedStrategy(): EmbedStrategy {
  const raw = (process.env.MEMORY_EMBEDDINGS ?? "").trim().toLowerCase();
  if (raw === "provider" || raw === "off") return raw;
  return "hash";
}

/** Model tag for vectors written under the active strategy (null = no vectors). */
export function activeEmbeddingModel(): string | null {
  const strategy = resolveEmbedStrategy();
  if (strategy === "hash") return HASH_EMBEDDING_MODEL;
  if (strategy === "provider") {
    const model = (process.env.MEMORY_EMBED_MODEL ?? "").trim();
    return model ? `${model}@768` : null;
  }
  return null;
}

// --- Deterministic hashed embeddings (default) ----------------------------

function hashWord(word: string): number {
  // FNV-1a 32-bit — stable across processes and restarts (no SipHash seed).
  let h = 0x811c9dc5;
  for (let i = 0; i < word.length; i++) {
    h ^= word.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

export function hashEmbed(text: string): number[] {
  const vector = new Array<number>(MEMORY_EMBEDDING_DIMS).fill(0);
  const words = String(text ?? "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 3);
  if (words.length === 0) return vector;
  for (const word of words) {
    // Two independent slots per word (FNV + rotated FNV) softens collisions.
    const h1 = hashWord(word);
    const h2 = hashWord(`#${word}`);
    vector[h1 % MEMORY_EMBEDDING_DIMS] += 1;
    vector[h2 % MEMORY_EMBEDDING_DIMS] += 0.5;
  }
  let norm = 0;
  for (const v of vector) norm += v * v;
  norm = Math.sqrt(norm) || 1;
  return vector.map((v) => v / norm);
}

// --- Provider embeddings (opt-in, Hermes config only) ---------------------

interface HermesEmbeddingConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
}

function hermesHomeDir(): string {
  const fromEnv = (process.env.HERMES_HOME ?? "").trim();
  if (fromEnv) return fromEnv;
  return path.join(os.homedir(), ".hermes");
}

/** Minimal scalar reader for the 3 keys we need — not a YAML parser. */
function readHermesScalar(content: string, key: string): string | null {
  const match = new RegExp(`^\\s*${key}:\\s*([^\\s#][^\\n#]*)`, "m").exec(content);
  if (!match) return null;
  return match[1].trim().replace(/^["']|["']$/g, "");
}

function resolveHermesEmbeddingConfig(): HermesEmbeddingConfig | null {
  const modelName = (process.env.MEMORY_EMBED_MODEL ?? "").trim();
  if (!modelName) return null; // never guess model names
  let baseUrl = "";
  let apiKey = "";
  try {
    const raw = fs.readFileSync(path.join(hermesHomeDir(), "config.yaml"), "utf8");
    baseUrl = readHermesScalar(raw, "base_url") ?? "";
  } catch {
    // no readable hermes config — fall through to env-only
  }
  if (!baseUrl) baseUrl = (process.env.HERMES_BASE_URL ?? "").trim();
  // Provider keys live where Hermes keeps them: environment / .env.
  apiKey =
    (process.env.HERMES_API_KEY ?? "").trim() ||
    (process.env.OPENAI_API_KEY ?? "").trim();
  if (!baseUrl || !apiKey) return null;
  return { baseUrl: baseUrl.replace(/\/$/, ""), apiKey, model: modelName };
}

async function fetchJson(url: string, payload: unknown, timeoutMs: number, headers?: Record<string, string>) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(headers ?? {}) },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    if (!res.ok) return null;
    return (await res.json()) as unknown;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function asVector(value: unknown): number[] | null {
  if (!Array.isArray(value) || value.length !== MEMORY_EMBEDDING_DIMS) return null;
  const out: number[] = [];
  for (const v of value) {
    const n = typeof v === "number" ? v : Number(v);
    if (!Number.isFinite(n)) return null;
    out.push(n);
  }
  return out;
}

export async function embedText(text: string): Promise<EmbedResult | null> {
  const input = (text ?? "").trim().slice(0, 8000);
  if (!input) return null;
  const strategy = resolveEmbedStrategy();
  if (strategy === "off") return null;

  if (strategy === "provider") {
    try {
      const cfg = resolveHermesEmbeddingConfig();
      if (!cfg) return null;
      const data = (await fetchJson(
        `${cfg.baseUrl}/embeddings`,
        { model: cfg.model, input },
        15000,
        { Authorization: `Bearer ${cfg.apiKey}` },
      )) as { data?: Array<{ embedding?: unknown }> } | null;
      const vector = data?.data?.[0] ? asVector(data.data[0].embedding) : null;
      if (vector) return { vector, model: `${cfg.model}@768` };
    } catch {
      // fall through to null (never fall back to hash — spaces must not mix)
    }
    return null;
  }

  return { vector: hashEmbed(input), model: HASH_EMBEDDING_MODEL };
}
