import type { Team, Agent, Project, TeamSkillEntry } from "@paperclipai/shared";
import { api } from "./client";

export interface CreateTeamInput {
  name: string;
  description?: string | null;
  leadAgentId?: string | null;
  color?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface UpdateTeamInput {
  name?: string;
  description?: string | null;
  leadAgentId?: string | null;
  color?: string | null;
  metadata?: Record<string, unknown> | null;
}

export const teamsApi = {
  list: (companyId: string) => api.get<Team[]>(`/companies/${companyId}/teams`),
  get: (teamId: string, companyId: string) => api.get<Team>(`/companies/${companyId}/teams/${teamId}`),
  create: (companyId: string, data: CreateTeamInput) =>
    api.post<Team>(`/companies/${companyId}/teams`, data),
  update: (teamId: string, companyId: string, data: UpdateTeamInput) =>
    api.patch<Team>(`/companies/${companyId}/teams/${teamId}`, data),
  delete: (teamId: string, companyId: string) =>
    api.delete<void>(`/companies/${companyId}/teams/${teamId}`),
  listAgents: (companyId: string, teamId: string) =>
    api.get<Agent[]>(`/companies/${companyId}/teams/${teamId}/agents`),
  listProjects: (companyId: string, teamId: string) =>
    api.get<Project[]>(`/companies/${companyId}/teams/${teamId}/projects`),
  listSkills: (companyId: string, teamId: string) =>
    api.get<TeamSkillEntry[]>(`/companies/${companyId}/teams/${teamId}/skills`),
  assignSkills: (
    companyId: string,
    teamId: string,
    desiredSkills: Array<string | { key: string; versionId?: string | null }>,
  ) => api.post<TeamSkillEntry[]>(`/companies/${companyId}/teams/${teamId}/skills`, { desiredSkills }),
};