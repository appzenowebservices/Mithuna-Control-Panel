import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "@/lib/router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CompanyWorkspace, CompanyWorkspaceSourceType, CompanyWorkspaceVisibility } from "@paperclipai/shared";
import { ArrowLeft, Check, ExternalLink, GitPullRequest, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { companyWorkspacesApi } from "../api/companyWorkspaces";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { useCompany } from "../context/CompanyContext";
import { queryKeys } from "../lib/queryKeys";

const SOURCE_TYPE_OPTIONS: Array<{ value: CompanyWorkspaceSourceType; label: string; description: string }> = [
  { value: "local_path", label: "Local git checkout", description: "A local path Paperclip can use directly." },
  { value: "non_git_path", label: "Local non-git path", description: "A local folder without git semantics." },
  { value: "git_repo", label: "Remote git repo", description: "A repo URL with optional refs and local checkout." },
];

const VISIBILITY_OPTIONS: Array<{ value: CompanyWorkspaceVisibility; label: string }> = [
  { value: "default", label: "Default" },
  { value: "advanced", label: "Advanced" },
];

function normalizeText(value: string) {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function isSafeExternalUrl(value: string | null | undefined) {
  if (!value) return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

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

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5 py-1.5 sm:flex-row sm:items-start sm:gap-3">
      <div className="shrink-0 text-xs text-muted-foreground sm:w-28">{label}</div>
      <div className="min-w-0 flex-1 text-sm">{children}</div>
    </div>
  );
}

type FormState = {
  name: string;
  sourceType: CompanyWorkspaceSourceType;
  cwd: string;
  repoUrl: string;
  repoRef: string;
  defaultRef: string;
  visibility: CompanyWorkspaceVisibility;
  setupCommand: string;
  cleanupCommand: string;
  sharedWorkspaceKey: string;
};

function formStateFromWorkspace(workspace: CompanyWorkspace): FormState {
  return {
    name: workspace.name,
    sourceType: workspace.sourceType,
    cwd: workspace.cwd ?? "",
    repoUrl: workspace.repoUrl ?? "",
    repoRef: workspace.repoRef ?? "",
    defaultRef: workspace.defaultRef ?? "",
    visibility: workspace.visibility,
    setupCommand: workspace.setupCommand ?? "",
    cleanupCommand: workspace.cleanupCommand ?? "",
    sharedWorkspaceKey: workspace.sharedWorkspaceKey ?? "",
  };
}

export function CompanyWorkspaceDetail() {
  const { companyPrefix, workspaceId } = useParams<{ companyPrefix?: string; workspaceId: string }>();
  const { companies, selectedCompanyId, setSelectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<FormState | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [promoteOpen, setPromoteOpen] = useState(false);
  const [promoteFilePaths, setPromoteFilePaths] = useState("");
  const [promoteTitle, setPromoteTitle] = useState("");
  const [promoteResult, setPromoteResult] = useState<string | null>(null);

  const routeWorkspaceId = workspaceId ?? "";
  const routeCompanyId = useMemo(() => {
    if (!companyPrefix) return null;
    const requestedPrefix = companyPrefix.toUpperCase();
    return companies.find((company) => company.issuePrefix.toUpperCase() === requestedPrefix)?.id ?? null;
  }, [companies, companyPrefix]);
  const lookupCompanyId = routeCompanyId ?? selectedCompanyId ?? null;

  const workspaceQuery = useQuery({
    queryKey: queryKeys.companyWorkspaces.detail(lookupCompanyId ?? "__none__", routeWorkspaceId),
    queryFn: () => companyWorkspacesApi.get(lookupCompanyId!, routeWorkspaceId),
    enabled: Boolean(lookupCompanyId),
  });

  const workspace = workspaceQuery.data ?? null;
  const initialState = useMemo(() => (workspace ? formStateFromWorkspace(workspace) : null), [workspace]);
  const isDirty = Boolean(form && initialState && JSON.stringify(form) !== JSON.stringify(initialState));

  useEffect(() => {
    if (!workspace?.companyId || workspace.companyId === selectedCompanyId) return;
    setSelectedCompanyId(workspace.companyId, { source: "route_sync" });
  }, [workspace?.companyId, selectedCompanyId, setSelectedCompanyId]);

  useEffect(() => {
    if (!workspace) return;
    setForm(formStateFromWorkspace(workspace));
    setErrorMessage(null);
  }, [workspace]);

  useEffect(() => {
    if (!workspace) return;
    setBreadcrumbs([
      { label: "Workspaces", href: "/workspaces" },
      { label: workspace.name },
    ]);
  }, [setBreadcrumbs, workspace?.name]);

  const invalidate = () => {
    if (!lookupCompanyId) return;
    queryClient.invalidateQueries({ queryKey: queryKeys.companyWorkspaces.list(lookupCompanyId) });
    queryClient.invalidateQueries({ queryKey: queryKeys.companyWorkspaces.detail(lookupCompanyId, routeWorkspaceId) });
  };

  const updateWorkspace = useMutation({
    mutationFn: (patch: Record<string, unknown>) =>
      companyWorkspacesApi.update(lookupCompanyId!, routeWorkspaceId, patch),
    onSuccess: () => {
      invalidate();
      setErrorMessage(null);
    },
    onError: (error) => {
      setErrorMessage(error instanceof Error ? error.message : "Failed to save workspace.");
    },
  });

  const setPrimaryWorkspace = useMutation({
    mutationFn: () => companyWorkspacesApi.update(lookupCompanyId!, routeWorkspaceId, { isPrimary: true }),
    onSuccess: () => {
      invalidate();
      setErrorMessage(null);
    },
    onError: (error) => {
      setErrorMessage(error instanceof Error ? error.message : "Failed to update workspace.");
    },
  });

  const promoteWorkspace = useMutation({
    mutationFn: (data: { filePaths: string[]; title: string }) =>
      companyWorkspacesApi.promote(lookupCompanyId!, routeWorkspaceId, {
        filePaths: data.filePaths,
        title: data.title.trim() || null,
      }),
    onSuccess: (result) => {
      setPromoteResult(result.response || "Promote run finished with no output.");
      setPromoteFilePaths("");
      setPromoteTitle("");
    },
    onError: (error) => {
      setPromoteResult(
        error instanceof Error ? `Promote failed: ${error.message}` : "Promote failed.",
      );
    },
  });

  if (workspaceQuery.isLoading) return <p className="text-sm text-muted-foreground">Loading workspace…</p>;
  if (workspaceQuery.error) {
    return (
      <p className="text-sm text-destructive">
        {workspaceQuery.error instanceof Error ? workspaceQuery.error.message : "Failed to load workspace"}
      </p>
    );
  }
  if (!workspace || !form || !initialState) {
    return <p className="text-sm text-muted-foreground">Company workspace not found.</p>;
  }

  const buildPatch = () => {
    const patch: Record<string, unknown> = {};
    const assign = (key: keyof FormState) => {
      if (initialState[key] === form[key]) return;
      patch[key] = typeof form[key] === "string" ? normalizeText(form[key] as string) : form[key];
    };
    assign("name");
    assign("sourceType");
    assign("cwd");
    assign("repoUrl");
    assign("repoRef");
    assign("defaultRef");
    assign("visibility");
    assign("setupCommand");
    assign("cleanupCommand");
    assign("sharedWorkspaceKey");
    return patch;
  };

  const saveChanges = () => {
    const cwdTrimmed = normalizeText(form.cwd);
    const repoUrlTrimmed = normalizeText(form.repoUrl);
    if (!cwdTrimmed && !repoUrlTrimmed) {
      setErrorMessage("Company workspace requires at least one local path or repo URL.");
      return;
    }
    const patch = buildPatch();
    if (Object.keys(patch).length === 0) return;
    updateWorkspace.mutate(patch);
  };

  const sourceTypeDescription = SOURCE_TYPE_OPTIONS.find((option) => option.value === form.sourceType)?.description ?? null;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <Button variant="ghost" size="sm" asChild>
        <Link to="/workspaces">
          <ArrowLeft className="mr-1 h-4 w-4" />
          Back to workspaces
        </Link>
      </Button>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-2">
          <div className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
            Company workspace
          </div>
          <h1 className="truncate text-xl font-semibold sm:text-2xl">{workspace.name}</h1>
        </div>
        {!workspace.isPrimary ? (
          <Button
            variant="outline"
            className="w-full sm:w-auto"
            disabled={setPrimaryWorkspace.isPending}
            onClick={() => setPrimaryWorkspace.mutate()}
          >
            {setPrimaryWorkspace.isPending
              ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              : <Check className="mr-2 h-4 w-4" />}
            Make primary
          </Button>
        ) : (
          <div className="inline-flex items-center gap-2 rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-300 sm:max-w-sm">
            <Sparkles className="h-4 w-4" />
            This is the company’s primary fallback workspace.
          </div>
        )}
        <Button
          variant="outline"
          className="w-full sm:w-auto"
          disabled={!workspace.repoUrl || promoteWorkspace.isPending}
          onClick={() => {
            setPromoteOpen(true);
            setPromoteResult(null);
          }}
        >
          {promoteWorkspace.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <GitPullRequest className="mr-2 h-4 w-4" />}
          Promote to repo
        </Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(18rem,0.9fr)]">
        <div className="rounded-2xl border border-border bg-card p-5">
          <p className="max-w-2xl text-sm text-muted-foreground">
            Configure the company-wide folder or git repo agents write into when an issue has no project workspace.
          </p>

          <Separator className="my-5" />

          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Workspace name">
              <input
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none"
                value={form.name}
                onChange={(event) => setForm((current) => current ? { ...current, name: event.target.value } : current)}
                placeholder="Workspace name"
              />
            </Field>
            <Field label="Visibility">
              <select
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none"
                value={form.visibility}
                onChange={(event) =>
                  setForm((current) => current ? { ...current, visibility: event.target.value as CompanyWorkspaceVisibility } : current)
                }
              >
                {VISIBILITY_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </Field>
          </div>

          <div className="mt-4 grid gap-4">
            <Field label="Source type" hint={sourceTypeDescription ?? undefined}>
              <select
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none"
                value={form.sourceType}
                onChange={(event) =>
                  setForm((current) => current ? { ...current, sourceType: event.target.value as CompanyWorkspaceSourceType } : current)
                }
              >
                {SOURCE_TYPE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </Field>

            <Field label="Local path">
              <input
                className="w-full rounded-lg border border-border bg-background px-3 py-2 font-mono text-sm outline-none"
                value={form.cwd}
                onChange={(event) => setForm((current) => current ? { ...current, cwd: event.target.value } : current)}
                placeholder="D:\SDS\workspaces\astrologics"
              />
            </Field>

            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Repo URL">
                <input
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none"
                  value={form.repoUrl}
                  onChange={(event) => setForm((current) => current ? { ...current, repoUrl: event.target.value } : current)}
                  placeholder="https://github.com/org/repo"
                />
              </Field>
              <Field label="Repo ref">
                <input
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 font-mono text-sm outline-none"
                  value={form.repoRef}
                  onChange={(event) => setForm((current) => current ? { ...current, repoRef: event.target.value } : current)}
                  placeholder="origin/main"
                />
              </Field>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Default ref">
                <input
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 font-mono text-sm outline-none"
                  value={form.defaultRef}
                  onChange={(event) => setForm((current) => current ? { ...current, defaultRef: event.target.value } : current)}
                  placeholder="origin/main"
                />
              </Field>
              <Field label="Shared workspace key">
                <input
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 font-mono text-sm outline-none"
                  value={form.sharedWorkspaceKey}
                  onChange={(event) =>
                    setForm((current) => current ? { ...current, sharedWorkspaceKey: event.target.value } : current)
                  }
                  placeholder="frontend"
                />
              </Field>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Setup command" hint="Runs when this workspace needs custom bootstrap">
                <textarea
                  className="min-h-24 w-full rounded-lg border border-border bg-background px-3 py-2 font-mono text-sm outline-none"
                  value={form.setupCommand}
                  onChange={(event) => setForm((current) => current ? { ...current, setupCommand: event.target.value } : current)}
                  placeholder="pnpm install"
                />
              </Field>
              <Field label="Cleanup command" hint="Runs before teardown">
                <textarea
                  className="min-h-24 w-full rounded-lg border border-border bg-background px-3 py-2 font-mono text-sm outline-none"
                  value={form.cleanupCommand}
                  onChange={(event) => setForm((current) => current ? { ...current, cleanupCommand: event.target.value } : current)}
                  placeholder=""
                />
              </Field>
            </div>
          </div>

          <div className="mt-5 flex flex-col items-stretch gap-3 sm:flex-row sm:flex-wrap sm:items-center">
            <Button className="w-full sm:w-auto" disabled={!isDirty || updateWorkspace.isPending} onClick={saveChanges}>
              {updateWorkspace.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Save changes
            </Button>
            <Button
              variant="outline"
              className="w-full sm:w-auto"
              disabled={!isDirty || updateWorkspace.isPending}
              onClick={() => {
                setForm(initialState);
                setErrorMessage(null);
              }}
            >
              Reset
            </Button>
            {errorMessage ? <p className="text-sm text-destructive">{errorMessage}</p> : null}
            {!errorMessage && !isDirty ? <p className="text-sm text-muted-foreground">No unsaved changes.</p> : null}
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-2xl border border-border bg-card p-5">
            <div className="space-y-1">
              <div className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">Workspace facts</div>
              <h2 className="text-lg font-semibold">Current state</h2>
            </div>
            <Separator className="my-4" />
            <DetailRow label="Workspace ID">
              <span className="break-all font-mono text-xs">{workspace.id}</span>
            </DetailRow>
            <DetailRow label="Local path">
              <span className="break-all font-mono text-xs">{workspace.cwd ?? "None"}</span>
            </DetailRow>
            <DetailRow label="Repo">
              {workspace.repoUrl && isSafeExternalUrl(workspace.repoUrl) ? (
                <a href={workspace.repoUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:underline">
                  {workspace.repoUrl}
                  <ExternalLink className="h-3 w-3" />
                </a>
              ) : workspace.repoUrl ? (
                <span className="break-all font-mono text-xs">{workspace.repoUrl}</span>
              ) : "None"}
            </DetailRow>
            <DetailRow label="Default ref">{workspace.defaultRef ?? "None"}</DetailRow>
            <DetailRow label="Updated">{new Date(workspace.updatedAt).toLocaleString()}</DetailRow>
          </div>
        </div>
      </div>

      {promoteOpen ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 pt-16">
          <div className="w-full max-w-xl rounded-2xl border border-border bg-card p-5 shadow-2xl">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Promote approved files to repo</h2>
              <button
                className="rounded-lg px-2 py-1 text-muted-foreground hover:text-foreground"
                onClick={() => setPromoteOpen(false)}
              >
                ✕
              </button>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              Runs the git-workflow-pr skill in <span className="font-mono">{workspace.cwd}</span> targeting{" "}
              <span className="font-mono">{workspace.repoUrl}</span>. The agent will branch, commit, push, and open a
              pull request.
            </p>

            <label className="mt-4 block space-y-1.5">
              <span className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
                Approved file paths (one per line, workspace-relative)
              </span>
              <textarea
                className="min-h-28 w-full rounded-lg border border-border bg-background px-3 py-2 font-mono text-sm outline-none"
                value={promoteFilePaths}
                onChange={(event) => setPromoteFilePaths(event.target.value)}
                placeholder={"docs/astrologics-intake-form.md\ndesign/landing.png"}
                disabled={promoteWorkspace.isPending}
              />
            </label>

            <label className="mt-3 block space-y-1.5">
              <span className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">PR title</span>
              <input
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none"
                value={promoteTitle}
                onChange={(event) => setPromoteTitle(event.target.value)}
                placeholder="Optional PR title"
                disabled={promoteWorkspace.isPending}
              />
            </label>

            <div className="mt-5 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
              <Button
                className="w-full sm:w-auto"
                disabled={promoteWorkspace.isPending}
                onClick={() => {
                  const filePaths = promoteFilePaths
                    .split(/\r?\n/)
                    .map((line) => line.trim())
                    .filter(Boolean);
                  promoteWorkspace.mutate({ filePaths, title: promoteTitle });
                }}
              >
                {promoteWorkspace.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <GitPullRequest className="mr-2 h-4 w-4" />}
                {promoteWorkspace.isPending ? "Promoting…" : "Promote"}
              </Button>
              <Button variant="ghost" className="w-full sm:w-auto" onClick={() => setPromoteOpen(false)}>
                Close
              </Button>
            </div>

            {promoteResult ? (
              <div className="mt-4 rounded-xl border border-border bg-background p-3">
                <div className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">Result</div>
                <pre className="mt-2 max-h-64 overflow-y-auto whitespace-pre-wrap break-words font-mono text-xs text-foreground">
                  {promoteResult}
                </pre>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
