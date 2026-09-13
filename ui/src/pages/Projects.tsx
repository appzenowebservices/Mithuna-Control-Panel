import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Project, ResourceMembershipState } from "@paperclipai/shared";
import { projectsApi } from "../api/projects";
import { useCompany } from "../context/CompanyContext";
import { useDialogActions } from "../context/DialogContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { queryKeys } from "../lib/queryKeys";
import { ProjectTile } from "../components/projects/ProjectTile";
import { ProjectControlBar, type ProjectSortField, type ProjectSortDir } from "../components/projects/ProjectControlBar";
import { StatusBadge } from "../components/StatusBadge";
import { MembershipAction } from "../components/MembershipAction";
import { EmptyState } from "../components/EmptyState";
import { PageSkeleton } from "../components/PageSkeleton";
import { cn, formatDate, formatNumber, formatProjectBudget, projectUrl } from "../lib/utils";
import {
  resourceMembershipState,
  useResourceMembershipMutation,
  useResourceMemberships,
} from "../hooks/useResourceMemberships";
import { Button } from "@/components/ui/button";
import { ArrowUpRight, Hexagon, Plus, LayoutGrid, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";

function compareProjectNames(left: Project, right: Project) {
  const nameDiff = left.name.localeCompare(right.name, undefined, { sensitivity: "base" });
  return nameDiff !== 0 ? nameDiff : left.id.localeCompare(right.id);
}

function projectTime(value: Date | string | null | undefined): number | null {
  if (!value) return null;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : null;
}

function compareOptionalTime(
  left: Date | string | null | undefined,
  right: Date | string | null | undefined,
  sortDir: ProjectSortDir,
) {
  const leftTime = projectTime(left);
  const rightTime = projectTime(right);
  if (leftTime === null && rightTime === null) return 0;
  if (leftTime === null) return 1;
  if (rightTime === null) return -1;
  return sortDir === "asc" ? leftTime - rightTime : rightTime - leftTime;
}

function sortProjects(projects: Project[], sortField: ProjectSortField, sortDir: ProjectSortDir) {
  return [...projects].sort((left, right) => {
    let comparison = 0;
    if (sortField === "name") {
      comparison = compareProjectNames(left, right);
      return sortDir === "asc" ? comparison : -comparison;
    }

    if (sortField === "updated") comparison = compareOptionalTime(left.updatedAt, right.updatedAt, sortDir);
    else if (sortField === "created") comparison = compareOptionalTime(left.createdAt, right.createdAt, sortDir);
    else comparison = compareOptionalTime(left.targetDate, right.targetDate, sortDir);

    if (comparison === 0) comparison = compareProjectNames(left, right);
    return comparison;
  });
}

function ProjectStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border/70 bg-background/50 px-3 py-2 text-center shadow-xs">
      <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className="mt-0.5 truncate text-sm font-black tabular-nums text-foreground">{value}</p>
    </div>
  );
}

interface ProjectCardProps {
  project: Project;
  membershipState: ResourceMembershipState;
  pending: boolean;
  pendingState?: ResourceMembershipState | null;
  onJoin: () => void;
  onLeave: () => void;
  className?: string;
}

function ProjectFeaturedCard({
  project,
  membershipState,
  pending,
  pendingState,
  onJoin,
  onLeave,
  className,
}: ProjectCardProps) {
  const isLeft = membershipState === "left";
  return (
    <Link
      to={projectUrl(project)}
      className={cn(
        "group relative flex flex-col gap-4 overflow-hidden rounded-3xl border-2 border-primary/40 bg-gradient-to-br from-primary/25 via-card/80 to-card/70 p-6 shadow-xl backdrop-blur-md transition-all duration-300 hover:border-primary/70 hover:shadow-2xl",
        isLeft && "opacity-60 saturate-[.75]",
        className,
      )}
    >
      <div className="pointer-events-none absolute -right-10 -top-10 h-36 w-36 rounded-full bg-primary/20 blur-2xl" />
      <div className="flex items-start justify-between gap-3">
        <ProjectTile color={project.color ?? null} icon={project.icon ?? null} size="lg" />
        <StatusBadge status={project.status} />
      </div>
      <div className="flex-1 min-w-0">
        <h3 className="text-2xl font-black tracking-tight text-foreground underline-offset-4 group-hover:underline">
          {project.name}
        </h3>
        {project.description && (
          <p className="mt-2 line-clamp-3 text-sm font-medium text-muted-foreground">{project.description}</p>
        )}
      </div>
      <div className="grid grid-cols-3 gap-2">
        <ProjectStat label="Tasks" value={formatNumber(project.taskCount ?? 0)} />
        <ProjectStat label="Budget" value={project.budget ? formatProjectBudget(project.budget) : "—"} />
        <ProjectStat label="Target" value={project.targetDate ? formatDate(project.targetDate) : "—"} />
      </div>
      <div className="flex items-center justify-between gap-3 pt-1">
        <span className="inline-flex items-center gap-1.5 text-xs font-black uppercase tracking-wider text-primary">
          Open project
          <ArrowUpRight className="h-4 w-4 transition-transform duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
        </span>
        <MembershipAction
          state={membershipState}
          pending={pending}
          pendingState={pendingState}
          resourceName={project.name}
          onJoin={onJoin}
          onLeave={onLeave}
        />
      </div>
    </Link>
  );
}

function ProjectBentoCard({
  project,
  membershipState,
  pending,
  pendingState,
  onJoin,
  onLeave,
  className,
}: ProjectCardProps) {
  const isLeft = membershipState === "left";
  return (
    <Link
      to={projectUrl(project)}
      className={cn(
        "group flex flex-col gap-3 rounded-3xl border-2 border-border/80 bg-card/80 p-5 shadow-xl backdrop-blur-md transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-2xl",
        isLeft && "opacity-60 saturate-[.75]",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <ProjectTile color={project.color ?? null} icon={project.icon ?? null} size="md" />
        <StatusBadge status={project.status} />
      </div>
      <h3 className="line-clamp-1 text-base font-black tracking-tight text-foreground">{project.name}</h3>
      {project.description && (
        <p className="line-clamp-2 text-xs font-medium text-muted-foreground">{project.description}</p>
      )}
      <div className="mt-auto flex items-center justify-between gap-2 pt-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="rounded-xl border border-border/60 bg-secondary/50 px-2 py-1 text-[10px] font-black tabular-nums text-foreground/80">
            {formatNumber(project.taskCount ?? 0)} tasks
          </span>
          {project.budget && (
            <span className="rounded-xl border border-border/60 bg-secondary/50 px-2 py-1 text-[10px] font-black tabular-nums text-foreground/80">
              {formatProjectBudget(project.budget)}
            </span>
          )}
          {project.targetDate && (
            <span className="hidden rounded-xl border border-border/60 bg-secondary/50 px-2 py-1 text-[10px] font-black tabular-nums text-foreground/80 md:inline-flex">
              {formatDate(project.targetDate)}
            </span>
          )}
        </div>
        <MembershipAction
          state={membershipState}
          pending={pending}
          pendingState={pendingState}
          resourceName={project.name}
          onJoin={onJoin}
          onLeave={onLeave}
        />
      </div>
    </Link>
  );
}

export function Projects() {
  const { selectedCompanyId } = useCompany();
  const { openNewProject } = useDialogActions();
  const { setBreadcrumbs } = useBreadcrumbs();
  const [sortField, setSortField] = useState<ProjectSortField>("name");
  const [sortDir, setSortDir] = useState<ProjectSortDir>("asc");

  useEffect(() => {
    setBreadcrumbs([{ label: "Projects" }]);
  }, [setBreadcrumbs]);

  const { data: allProjects, isLoading, error } = useQuery({
    queryKey: queryKeys.projects.list(selectedCompanyId!),
    queryFn: () => projectsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });
  const membershipsQuery = useResourceMemberships(selectedCompanyId);
  const membershipMutation = useResourceMembershipMutation(selectedCompanyId);
  const projects = useMemo(
    () => (allProjects ?? []).filter((p) => !p.archivedAt),
    [allProjects],
  );
  const sortedProjects = useMemo(
    () => sortProjects(projects, sortField, sortDir),
    [projects, sortDir, sortField],
  );
  const groupedProjects = useMemo(() => {
    const groups = {
      mine: [] as typeof sortedProjects,
      other: [] as typeof sortedProjects,
    };

    for (const project of sortedProjects) {
      const state = resourceMembershipState(membershipsQuery.data, "project", project.id);
      if (state === "left") groups.other.push(project);
      else groups.mine.push(project);
    }

    return groups;
  }, [membershipsQuery.data, sortedProjects]);

  if (!selectedCompanyId) {
    return (
      <div className="py-16">
        <EmptyState icon={Hexagon} message="Select a company to view projects." />
      </div>
    );
  }

  if (isLoading) {
    return <PageSkeleton variant="list" />;
  }

  return (
    <div className="max-w-6xl space-y-8 pb-16">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 border-b border-border/80 pb-6">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/15 text-primary shadow-inner">
            <LayoutGrid className="h-7 w-7" />
          </div>
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight text-foreground">Projects Dashboard</h1>
            <p className="text-base text-muted-foreground mt-1 font-normal">
              Manage workspace initiatives, track budgets, and control team memberships.
            </p>
          </div>
        </div>

        <Button size="lg" onClick={openNewProject} className="cursor-pointer gap-2 rounded-2xl px-6 font-bold shadow-md h-12">
          <Plus className="h-5 w-5" />
          Add Project
        </Button>
      </div>

      <ProjectControlBar
        projectCount={projects.length}
        onSortChange={(field, dir) => {
          setSortField(field);
          setSortDir(dir);
        }}
      />

      {error && (
        <div className="rounded-2xl border border-destructive/40 bg-destructive/5 p-4 text-sm font-semibold text-destructive shadow-sm">
          {error.message}
        </div>
      )}

      {!isLoading && projects.length === 0 && (
        <div className="py-12 rounded-3xl border border-dashed border-border/80">
          <EmptyState
            icon={Hexagon}
            message="No projects yet. Get started by creating your first workspace initiative."
            action="Add Project"
            onAction={openNewProject}
          />
        </div>
      )}

    {projects.length > 0 && (
        <div className="space-y-10">
          {([
            ["My Projects", groupedProjects.mine],
            ["Other Projects", groupedProjects.other],
          ] as const).map(([label, sectionProjects]) => {
            if (sectionProjects.length === 0) return null;

            return (
              <section key={label} className="space-y-4">
                <div className="flex items-center justify-between px-2">
                  <h2 className="text-xl font-black tracking-tight text-foreground flex items-center gap-2.5">
                    <div className="flex h-7 w-7 items-center justify-center rounded-xl bg-primary/20 text-primary border border-primary/30 shadow-xs">
                      <Sparkles className="h-4 w-4" />
                    </div>
                    {label}
                  </h2>
                  <span className="text-xs font-extrabold uppercase tracking-widest rounded-2xl bg-secondary px-3.5 py-1 text-primary border border-secondary/30 shadow-xs">
                    {sectionProjects.length} project{sectionProjects.length === 1 ? "" : "s"}
                  </span>
                </div>

                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:auto-rows-[minmax(0,1fr)] lg:grid-flow-dense lg:grid-cols-3">
                  {sectionProjects.map((project, index) => {
                    const state = resourceMembershipState(membershipsQuery.data, "project", project.id);
                    const pending = membershipMutation.isPending &&
                      membershipMutation.variables?.resourceType === "project" &&
                      membershipMutation.variables.resourceId === project.id;
                    const cardProps = {
                      project,
                      membershipState: state,
                      pending,
                      pendingState: pending ? membershipMutation.variables?.state : null,
                      onJoin: () => membershipMutation.mutate({
                        resourceType: "project",
                        resourceId: project.id,
                        resourceName: project.name,
                        state: "joined",
                      }),
                      onLeave: () => membershipMutation.mutate({
                        resourceType: "project",
                        resourceId: project.id,
                        resourceName: project.name,
                        state: "left",
                      }),
                    };

                    if (index === 0 && label === "My Projects") {
                      return (
                        <ProjectFeaturedCard
                          key={project.id}
                          {...cardProps}
                          className="sm:col-span-2 lg:col-span-2 lg:row-span-2"
                        />
                      );
                    }
                    return <ProjectBentoCard key={project.id} {...cardProps} />;
                  })}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}