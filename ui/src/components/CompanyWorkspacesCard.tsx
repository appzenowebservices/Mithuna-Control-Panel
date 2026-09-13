import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@/lib/router";
import type { CompanyWorkspace } from "@paperclipai/shared";
import { FolderOpen, GitBranch, Plus, Settings2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { companyWorkspacesApi } from "../api/companyWorkspaces";
import { queryKeys } from "../lib/queryKeys";
import { useToastActions } from "../context/ToastContext";

const SOURCE_TYPE_LABELS: Record<CompanyWorkspace["sourceType"], string> = {
  local_path: "Local git checkout",
  non_git_path: "Local path",
  git_repo: "Remote git repo",
};

export function CompanyWorkspacesCard({
  companyId,
  workspaces,
}: {
  companyId: string;
  workspaces: CompanyWorkspace[];
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { pushToast } = useToastActions();

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.companyWorkspaces.list(companyId) });
    queryClient.invalidateQueries({ queryKey: queryKeys.companyWorkspaces.detail(companyId, "__all__") });
  };

  const removeWorkspace = useMutation({
    mutationFn: (workspaceId: string) => companyWorkspacesApi.remove(companyId, workspaceId),
    onSuccess: (_, workspaceId) => {
      const name = workspaces.find((workspace) => workspace.id === workspaceId)?.name ?? "Workspace";
      pushToast({ title: `"${name}" removed`, tone: "success" });
      invalidate();
    },
    onError: (error) => {
      pushToast({
        title: error instanceof Error ? error.message : "Failed to remove workspace",
        tone: "error",
      });
    },
  });

  const handleRemove = (workspace: CompanyWorkspace) => {
    if (!window.confirm(`Remove company workspace "${workspace.name}"? This does not delete files on disk.`)) return;
    removeWorkspace.mutate(workspace.id);
  };

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
              Company workspaces
            </span>
            <span className="rounded-xl border border-border/60 bg-secondary/50 px-2 py-0.5 text-[10px] font-black tabular-nums text-foreground/80">
              {workspaces.length}
            </span>
          </div>
          <p className="text-sm font-semibold text-muted-foreground">
            Company-wide folders and git repos agents write into when an issue has no project workspace. The primary one
            is the fallback working directory for company runs.
          </p>
        </div>
        <Button size="sm" className="h-10 rounded-xl px-4 font-bold shadow-md" onClick={() => navigate("/workspaces/new")}>
          <Plus className="mr-1.5 h-4 w-4" />
          Add company workspace
        </Button>
      </div>

      {workspaces.length === 0 ? (
        <div className="rounded-3xl border-2 border-dashed border-border/80 px-4 py-8 text-sm font-semibold text-muted-foreground">
          No company workspaces configured yet. Add one to give agents a fallback folder or repo to work in.
        </div>
      ) : (
        <div className="space-y-2.5">
          {workspaces.map((workspace) => (
            <div
              key={workspace.id}
              className="flex flex-col gap-3 rounded-2xl border-2 border-border/80 bg-card/80 p-4 shadow-xl backdrop-blur-md sm:flex-row sm:items-center sm:justify-between sm:gap-4"
            >
              <div className="min-w-0 space-y-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="truncate text-sm font-black tracking-tight text-foreground">{workspace.name}</span>
                  {workspace.isPrimary ? (
                    <span className="inline-flex items-center rounded-xl border border-emerald-500/40 bg-emerald-100 px-2 py-0.5 text-[10px] font-black uppercase tracking-widest text-emerald-700 content-dark:bg-emerald-500/15 content-dark:text-emerald-700">
                      Primary
                    </span>
                  ) : null}
                  <span className="inline-flex items-center rounded-xl border border-border/60 bg-secondary/50 px-2 py-0.5 text-[10px] font-black uppercase tracking-widest text-foreground/80">
                    {SOURCE_TYPE_LABELS[workspace.sourceType] ?? workspace.sourceType}
                  </span>
                </div>
                <div className="space-y-1 text-xs font-semibold text-muted-foreground">
                  {workspace.cwd ? (
                    <div className="flex items-center gap-1.5">
                      <FolderOpen className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      <span className="break-all font-mono">{workspace.cwd}</span>
                    </div>
                  ) : null}
                  {workspace.repoUrl ? (
                    <div className="flex items-center gap-1.5">
                      <GitBranch className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      <span className="break-all font-mono">{workspace.repoUrl}</span>
                      {workspace.defaultRef ? <span className="text-muted-foreground">({workspace.defaultRef})</span> : null}
                    </div>
                  ) : null}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Button variant="outline" size="sm" asChild>
                  <Link to={`/workspaces/${workspace.id}`}>
                    <Settings2 className="mr-1.5 h-4 w-4" />
                    Configure
                  </Link>
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={removeWorkspace.isPending}
                  onClick={() => handleRemove(workspace)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
