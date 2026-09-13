import { useState, useEffect, useMemo } from "react";
import { useLocation, useNavigate } from "@/lib/router";
import { useQuery } from "@tanstack/react-query";
import { useCompany } from "../context/CompanyContext";
import { useDialogActions } from "../context/DialogContext";
import { useSidebar } from "../context/SidebarContext";
import { issuesApi } from "../api/issues";
import { agentsApi } from "../api/agents";
import { projectsApi } from "../api/projects";
import { instanceSettingsApi } from "../api/instanceSettings";
import { queryKeys } from "../lib/queryKeys";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import {
  CircleDot,
  Bot,
  Hexagon,
  Target,
  LayoutDashboard,
  Inbox,
  DollarSign,
  History,
  SquarePen,
  FileCode2,
  Plus,
  Search,
} from "lucide-react";
import { Identity } from "./Identity";
import { agentUrl, projectUrl } from "../lib/utils";

const SEARCH_ALL_VALUE = "__paperclip-search-all__";

export function buildFullSearchPath(query: string) {
  const trimmed = query.trim();
  return trimmed.length === 0 ? "/search" : `/search?q=${encodeURIComponent(trimmed)}`;
}

const ISSUE_DETAIL_PATH_RE = /\/issues\/[^/?#]+(?:$|\?|#|\/)/;

function isOnIssueDetail(pathname: string): boolean {
  return ISSUE_DETAIL_PATH_RE.test(pathname);
}

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const navigate = useNavigate();
  const location = useLocation();
  const { selectedCompanyId } = useCompany();
  const { openNewIssue, openNewAgent } = useDialogActions();
  const { isMobile, setSidebarOpen } = useSidebar();
  const searchQuery = query.trim();
  const onIssueDetail = isOnIssueDetail(location.pathname);
  const { data: experimentalSettings } = useQuery({
    queryKey: queryKeys.instance.experimentalSettings,
    queryFn: () => instanceSettingsApi.getExperimental(),
    retry: false,
  });
  const fileViewerEnabled = experimentalSettings?.enableExperimentalFileViewer === true;

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen(true);
        if (isMobile) setSidebarOpen(false);
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isMobile, setSidebarOpen]);

  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  const { data: issues = [] } = useQuery({
    queryKey: queryKeys.issues.list(selectedCompanyId!),
    queryFn: () => issuesApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId && open && searchQuery.length === 0,
  });

  const { data: searchedIssues = [] } = useQuery({
    queryKey: queryKeys.issues.search(selectedCompanyId!, searchQuery, undefined, 10),
    queryFn: () => issuesApi.list(selectedCompanyId!, { q: searchQuery, limit: 10, includeRoutineExecutions: true }),
    enabled: !!selectedCompanyId && open && searchQuery.length > 0,
  });

  const { data: agents = [] } = useQuery({
    queryKey: queryKeys.agents.list(selectedCompanyId!),
    queryFn: () => agentsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId && open,
  });

  const { data: allProjects = [] } = useQuery({
    queryKey: queryKeys.projects.list(selectedCompanyId!),
    queryFn: () => projectsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId && open,
  });
  const projects = useMemo(
    () => allProjects.filter((p) => !p.archivedAt),
    [allProjects],
  );

  function go(path: string) {
    setOpen(false);
    navigate(path);
  }

  function goFullSearch() {
    go(buildFullSearchPath(searchQuery));
  }

  const agentName = (id: string | null) => {
    if (!id) return null;
    return agents.find((a) => a.id === id)?.name ?? null;
  };

  const visibleIssues = useMemo(
    () => (searchQuery.length > 0 ? searchedIssues : issues),
    [issues, searchedIssues, searchQuery],
  );

  const showSearchAll = searchQuery.length > 0;
  const showEmptyHint = showSearchAll && visibleIssues.length === 0;

  return (
    <CommandDialog 
      open={open} 
      onOpenChange={(v) => {
        setOpen(v);
        if (v && isMobile) setSidebarOpen(false);
      }}
    >
      <div className="overflow-hidden rounded-3xl border-2 border-border/80 bg-card shadow-2xl backdrop-blur-md">
        <CommandInput
          placeholder="Search tasks, agents, projects..."
          value={query}
          onValueChange={setQuery}
          onKeyDown={(event) => {
            if (event.key === "Enter" && showEmptyHint) {
              event.preventDefault();
              goFullSearch();
            }
          }}
          className="border-b-2 border-border/60 px-4 py-4 text-sm font-bold placeholder:text-muted-foreground/60 bg-transparent focus:ring-0"
        />
        <CommandList className="p-3 max-h-[360px] overflow-y-auto space-y-2">
          <CommandEmpty className="py-8 text-center text-sm font-bold text-muted-foreground">
            {showSearchAll ? (
              <span>
                No quick task matches. Press{" "}
                <kbd className="rounded-md border-2 border-border/80 bg-background px-1.5 py-0.5 text-xs font-black shadow-xs">↵</kbd>{" "}
                to <span className="font-black text-foreground">search all</span> or keep typing to refine.
              </span>
            ) : (
              "No results found."
            )}
          </CommandEmpty>

          {showSearchAll ? (
            <CommandGroup heading={<span className="text-xs font-black uppercase tracking-wider text-muted-foreground/80 px-2 py-1">Search</span>}>
              <CommandItem
                value={`${SEARCH_ALL_VALUE} ${searchQuery}`}
                onSelect={goFullSearch}
                className="flex items-center gap-3 rounded-2xl px-3 py-2.5 text-xs font-bold text-foreground aria-selected:bg-accent/80 aria-selected:text-accent-foreground border-2 border-border/70 bg-accent/30 transition-all cursor-pointer shadow-xs"
                data-testid="command-search-all"
              >
                <div className="flex items-center justify-center h-7 w-7 rounded-xl border border-border/80 bg-background/80 text-muted-foreground shadow-xs shrink-0">
                  <Search className="h-4 w-4" />
                </div>
                <span className="flex-1 truncate">
                  Search all for <span className="font-black text-foreground">&ldquo;{searchQuery}&rdquo;</span>
                </span>
                <span className="ml-auto inline-flex items-center gap-1.5 text-xs font-bold text-muted-foreground">
                  <span>open full search</span>
                  <kbd className="rounded-md border border-border/80 bg-background px-1.5 py-0.5 text-[10px] font-black shadow-xs">↵</kbd>
                </span>
              </CommandItem>
            </CommandGroup>
          ) : null}

          {showSearchAll ? <CommandSeparator className="my-2 border-t border-border/60" /> : null}

          <CommandGroup heading={<span className="text-xs font-black uppercase tracking-wider text-muted-foreground/80 px-2 py-1">Actions</span>}>
            <CommandItem
              onSelect={() => {
                setOpen(false);
                openNewIssue();
              }}
              className="flex items-center gap-3 rounded-2xl px-3 py-2.5 text-xs font-bold text-foreground aria-selected:bg-accent/80 aria-selected:text-accent-foreground transition-all cursor-pointer"
            >
              <div className="flex items-center justify-center h-7 w-7 rounded-xl border border-border/80 bg-background text-muted-foreground shadow-xs shrink-0">
                <SquarePen className="h-4 w-4" />
              </div>
              <span className="flex-1">Create new task</span>
              <span className="ml-auto rounded-md border border-border/80 bg-background px-1.5 py-0.5 text-[10px] font-black text-muted-foreground shadow-xs">C</span>
            </CommandItem>
            {onIssueDetail && fileViewerEnabled && (
              <CommandItem
                onSelect={() => {
                  setOpen(false);
                  window.dispatchEvent(new CustomEvent("paperclip:open-file-viewer"));
                }}
                className="flex items-center gap-3 rounded-2xl px-3 py-2.5 text-xs font-bold text-foreground aria-selected:bg-accent/80 aria-selected:text-accent-foreground transition-all cursor-pointer"
              >
                <div className="flex items-center justify-center h-7 w-7 rounded-xl border border-border/80 bg-background text-muted-foreground shadow-xs shrink-0">
                  <FileCode2 className="h-4 w-4" />
                </div>
                <span className="flex-1">Open file in this issue...</span>
                <span className="ml-auto rounded-md border border-border/80 bg-background px-1.5 py-0.5 text-[10px] font-black text-muted-foreground shadow-xs">g f</span>
              </CommandItem>
            )}
            <CommandItem
              onSelect={() => {
                setOpen(false);
                openNewAgent();
              }}
              className="flex items-center gap-3 rounded-2xl px-3 py-2.5 text-xs font-bold text-foreground aria-selected:bg-accent/80 aria-selected:text-accent-foreground transition-all cursor-pointer"
            >
              <div className="flex items-center justify-center h-7 w-7 rounded-xl border border-border/80 bg-background text-muted-foreground shadow-xs shrink-0">
                <Plus className="h-4 w-4" />
              </div>
              <span className="flex-1">Create new agent</span>
            </CommandItem>
            <CommandItem 
              onSelect={() => go("/projects")}
              className="flex items-center gap-3 rounded-2xl px-3 py-2.5 text-xs font-bold text-foreground aria-selected:bg-accent/80 aria-selected:text-accent-foreground transition-all cursor-pointer"
            >
              <div className="flex items-center justify-center h-7 w-7 rounded-xl border border-border/80 bg-background text-muted-foreground shadow-xs shrink-0">
                <Plus className="h-4 w-4" />
              </div>
              <span className="flex-1">Create new project</span>
            </CommandItem>
          </CommandGroup>

          <CommandSeparator className="my-2 border-t border-border/60" />

          <CommandGroup heading={<span className="text-xs font-black uppercase tracking-wider text-muted-foreground/80 px-2 py-1">Pages</span>}>
            <CommandItem 
              onSelect={() => go("/dashboard")}
              className="flex items-center gap-3 rounded-2xl px-3 py-2.5 text-xs font-bold text-foreground aria-selected:bg-accent/80 aria-selected:text-accent-foreground transition-all cursor-pointer"
            >
              <div className="flex items-center justify-center h-7 w-7 rounded-xl border border-border/80 bg-background text-muted-foreground shadow-xs shrink-0">
                <LayoutDashboard className="h-4 w-4" />
              </div>
              <span className="flex-1">Dashboard</span>
            </CommandItem>
            <CommandItem 
              onSelect={() => go("/inbox")}
              className="flex items-center gap-3 rounded-2xl px-3 py-2.5 text-xs font-bold text-foreground aria-selected:bg-accent/80 aria-selected:text-accent-foreground transition-all cursor-pointer"
            >
              <div className="flex items-center justify-center h-7 w-7 rounded-xl border border-border/80 bg-background text-muted-foreground shadow-xs shrink-0">
                <Inbox className="h-4 w-4" />
              </div>
              <span className="flex-1">Inbox</span>
            </CommandItem>
            <CommandItem 
              onSelect={() => go("/issues")}
              className="flex items-center gap-3 rounded-2xl px-3 py-2.5 text-xs font-bold text-foreground aria-selected:bg-accent/80 aria-selected:text-accent-foreground transition-all cursor-pointer"
            >
              <div className="flex items-center justify-center h-7 w-7 rounded-xl border border-border/80 bg-background text-muted-foreground shadow-xs shrink-0">
                <CircleDot className="h-4 w-4" />
              </div>
              <span className="flex-1">Tasks</span>
            </CommandItem>
            <CommandItem 
              onSelect={() => go("/projects")}
              className="flex items-center gap-3 rounded-2xl px-3 py-2.5 text-xs font-bold text-foreground aria-selected:bg-accent/80 aria-selected:text-accent-foreground transition-all cursor-pointer"
            >
              <div className="flex items-center justify-center h-7 w-7 rounded-xl border border-border/80 bg-background text-muted-foreground shadow-xs shrink-0">
                <Hexagon className="h-4 w-4" />
              </div>
              <span className="flex-1">Projects</span>
            </CommandItem>
            <CommandItem 
              onSelect={() => go("/goals")}
              className="flex items-center gap-3 rounded-2xl px-3 py-2.5 text-xs font-bold text-foreground aria-selected:bg-accent/80 aria-selected:text-accent-foreground transition-all cursor-pointer"
            >
              <div className="flex items-center justify-center h-7 w-7 rounded-xl border border-border/80 bg-background text-muted-foreground shadow-xs shrink-0">
                <Target className="h-4 w-4" />
              </div>
              <span className="flex-1">Goals</span>
            </CommandItem>
            <CommandItem 
              onSelect={() => go("/agents")}
              className="flex items-center gap-3 rounded-2xl px-3 py-2.5 text-xs font-bold text-foreground aria-selected:bg-accent/80 aria-selected:text-accent-foreground transition-all cursor-pointer"
            >
              <div className="flex items-center justify-center h-7 w-7 rounded-xl border border-border/80 bg-background text-muted-foreground shadow-xs shrink-0">
                <Bot className="h-4 w-4" />
              </div>
              <span className="flex-1">Agents</span>
            </CommandItem>
            <CommandItem 
              onSelect={() => go("/costs")}
              className="flex items-center gap-3 rounded-2xl px-3 py-2.5 text-xs font-bold text-foreground aria-selected:bg-accent/80 aria-selected:text-accent-foreground transition-all cursor-pointer"
            >
              <div className="flex items-center justify-center h-7 w-7 rounded-xl border border-border/80 bg-background text-muted-foreground shadow-xs shrink-0">
                <DollarSign className="h-4 w-4" />
              </div>
              <span className="flex-1">Costs</span>
            </CommandItem>
            <CommandItem 
              onSelect={() => go("/activity")}
              className="flex items-center gap-3 rounded-2xl px-3 py-2.5 text-xs font-bold text-foreground aria-selected:bg-accent/80 aria-selected:text-accent-foreground transition-all cursor-pointer"
            >
              <div className="flex items-center justify-center h-7 w-7 rounded-xl border border-border/80 bg-background text-muted-foreground shadow-xs shrink-0">
                <History className="h-4 w-4" />
              </div>
              <span className="flex-1">Activity</span>
            </CommandItem>
          </CommandGroup>

          {visibleIssues.length > 0 && (
            <>
              <CommandSeparator className="my-2 border-t border-border/60" />
              <CommandGroup heading={<span className="text-xs font-black uppercase tracking-wider text-muted-foreground/80 px-2 py-1">Tasks</span>}>
                {visibleIssues.slice(0, 10).map((issue) => (
                  <CommandItem
                    key={issue.id}
                    value={
                      searchQuery.length > 0
                        ? `${searchQuery} ${issue.identifier ?? ""} ${issue.title}`
                        : undefined
                    }
                    onSelect={() => go(`/issues/${issue.identifier ?? issue.id}`)}
                    className="flex items-center gap-3 rounded-2xl px-3 py-2.5 text-xs font-bold text-foreground aria-selected:bg-accent/80 aria-selected:text-accent-foreground transition-all cursor-pointer"
                  >
                    <div className="flex items-center justify-center h-7 w-7 rounded-xl border border-border/80 bg-background text-muted-foreground shadow-xs shrink-0">
                      <CircleDot className="h-4 w-4" />
                    </div>
                    <span className="text-muted-foreground mr-1 font-mono text-xs font-black">
                      {issue.identifier ?? issue.id.slice(0, 8)}
                    </span>
                    <span className="flex-1 truncate">{issue.title}</span>
                    {issue.assigneeAgentId && (() => {
                      const name = agentName(issue.assigneeAgentId);
                      return name ? <Identity name={name} size="sm" className="ml-2 hidden sm:inline-flex" /> : null;
                    })()}
                  </CommandItem>
                ))}
              </CommandGroup>
            </>
          )}

          {agents.length > 0 && (
            <>
              <CommandSeparator className="my-2 border-t border-border/60" />
              <CommandGroup heading={<span className="text-xs font-black uppercase tracking-wider text-muted-foreground/80 px-2 py-1">Agents</span>}>
                {agents.slice(0, 10).map((agent) => (
                  <CommandItem 
                    key={agent.id} 
                    onSelect={() => go(agentUrl(agent))}
                    className="flex items-center gap-3 rounded-2xl px-3 py-2.5 text-xs font-bold text-foreground aria-selected:bg-accent/80 aria-selected:text-accent-foreground transition-all cursor-pointer"
                  >
                    <div className="flex items-center justify-center h-7 w-7 rounded-xl border border-border/80 bg-background text-muted-foreground shadow-xs shrink-0">
                      <Bot className="h-4 w-4" />
                    </div>
                    <span className="flex-1">{agent.name}</span>
                    <span className="text-xs font-bold text-muted-foreground ml-2">{agent.role}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </>
          )}

          {projects.length > 0 && (
            <>
              <CommandSeparator className="my-2 border-t border-border/60" />
              <CommandGroup heading={<span className="text-xs font-black uppercase tracking-wider text-muted-foreground/80 px-2 py-1">Projects</span>}>
                {projects.slice(0, 10).map((project) => (
                  <CommandItem 
                    key={project.id} 
                    onSelect={() => go(projectUrl(project))}
                    className="flex items-center gap-3 rounded-2xl px-3 py-2.5 text-xs font-bold text-foreground aria-selected:bg-accent/80 aria-selected:text-accent-foreground transition-all cursor-pointer"
                  >
                    <div className="flex items-center justify-center h-7 w-7 rounded-xl border border-border/80 bg-background text-muted-foreground shadow-xs shrink-0">
                      <Hexagon className="h-4 w-4" />
                    </div>
                    <span className="flex-1">{project.name}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </>
          )}
        </CommandList>
      </div>
    </CommandDialog>
  );
}