import type { CompanyWorkspace, CreateCompanyWorkspace, UpdateCompanyWorkspace } from "@paperclipai/shared";
import { api } from "./client";

export const companyWorkspacesApi = {
  list: (companyId: string) => api.get<CompanyWorkspace[]>(`/companies/${companyId}/workspaces`),
  get: (companyId: string, workspaceId: string) =>
    api.get<CompanyWorkspace>(`/companies/${companyId}/workspaces/${workspaceId}`),
  create: (companyId: string, data: CreateCompanyWorkspace) =>
    api.post<CompanyWorkspace>(`/companies/${companyId}/workspaces`, data),
  update: (companyId: string, workspaceId: string, data: UpdateCompanyWorkspace) =>
    api.patch<CompanyWorkspace>(`/companies/${companyId}/workspaces/${workspaceId}`, data),
  remove: (companyId: string, workspaceId: string) =>
    api.delete<void>(`/companies/${companyId}/workspaces/${workspaceId}`),
  promote: (
    companyId: string,
    workspaceId: string,
    data: { issueId?: string | null; filePaths?: string[]; title?: string | null; message?: string | null },
  ) =>
    api.post<{ ok: boolean; response: string; provider?: string | null; model?: string | null }>(
      `/companies/${companyId}/workspaces/${workspaceId}/promotions`,
      data,
    ),
};
