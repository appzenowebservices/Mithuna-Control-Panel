import type { ModelInfo } from "./types.js";

export interface ModelDetectionResult {
  provider: string;
  model: string;
  baseUrl?: string;
  apiMode?: string;
  source: string;
}

const MODEL_PREFIX_PROVIDER_HINTS: [string, string][] = [
  ["gpt-", "copilot"],
  ["claude-", "anthropic"],
  ["gemini-", "google"],
  ["meta-llama/", "nous"],
];

const VALID_PROVIDERS = ["auto", "openai", "anthropic", "google", "copilot", "nous", "openrouter"];

export function inferProviderFromModel(model: string): string | undefined {
  const lower = model.toLowerCase();
  const bareName = lower.includes("/") ? lower.split("/").pop() : lower;
  
  if (!bareName) return undefined;
  
  for (const [prefix, hint] of MODEL_PREFIX_PROVIDER_HINTS) {
    if (bareName.startsWith(prefix)) {
      return hint;
    }
  }
  return undefined;
}

export function resolveProvider(options: {
  explicitProvider?: string;
  detectedProvider?: string;
  detectedModel?: string;
  model?: string;
}): { provider: string; resolvedFrom: string } {
  const { explicitProvider, detectedProvider, detectedModel, model } = options;
  
  if (explicitProvider && VALID_PROVIDERS.includes(explicitProvider)) {
    return { provider: explicitProvider, resolvedFrom: "adapterConfig" };
  }
  
  if (detectedProvider && detectedModel && VALID_PROVIDERS.includes(detectedProvider) &&
      model && detectedModel.toLowerCase() === model.toLowerCase()) {
    return { provider: detectedProvider, resolvedFrom: "hermesConfig" };
  }
  
  if (model) {
    const inferred = inferProviderFromModel(model);
    if (inferred) {
      return { provider: inferred, resolvedFrom: "modelInference" };
    }
  }
  
  return { provider: "auto", resolvedFrom: "auto" };
}

const DEFAULT_ENDPOINT = "http://localhost:8765/api/v1";

export async function detectModelHttp(): Promise<ModelInfo> {
  try {
    const response = await globalThis.fetch(`${DEFAULT_ENDPOINT}/model`);
    if (!response.ok) {
      throw new Error(`Model detection failed: ${response.status}`);
    }
    return (await response.json()) as ModelInfo;
  } catch {
    return {
      provider: "auto",
      model: "openrouter/free",
      available_models: ["openrouter/free", "anthropic/claude-3.5-sonnet", "openai/gpt-4o"],
    };
  }
}