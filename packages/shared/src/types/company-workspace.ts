export type CompanyWorkspaceSourceType = "local_path" | "git_repo" | "non_git_path";
export type CompanyWorkspaceVisibility = "default" | "advanced";

export interface CompanyWorkspace {
  id: string;
  companyId: string;
  name: string;
  sourceType: CompanyWorkspaceSourceType;
  cwd: string | null;
  repoUrl: string | null;
  repoRef: string | null;
  defaultRef: string | null;
  visibility: CompanyWorkspaceVisibility;
  setupCommand: string | null;
  cleanupCommand: string | null;
  sharedWorkspaceKey: string | null;
  metadata: Record<string, unknown> | null;
  isPrimary: boolean;
  createdAt: Date;
  updatedAt: Date;
}
