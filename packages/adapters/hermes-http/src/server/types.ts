export interface ModelInfo {
  provider: string;
  model: string;
  available_models?: string[];
}

export interface SkillInfo {
  name: string;
  description: string;
  category: string;
}

export interface ChatRequest {
  message: string;
  session_id?: string;
  model?: string;
  provider?: string;
  system_prompt?: string;
  max_turns?: number;
  toolsets?: string[];
  temperature?: number;
  skills?: string[];
  workMode?: string | null;
  issueId?: string | null;
  paperclipSkillSync?: Record<string, unknown>;
  agentId?: string | null;
  companyId?: string | null;
  runId?: string | null;
  apiUrl?: string | null;
  apiKey?: string | null;
  /** Resolved Paperclip workspace cwd the agent's terminal/file tools must run inside. */
  cwd?: string | null;
  /** Deterministic akashic profile — agent/company/issue/workspace + KNOWLEDGE_GRAPH hint (pre-LLM) */
  agentProfile?: string | null;
  /** Authoritative per-agent assigned skills from Paperclip (pre-LLM; intent gate uses these, NO skills_list call) */
  assignedSkills?: string[] | null;
  assignedMcpServers?: string[] | null;
  // 5-layer prompt extensions
  /** Whether SOUL/persona should be injected (default true). When false, hermes runs as mechanical deterministic machine. */
  soulEnabled?: boolean | null;
  /** Inline SOUL template markdown with {{ASTROLOGY_CHART}} / {{AGENT_NAME}} placeholders */
  soulTemplate?: string | null;
  /** 52-axis astrology vectors (from compute_personality_vectors) */
  astrologyVectors?: Record<string, unknown> | null;
  /** Agent-specific instructions markdown (from /agents/{id}/instructions) */
  instructions?: string | null;
  /** Precomputed emotional state {mood, energy, caution, focus, urgency, _source?} */
  emotionalState?: Record<string, unknown> | null;
  /** Recent run summaries for emotional override */
  recentRuns?: Array<Record<string, unknown>> | null;
  /** Current issue/task context for emotional + task tiers */
  currentIssue?: Record<string, unknown> | null;
  /** Deterministic wake brief — last wake outcome + open threads + unread board-chat (pre-LLM continuity) */
  wakeBrief?: string | null;
}

export interface ChatContractResult {
  passed: boolean;
  retries: number;
  violations: string[];
}

export interface HermesTranscriptEntry {
  kind: "thinking" | "assistant" | "tool_call" | "tool_result" | "stderr" | "system" | "stdout";
  ts?: string;
  text?: string;
  name?: string;
  input?: unknown;
  toolUseId?: string | null;
  content?: string;
  isError?: boolean;
}

export interface ChatResponse {
  session_id: string;
  response: string;
  usage?: {
    input_tokens: number;
    output_tokens: number;
  };
  cost_usd?: number;
  exitCode?: number;
  provider?: string;
  model?: string;
  contract?: ChatContractResult | null;
  /** Structured step-by-step transcript to persist into the heartbeat run log. */
  transcript?: HermesTranscriptEntry[];
  /** Human-readable error when the run failed partway (partial transcript may still be present). */
  error?: string | null;
}