export const STRUCTURED_CARD_SCENARIO_CODES = [
  "OUT_OF_SCOPE",
  "NEEDS_INPUT",
  "COMPLETED",
  "RUNTIME_ERROR",
  "APPROVAL_REQUIRED",
  "DELEGATED",
] as const;

export type StructuredCardScenarioCode = typeof STRUCTURED_CARD_SCENARIO_CODES[number];

export interface StructuredCardPayload {
  layout: "issue_detail_card";
  metadata: {
    issue_title: string;
    status_badge: { label: string; variant: "success" | "warning" | "danger" | "info" | "neutral"; icon?: string };
    capable_badge?: { label: string; variant: string; icon?: string };
  };
  agent_info: { name: string; id: string; avatar_icon?: string };
  sections: Array<{
    id: string;
    title: string;
    component: string;
    variant?: string;
    message?: string;
    language?: string;
    code?: string;
    data?: unknown;
    items?: unknown[];
    steps?: unknown[];
  }>;
  [key: string]: unknown;
}

export interface IssueStructuredCard {
  id: string;
  companyId: string;
  issueId: string;
  agentId: string | null;
  runId: string | null;
  scenarioCode: StructuredCardScenarioCode;
  soulEnabled: boolean;
  payload: StructuredCardPayload;
  createdAt: Date;
  updatedAt: Date;
}
