import type { ChatRequest, ChatResponse, ModelInfo, SkillInfo } from "./types.js";

export interface AgentHttpConnectionConfig {
  endpoint: string;
  timeoutSec: number;
}

export class AgentHttpConnection {
  private endpoint: string;
  private timeoutSec: number;

  constructor(endpoint: string = "http://localhost:8765/api/v1", timeoutSec: number = 60) {
    this.endpoint = endpoint.replace(/\/$/, "");
    this.timeoutSec = timeoutSec;
  }

  async healthCheck(): Promise<void> {
    const response = await globalThis.fetch(`${this.endpoint}/health`, {
      method: "GET",
    });
    
    if (!response.ok) {
      throw new Error(`Health check failed: ${response.status}`);
    }
  }

  async detectModel(): Promise<ModelInfo> {
    const response = await globalThis.fetch(`${this.endpoint}/model`, {
      method: "GET",
    });
    
    if (!response.ok) {
      throw new Error(`Model detection failed: ${response.status}`);
    }
    
    return response.json() as Promise<ModelInfo>;
  }

  async listSkills(): Promise<SkillInfo[]> {
    const response = await globalThis.fetch(`${this.endpoint}/skills`, {
      method: "GET",
    });
    
    if (!response.ok) {
      throw new Error(`List skills failed: ${response.status}`);
    }
    
    const data = await response.json() as { skills: SkillInfo[] };
    return data.skills ?? [];
  }

  async chat(request: ChatRequest): Promise<ChatResponse> {
    // chat/sync is fully synchronous server-side: hermes streams NO response
    // bytes until the whole conversation completes, which can take 10-30+
    // minutes for deep work. Node's undici fetch aborts requests whose
    // response headers don't arrive within its 300s default headersTimeout,
    // killing every long run ("fetch failed"). Apply a timeout only when the
    // adapter explicitly configured one (timeoutSec > 0); the default of 0
    // means no timeout so long runs are never cut off.
    const timeoutMs = this.timeoutSec > 0 ? this.timeoutSec * 1000 : undefined;
    const response = await globalThis.fetch(`${this.endpoint}/chat/sync`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(request),
      ...(timeoutMs !== undefined ? { signal: AbortSignal.timeout(timeoutMs) } : {}),
    });
    
    if (!response.ok) {
      throw new Error(`Chat request failed: ${response.status}`);
    }
    
    return response.json() as Promise<ChatResponse>;
  }

  abort(): void {
    // No-op for now
  }
}