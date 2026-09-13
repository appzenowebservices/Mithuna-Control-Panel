import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@/lib/router";
import type { ExecutionWorkspace, ProjectWorkspace } from "@paperclipai/shared";
import { FolderOpen, GitBranch, Plus, Settings2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { executionWorkspacesApi } from "../api/execution-workspaces";
import { projectsApi } from "../api/projects";
import { queryKeys } from "../lib/queryKeys";
import { useToastActions } from "../context/ToastContext";
import type { ProjectWorkspaceSummary } from "../lib/project-workspaces-tab";
import { ExecutionWorkspaceCloseDialog } from "./ExecutionWorkspaceCloseDialog";
import { ProjectWorkspaceSummaryCard } from "./ProjectWorkspaceSummaryCard";

const SOURCE_TYPE_LABELS: Record<ProjectWorkspace["sourceType"], string> = {
  local_path: "Local git checkout",
  non_git_path: "Local path",
  git_repo: "Remote git repo",
  remote_managed: "Remote-managed",
};

export function ProjectWorkspacesContent({
  companyId,
  projectId,
  projectRef,
  workspaces,
  summaries,
}: {
  companyId: string;
  projectId: string;
  projectRef: string;
  workspaces: ProjectWorkspace[];
  summaries: ProjectWorkspaceSummary[];
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { pushToast } = useToastActions();
  const [runtimeActionKey, setRuntimeActionKey] = useState<string | null>(null);
  const [closingWorkspace, setClosingWorkspace] = useState<{
    id: string;
    name: string;
    status: ExecutionWorkspace["status"];
  } | null>(null);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.executionWorkspaces.list(companyId) });
    queryClient.invalidateQueries({ queryKey: queryKeys.executionWorkspaces.list(companyId, { projectId }) });
    queryClient.invalidateQueries({ queryKey: queryKeys.projects.detail(projectId) });
    queryClient.invalidateQueries({ queryKey: queryKeys.projects.list(companyId) });
    queryClient.invalidateQueries({ queryKey: queryKeys.issues.list(companyId) });
    queryClient.invalidateQueries({ queryKey: queryKeys.issues.listByProject(companyId, projectId) });
  };

  const controlWorkspaceRuntime = useMutation({
    mutationFn: async (input: {
      key: string;
      kind: "project_workspace" | "execution_workspace";
      workspaceId: string;
      action: "start" | "stop" | "restart";
    }) => {
      setRuntimeActionKey(`${input.key}:${input.action}`);
      if (input.kind === "project_workspace") {
        return await projectsApi.controlWorkspaceRuntimeServices(projectId, input.workspaceId, input.action, companyId);
      }
      return await executionWorkspacesApi.controlRuntimeServices(input.workspaceId, input.action);
    },
    onSettled: invalidate,
  });

  const removeWorkspace = useMutation({
    mutationFn: (workspaceId: string) => projectsApi.removeWorkspace(projectId, workspaceId, companyId),
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

  const handleRemove = (workspace: ProjectWorkspace) => {
    if (!window.confirm(`Remove workspace "${workspace.name}"? This does not delete files on disk.`)) return;
    removeWorkspace.mutate(workspace.id);
  };

  const activeSummaries = summaries.filter((summary) => summary.executionWorkspaceStatus !== "cleanup_failed");
  const cleanupFailedSummaries = summaries.filter((summary) => summary.executionWorkspaceStatus === "cleanup_failed");

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                Configured workspaces
              </span>
              <span className="rounded-xl border border-border/60 bg-secondary/50 px-2 py-0.5 text-[10px] font-black tabular-nums text-foreground/80">
                {workspaces.length}
              </span>
            </div>
            <p className="text-sm font-semibold text-muted-foreground">
              The concrete codebases Paperclip attaches to this project — local folders or git repos. Issues linked to
              this project execute inside these workspaces, and their files can be registered as artifacts.
            </p>
          </div>
          <Button
            size="sm"
            className="h-10 rounded-xl px-4 font-bold shadow-md"
            onClick={() => navigate(`/projects/${projectRef}/workspaces/new`)}
          >
            <Plus className="mr-1.5 h-4 w-4" />
            Add workspace
          </Button>
        </div>

        {workspaces.length === 0 ? (
          <div className="rounded-3xl border-2 border-dashed border-border/80 px-4 py-8 text-sm font-semibold text-muted-foreground">
            No workspaces configured for this project yet. Add one to give agents a codebase to work in.
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
                    <span className="inline-flex items-center rounded-xl border border-border/60 bg-secondary/50 px-2 py-0.5 text-[10px] font-black uppercase tracking-widest text-foreground/80">
                      {workspace.visibility}
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
                    {workspace.setupCommand ? (
                      <div className="break-all font-mono">setup: {workspace.setupCommand}</div>
                    ) : null}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Button variant="outline" size="sm" asChild>
                    <Link to={`/projects/${projectRef}/workspaces/${workspace.id}`}>
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

      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
            Execution workspace activity
          </span>
          <span className="rounded-xl border border-border/60 bg-secondary/50 px-2 py-0.5 text-[10px] font-black tabular-nums text-foreground/80">
            {summaries.length}
          </span>
        </div>
        {activeSummaries.length === 0 && cleanupFailedSummaries.length === 0 ? (
          <p className="text-sm font-semibold text-muted-foreground">No non-default workspace activity yet.</p>
        ) : (
          <div className="space-y-4">
            <div className="space-y-3">
              {activeSummaries.map((summary) => (
                <ProjectWorkspaceSummaryCard
                  key={summary.key}
                  projectRef={projectRef}
                  summary={summary}
                  runtimeActionKey={runtimeActionKey}
                  runtimeActionPending={controlWorkspaceRuntime.isPending}
                  onRuntimeAction={(input) => controlWorkspaceRuntime.mutate(input)}
                  onCloseWorkspace={(input) => setClosingWorkspace(input)}
                />
              ))}
            </div>
            {cleanupFailedSummaries.length > 0 ? (
              <div className="space-y-2">
                <div className="text-[10px] font-black uppercase tracking-widest text-destructive">
                  Cleanup attention needed
                </div>
                <div className="space-y-3">
                  {cleanupFailedSummaries.map((summary) => (
                    <ProjectWorkspaceSummaryCard
                      key={summary.key}
                      projectRef={projectRef}
                      summary={summary}
                      runtimeActionKey={runtimeActionKey}
                      runtimeActionPending={controlWorkspaceRuntime.isPending}
                      onRuntimeAction={(input) => controlWorkspaceRuntime.mutate(input)}
                      onCloseWorkspace={(input) => setClosingWorkspace(input)}
                    />
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        )}
      </section>

      {closingWorkspace ? (
        <ExecutionWorkspaceCloseDialog
          workspaceId={closingWorkspace.id}
          workspaceName={closingWorkspace.name}
          currentStatus={closingWorkspace.status}
          open
          onOpenChange={(open) => {
            if (!open) setClosingWorkspace(null);
          }}
          onClosed={() => {
            invalidate();
            setClosingWorkspace(null);
          }}
        />
      ) : null}
    </div>
  );
}
