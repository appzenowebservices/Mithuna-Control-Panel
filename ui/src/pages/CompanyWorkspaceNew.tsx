import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "@/lib/router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CompanyWorkspaceSourceType } from "@paperclipai/shared";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { companyWorkspacesApi } from "../api/companyWorkspaces";
import { instanceSettingsApi } from "../api/instanceSettings";
import { useCompany } from "../context/CompanyContext";
import { useToastActions } from "../context/ToastContext";
import { queryKeys } from "../lib/queryKeys";

const SOURCE_TYPE_OPTIONS: Array<{ value: CompanyWorkspaceSourceType; label: string; description: string }> = [
  { value: "local_path", label: "Local git checkout", description: "A local path Paperclip can use directly." },
  { value: "non_git_path", label: "Local non-git path", description: "A local folder without git semantics." },
  { value: "git_repo", label: "Remote git repo", description: "A repo URL with optional refs and local checkout." },
];

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="space-y-1.5">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
        <span className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">{label}</span>
        {hint ? <span className="text-[11px] leading-relaxed text-muted-foreground sm:text-right">{hint}</span> : null}
      </div>
      {children}
    </label>
  );
}

export function CompanyWorkspaceNew() {
  const { selectedCompanyId } = useCompany();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { pushToast } = useToastActions();
  const [name, setName] = useState("");
  const [sourceType, setSourceType] = useState<CompanyWorkspaceSourceType>("local_path");
  const [cwd, setCwd] = useState("");
  const [repoUrl, setRepoUrl] = useState("");
  const [repoRef, setRepoRef] = useState("");
  const [defaultRef, setDefaultRef] = useState("");
  const [setupCommand, setSetupCommand] = useState("");
  const [cleanupCommand, setCleanupCommand] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const instancePathsQuery = useQuery({
    queryKey: ["instance-paths"],
    queryFn: () => instanceSettingsApi.getPaths(),
    staleTime: Infinity,
  });

  const prefilledRef = useRef(false);

  useEffect(() => {
    const paths = instancePathsQuery.data;
    if (!paths || !selectedCompanyId || prefilledRef.current) return;
    prefilledRef.current = true;
    setCwd(`${paths.paperclipHome}/instances/${paths.instanceId}/companies/${selectedCompanyId}/workspace`);
  }, [instancePathsQuery.data, selectedCompanyId]);

  const createWorkspace = useMutation({
    mutationFn: () =>
      companyWorkspacesApi.create(selectedCompanyId!, {
        name: name.trim() || undefined,
        sourceType,
        cwd: cwd.trim() || null,
        repoUrl: repoUrl.trim() || null,
        repoRef: repoRef.trim() || null,
        defaultRef: defaultRef.trim() || null,
        setupCommand: setupCommand.trim() || null,
        cleanupCommand: cleanupCommand.trim() || null,
        isPrimary: false,
      }),
    onSuccess: (workspace) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.companyWorkspaces.list(selectedCompanyId!) });
      pushToast({ title: `"${workspace.name}" created`, tone: "success" });
      navigate(`/workspaces/${workspace.id}`, { replace: true });
    },
    onError: (error) => {
      setErrorMessage(error instanceof Error ? error.message : "Failed to create workspace.");
    },
  });

  const sourceTypeDescription = SOURCE_TYPE_OPTIONS.find((option) => option.value === sourceType)?.description ?? null;

  const handleSubmit = () => {
    const cwdTrimmed = cwd.trim();
    const repoUrlTrimmed = repoUrl.trim();
    if (!cwdTrimmed && !repoUrlTrimmed) {
      setErrorMessage("Company workspace requires at least one local path or repo URL.");
      return;
    }
    setErrorMessage(null);
    createWorkspace.mutate();
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Button variant="ghost" size="sm" asChild>
        <Link to="/workspaces">
          <span className="mr-1">←</span> Back to workspaces
        </Link>
      </Button>

      <div className="space-y-2">
        <div className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">Company workspace</div>
        <h1 className="text-xl font-semibold sm:text-2xl">Add company workspace</h1>
      </div>

      <div className="rounded-2xl border border-border bg-card p-5">
        <p className="max-w-2xl text-sm text-muted-foreground">
          Company-wide folders and git repos. Agents write into the primary company workspace when an issue has no
          project workspace.
        </p>

        <div className="mt-5 grid gap-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Workspace name">
              <input
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Workspace name"
              />
            </Field>
            <Field label="Source type" hint={sourceTypeDescription ?? undefined}>
              <select
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none"
                value={sourceType}
                onChange={(event) => setSourceType(event.target.value as CompanyWorkspaceSourceType)}
              >
                {SOURCE_TYPE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </Field>
          </div>

          <Field label="Local path">
            <input
              className="w-full rounded-lg border border-border bg-background px-3 py-2 font-mono text-sm outline-none"
              value={cwd}
              onChange={(event) => setCwd(event.target.value)}
              placeholder="D:\SDS\workspaces\astrologics"
            />
          </Field>

          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Repo URL">
              <input
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none"
                value={repoUrl}
                onChange={(event) => setRepoUrl(event.target.value)}
                placeholder="https://github.com/org/repo"
              />
            </Field>
            <Field label="Repo ref">
              <input
                className="w-full rounded-lg border border-border bg-background px-3 py-2 font-mono text-sm outline-none"
                value={repoRef}
                onChange={(event) => setRepoRef(event.target.value)}
                placeholder="origin/main"
              />
            </Field>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Default ref">
              <input
                className="w-full rounded-lg border border-border bg-background px-3 py-2 font-mono text-sm outline-none"
                value={defaultRef}
                onChange={(event) => setDefaultRef(event.target.value)}
                placeholder="origin/main"
              />
            </Field>
            <Field label="Visibility">
              <select
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none"
                defaultValue="default"
              >
                <option value="default">Default</option>
                <option value="advanced">Advanced</option>
              </select>
            </Field>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Setup command" hint="Runs when this workspace needs custom bootstrap">
              <textarea
                className="min-h-24 w-full rounded-lg border border-border bg-background px-3 py-2 font-mono text-sm outline-none"
                value={setupCommand}
                onChange={(event) => setSetupCommand(event.target.value)}
                placeholder="pnpm install"
              />
            </Field>
            <Field label="Cleanup command" hint="Runs before teardown">
              <textarea
                className="min-h-24 w-full rounded-lg border border-border bg-background px-3 py-2 font-mono text-sm outline-none"
                value={cleanupCommand}
                onChange={(event) => setCleanupCommand(event.target.value)}
                placeholder=""
              />
            </Field>
          </div>
        </div>

        <div className="mt-5 flex flex-col items-stretch gap-3 sm:flex-row sm:flex-wrap sm:items-center">
          <Button className="w-full sm:w-auto" disabled={createWorkspace.isPending} onClick={handleSubmit}>
            {createWorkspace.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Create workspace
          </Button>
          {errorMessage ? <p className="text-sm text-destructive">{errorMessage}</p> : null}
        </div>
      </div>
    </div>
  );
}
