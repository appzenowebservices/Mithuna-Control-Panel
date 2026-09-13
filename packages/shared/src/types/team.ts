export interface Team {
  id: string;
  companyId: string;
  name: string;
  description: string | null;
  leadAgentId: string | null;
  color: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
  updatedAt: Date;
  agentCount?: number;
}