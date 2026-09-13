import { useMemo, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useDialog } from "../context/DialogContext";
import { useCompany } from "../context/CompanyContext";
import { accessApi } from "../api/access";
import { projectsApi } from "../api/projects";
import { agentsApi } from "../api/agents";
import { goalsApi } from "../api/goals";
import { assetsApi } from "../api/assets";
import { teamsApi } from "../api/teams";
import { buildMarkdownMentionOptions } from "../lib/company-members";
import { queryKeys } from "../lib/queryKeys";
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Maximize2,
  Minimize2,
  Target,
  Calendar,
  Plus,
  X,
  HelpCircle,
  FolderGit2,
  FolderCode,
  Sparkles,
  AlertCircle,
  HardDrive,
  FolderOpen,
  GitPullRequest,
  GitBranch,
  Terminal,
  Users,
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "../lib/utils";
import { MarkdownEditor, type MarkdownEditorRef, type MentionOption } from "./MarkdownEditor";
import { StatusBadge } from "./StatusBadge";
import { ChoosePathButton } from "./PathInstructionsModal";

const projectStatuses = [
  { value: "backlog", label: "Backlog" },
  { value: "planned", label: "Planned" },
  { value: "in_progress", label: "In Progress" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
];

export function NewProjectDialog() {
  const { newProjectOpen, closeNewProject } = useDialog();
  const { selectedCompanyId, selectedCompany } = useCompany();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState("planned");
  const [goalIds, setGoalIds] = useState<string[]>([]);
  const [targetDate, setTargetDate] = useState("");
  const [expanded, setExpanded] = useState(false);
  const [workspaceLocalPath, setWorkspaceLocalPath] = useState("");
  const [workspaceRepoUrl, setWorkspaceRepoUrl] = useState("");
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);
  const [selectedTeamId, setSelectedTeamId] = useState("");

  const [statusOpen, setStatusOpen] = useState(false);
  const [goalOpen, setGoalOpen] = useState(false);
  const descriptionEditorRef = useRef<MarkdownEditorRef>(null);

  const { data: goals } = useQuery({
    queryKey: queryKeys.goals.list(selectedCompanyId!),
    queryFn: () => goalsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId && newProjectOpen,
  });

  const { data: agents } = useQuery({
    queryKey: queryKeys.agents.list(selectedCompanyId!),
    queryFn: () => agentsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId && newProjectOpen,
  });

  const { data: teams = [] } = useQuery({
    queryKey: queryKeys.teams.list(selectedCompanyId!),
    queryFn: () => teamsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId && newProjectOpen,
  });

  const { data: companyMembers } = useQuery({
    queryKey: queryKeys.access.companyUserDirectory(selectedCompanyId!),
    queryFn: () => accessApi.listUserDirectory(selectedCompanyId!),
    enabled: !!selectedCompanyId && newProjectOpen,
  });

  const mentionOptions = useMemo<MentionOption[]>(() => {
    return buildMarkdownMentionOptions({
      agents,
      members: companyMembers?.users,
    });
  }, [agents, companyMembers?.users]);

  const createProject = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      projectsApi.create(selectedCompanyId!, data),
  });

  const uploadDescriptionImage = useMutation({
    mutationFn: async (file: File) => {
      if (!selectedCompanyId) throw new Error("No company selected");
      return assetsApi.uploadImage(selectedCompanyId, file, "projects/drafts");
    },
  });

  function reset() {
    setName("");
    setDescription("");
    setStatus("planned");
    setGoalIds([]);
    setTargetDate("");
    setExpanded(false);
    setWorkspaceLocalPath("");
    setWorkspaceRepoUrl("");
    setWorkspaceError(null);
    setSelectedTeamId("");
  }

  const isAbsolutePath = (value: string) => value.startsWith("/") || /^[A-Za-z]:[\\/]/.test(value);

  const looksLikeRepoUrl = (value: string) => {
    try {
      const parsed = new URL(value);
      if (parsed.protocol !== "https:") return false;
      const segments = parsed.pathname.split("/").filter(Boolean);
      return segments.length >= 2;
    } catch {
      return false;
    }
  };

  const deriveWorkspaceNameFromPath = (value: string) => {
    const normalized = value.trim().replace(/[\\/]+$/, "");
    const segments = normalized.split(/[\\/]/).filter(Boolean);
    return segments[segments.length - 1] ?? "Local folder";
  };

  const deriveWorkspaceNameFromRepo = (value: string) => {
    try {
      const parsed = new URL(value);
      const segments = parsed.pathname.split("/").filter(Boolean);
      const repo = segments[segments.length - 1]?.replace(/\.git$/i, "") ?? "";
      return repo || "GitHub repo";
    } catch {
      return "GitHub repo";
    }
  };

  async function handleSubmit() {
    if (!selectedCompanyId || !name.trim()) return;
    const localPath = workspaceLocalPath.trim();
    const repoUrl = workspaceRepoUrl.trim();

    if (localPath && !isAbsolutePath(localPath)) {
      setWorkspaceError("Local folder must be a full absolute path.");
      return;
    }
    if (repoUrl && !looksLikeRepoUrl(repoUrl)) {
      setWorkspaceError("Repo must use a valid GitHub or GitHub Enterprise repo URL.");
      return;
    }

    setWorkspaceError(null);

    try {
      const created = await createProject.mutateAsync({
        name: name.trim(),
        description: description.trim() || undefined,
        status,
        ...(goalIds.length > 0 ? { goalIds } : {}),
        ...(targetDate ? { targetDate } : {}),
        ...(selectedTeamId ? { teamId: selectedTeamId } : {}),
      });

      if (localPath || repoUrl) {
        const workspacePayload: Record<string, unknown> = {
          name: localPath
            ? deriveWorkspaceNameFromPath(localPath)
            : deriveWorkspaceNameFromRepo(repoUrl),
          ...(localPath ? { cwd: localPath } : {}),
          ...(repoUrl ? { repoUrl } : {}),
        };
        await projectsApi.createWorkspace(created.id, workspacePayload);
      }

      queryClient.invalidateQueries({ queryKey: queryKeys.projects.list(selectedCompanyId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.projects.detail(created.id) });
      reset();
      closeNewProject();
    } catch {
      // surface through createProject.isError
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSubmit();
    }
  }

  const selectedGoals = (goals ?? []).filter((g) => goalIds.includes(g.id));
  const availableGoals = (goals ?? []).filter((g) => !goalIds.includes(g.id));

  return (
    <Dialog
      open={newProjectOpen}
      onOpenChange={(open) => {
        if (!open) {
          reset();
          closeNewProject();
        }
      }}
    >
      <DialogContent
        showCloseButton={false}
        className={cn(
          "p-0 gap-0 overflow-hidden shadow-2xl rounded-3xl border border-secondary/30 bg-[white] text-secondary",
          expanded ? "sm:max-w-2xl" : "sm:max-w-xl"
        )}
        onKeyDown={handleKeyDown}
      >
        {/* Header Banner: Secondary Dark Tone */}
        <div className="flex items-center justify-between px-6 py-4 bg-secondary text-white border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary text-secondary shadow-md ring-2 ring-accent/30">
              <Sparkles className="h-5 w-5 text-secondary" />
            </div>
            <div>
              <div className="flex items-center gap-2 text-xs font-medium text-white/70">
                {selectedCompany && (
                  <span className="bg-primary/20 text-primary px-2 py-0.5 rounded-lg font-sans font-bold border border-primary/30">
                    {selectedCompany.name}
                  </span>
                )}
                <span>&bull;</span>
                <span>Workspace Initiative</span>
              </div>
              <h2 className="text-base font-extrabold tracking-tight text-white">Create New Project</h2>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-xl text-white/70 hover:bg-white/10 hover:text-white transition-colors"
              onClick={() => setExpanded(!expanded)}
            >
              {expanded ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-xl text-white/70 hover:bg-white/10 hover:text-white transition-colors"
              onClick={() => { reset(); closeNewProject(); }}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Form Body: Main BG Color (--color-primary: #FFE9A8) */}
        <div className="p-6 space-y-5 bg-primary/50 max-h-[75vh] overflow-y-auto text-secondary">
          {/* Name Field */}
          <div className="space-y-2">
            <label className="text-xs font-bold uppercase tracking-wider text-secondary/70">Project Name</label>
            <input
              className="w-full text-xl font-bold tracking-tight bg-secondary/[0.04] border border-secondary/20 focus:border-secondary focus:ring-2 focus:ring-secondary/20 focus:bg-white/40 rounded-2xl px-4 py-3.5 text-secondary outline-none transition-all placeholder:text-secondary/40 shadow-xs"
              placeholder="e.g. Q3 Growth Initiative, Core Refactor..."
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Tab" && !e.shiftKey) {
                  e.preventDefault();
                  descriptionEditorRef.current?.focus();
                }
              }}
              autoFocus
            />
          </div>

          {/* Description Field */}
          <div className="space-y-2">
            <label className="text-xs font-bold uppercase tracking-wider text-secondary/70">Description</label>
            <div className="rounded-2xl border border-secondary/20 bg-secondary/[0.04] p-2.5 shadow-xs focus-within:border-secondary focus-within:ring-2 focus-within:ring-secondary/20 focus-within:bg-white/40 transition-all">
              <MarkdownEditor
                ref={descriptionEditorRef}
                value={description}
                onChange={setDescription}
                placeholder="What is this project about? Use @ to mention team members or agents..."
                bordered={false}
                mentions={mentionOptions}
                contentClassName={cn("text-sm text-secondary font-normal", expanded ? "min-h-[180px]" : "min-h-[100px]")}
                imageUploadHandler={async (file) => {
                  const asset = await uploadDescriptionImage.mutateAsync(file);
                  return asset.contentPath;
                }}
              />
            </div>
          </div>
          {/* Workspace Configurations Bento Box */}
          <div className="rounded-2xl border border-secondary/20 bg-secondary/[0.03] p-5 space-y-4 shadow-xs">
            <div className="flex items-center justify-between border-b border-secondary/10 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-secondary text-primary">
                  <Terminal className="h-4 w-4 text-primary" />
                </div>
                <span className="text-xs font-extrabold uppercase tracking-wider text-secondary">Workspace Setup</span>
              </div>
              <span className="text-xs font-semibold text-secondary/80 bg-secondary/10 px-2.5 py-0.5 rounded-full">Optional</span>
            </div>

            <div className="grid grid-cols-1 gap-4">
              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <label className="flex items-center gap-1.5 text-xs font-bold text-secondary">
                    <GitBranch className="h-3.5 w-3.5 text-secondary" />
                    Repository URL
                  </label>
                  <Tooltip delayDuration={300}>
                    <TooltipTrigger asChild>
                      <HelpCircle className="h-3.5 w-3.5 text-secondary/60 cursor-help hover:text-secondary transition-colors" />
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-[240px] text-xs font-normal">
                      Link a GitHub repository so agents can clone, read, and push code for this project.
                    </TooltipContent>
                  </Tooltip>
                </div>
                <div className="relative flex items-center">
                  <GitPullRequest className="absolute left-3.5 h-3.5 w-3.5 text-secondary/40 pointer-events-none" />
                  <input
                    className="w-full rounded-xl border border-secondary/20 bg-white/60 pl-9 pr-3.5 py-2.5 text-xs text-secondary outline-none font-sans focus:border-secondary focus:ring-2 focus:ring-secondary/20 transition-all shadow-xs"
                    value={workspaceRepoUrl}
                    onChange={(e) => { setWorkspaceRepoUrl(e.target.value); setWorkspaceError(null); }}
                    placeholder="https://github.com/org/repo"
                  />
                </div>
              </div>

              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <label className="flex items-center gap-1.5 text-xs font-bold text-secondary">
                    <FolderOpen className="h-3.5 w-3.5 text-secondary" />
                    Local Workspace Folder
                  </label>
                  <Tooltip delayDuration={300}>
                    <TooltipTrigger asChild>
                      <HelpCircle className="h-3.5 w-3.5 text-secondary/60 cursor-help hover:text-secondary transition-colors" />
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-[240px] text-xs font-normal">
                      Set an absolute path on this machine where local agents will read and write files.
                    </TooltipContent>
                  </Tooltip>
                </div>
                <div className="flex items-center gap-2">
                  <div className="relative flex items-center w-full">
                    <HardDrive className="absolute left-3.5 h-3.5 w-3.5 text-secondary/40 pointer-events-none" />
                    <input
                      className="w-full rounded-xl border border-secondary/20 bg-white/60 pl-9 pr-3.5 py-2.5 text-xs font-sans text-secondary outline-none focus:border-secondary focus:ring-2 focus:ring-secondary/20 transition-all shadow-xs"
                      value={workspaceLocalPath}
                      onChange={(e) => { setWorkspaceLocalPath(e.target.value); setWorkspaceError(null); }}
                      placeholder="/absolute/path/to/workspace"
                    />
                  </div>
                  <ChoosePathButton />
                </div>
              </div>
            </div>

            {workspaceError && (
              <div className="flex items-center gap-2 rounded-xl bg-destructive/10 border border-destructive/30 p-2.5 text-xs font-bold text-destructive">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{workspaceError}</span>
              </div>
            )}
          </div>
          {/* Metadata Chips / Properties */}
          <div className="space-y-2">
            <label className="text-xs font-bold uppercase tracking-wider text-secondary/70">Properties</label>
            <div className="flex items-center gap-2.5 flex-wrap">
              {/* Status */}
              <Popover open={statusOpen} onOpenChange={setStatusOpen}>
                <PopoverTrigger asChild>
                  <button className="inline-flex items-center gap-2 rounded-xl border border-secondary/25 bg-secondary/[0.04] hover:bg-secondary/[0.08] px-3.5 py-2 text-xs font-semibold text-secondary transition-all shadow-xs hover:border-secondary/50">
                    <StatusBadge status={status} />
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-44 p-1.5 rounded-2xl shadow-xl border-secondary/20 bg-primary text-secondary" align="start">
                  {projectStatuses.map((s) => (
                    <button
                      key={s.value}
                      className={cn(
                        "flex items-center gap-2 w-full px-3 py-2 text-xs font-semibold rounded-xl transition-all",
                        s.value === status ? "bg-secondary text-primary shadow-sm font-bold" : "text-secondary/80 hover:bg-secondary/10 hover:text-secondary"
                      )}
                      onClick={() => { setStatus(s.value); setStatusOpen(false); }}
                    >
                      {s.label}
                    </button>
                  ))}
                </PopoverContent>
              </Popover>

              <div className="inline-flex items-center gap-2 rounded-xl border border-secondary/25 bg-secondary/[0.04] px-3.5 py-2 text-xs font-semibold text-secondary shadow-xs transition-all">
                <Users className="h-3.5 w-3.5 text-secondary" />
                <select
                  className="bg-transparent outline-none text-xs font-semibold text-secondary"
                  value={selectedTeamId}
                  onChange={(e) => setSelectedTeamId(e.target.value)}
                >
                  <option value="">No team</option>
                  {teams.map((team) => (
                    <option key={team.id} value={team.id}>
                      {team.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Goals chips */}
              {selectedGoals.map((goal) => (
                <span
                  key={goal.id}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-secondary/25 bg-secondary/[0.06] px-3.5 py-2 text-xs font-semibold text-secondary shadow-xs"
                >
                  <Target className="h-3.5 w-3.5 text-secondary" />
                  <span className="max-w-[140px] truncate">{goal.title}</span>
                  <button
                    className="text-secondary/60 hover:text-destructive ml-1 transition-colors"
                    onClick={() => setGoalIds((prev) => prev.filter((id) => id !== goal.id))}
                    aria-label={`Remove goal ${goal.title}`}
                    type="button"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </span>
              ))}

              <Popover open={goalOpen} onOpenChange={setGoalOpen}>
                <PopoverTrigger asChild>
                  <button
                    className="inline-flex items-center gap-1.5 rounded-xl border border-secondary/25 bg-secondary/[0.04] hover:bg-secondary/[0.08] px-3.5 py-2 text-xs font-semibold text-secondary transition-all shadow-xs hover:border-secondary/50 disabled:opacity-50"
                    disabled={selectedGoals.length > 0 && availableGoals.length === 0}
                  >
                    <Plus className="h-3.5 w-3.5 text-secondary" />
                    <span>{selectedGoals.length > 0 ? "Add Goal" : "Link Goal"}</span>
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-56 p-1.5 rounded-2xl shadow-xl border-secondary/20 bg-primary text-secondary" align="start">
                  {selectedGoals.length === 0 && (
                    <button
                      className="flex items-center gap-2 w-full px-3 py-2 text-xs font-semibold rounded-xl text-secondary/60 hover:bg-secondary/10 hover:text-secondary transition-all"
                      onClick={() => setGoalOpen(false)}
                    >
                      No goal
                    </button>
                  )}
                  {availableGoals.map((g) => (
                    <button
                      key={g.id}
                      className="flex items-center gap-2 w-full px-3 py-2 text-xs font-semibold rounded-xl text-secondary hover:bg-secondary/10 transition-all truncate"
                      onClick={() => {
                        setGoalIds((prev) => [...prev, g.id]);
                        setGoalOpen(false);
                      }}
                    >
                      {g.title}
                    </button>
                  ))}
                  {selectedGoals.length > 0 && availableGoals.length === 0 && (
                    <div className="px-3 py-2 text-xs font-medium text-secondary/60">
                      All goals selected.
                    </div>
                  )}
                </PopoverContent>
              </Popover>

              {/* Target date */}
              <div className="inline-flex items-center gap-2 rounded-xl border border-secondary/25 bg-secondary/[0.04] hover:bg-secondary/[0.08] px-3.5 py-2 text-xs font-semibold text-secondary shadow-xs transition-all">
                <Calendar className="h-3.5 w-3.5 text-secondary" />
                <input
                  type="date"
                  className="bg-transparent outline-none text-xs w-28 text-secondary font-medium cursor-pointer"
                  value={targetDate}
                  onChange={(e) => setTargetDate(e.target.value)}
                  placeholder="Target date"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Footer Actions: Secondary Dark Tone with Accent (#f2b05a) Submit Button */}
        <div className="flex items-center justify-between px-6 py-4 bg-secondary text-white border-t border-white/10">
          <div>
            {createProject.isError && (
              <p className="text-xs font-bold text-accent">Failed to create project. Please try again.</p>
            )}
          </div>
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="lg"
              className="rounded-2xl px-5 font-bold shadow-xs h-11 border-white/20 bg-transparent text-white hover:bg-white/10 hover:text-white transition-colors"
              onClick={() => { reset(); closeNewProject(); }}
            >
              Cancel
            </Button>
            <Button
              size="lg"
              className="rounded-2xl px-6 font-bold shadow-lg h-11 gap-2 bg-accent text-secondary hover:bg-accent/90 disabled:opacity-50 transition-all"
              disabled={!name.trim() || createProject.isPending}
              onClick={handleSubmit}
            >
              {createProject.isPending ? "Creating Project..." : "Create Project"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}