import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { issuesApi } from "../api/issues";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { queryKeys } from "../lib/queryKeys";
import { StatusIcon } from "../components/StatusIcon";

import { EmptyState } from "../components/EmptyState";
import { PageSkeleton } from "../components/PageSkeleton";
import { cn, formatDate } from "../lib/utils";
import { ArrowUpRight, CircleDot, ListTodo } from "lucide-react";
import { Link } from "@/lib/router";
import { BentoGrid, MetaPill, PageHeader } from "../components/design-system";

export function MyIssues() {
  const { selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();

  useEffect(() => {
    setBreadcrumbs([{ label: "My Tasks" }]);
  }, [setBreadcrumbs]);

  const { data: issues, isLoading, error } = useQuery({
    queryKey: queryKeys.issues.list(selectedCompanyId!),
    queryFn: () => issuesApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  if (!selectedCompanyId) {
    return <EmptyState icon={ListTodo} message="Select a company to view your tasks." />;
  }

  if (isLoading) {
    return <PageSkeleton variant="list" />;
  }

  // Show issues that are not assigned (user-created or unassigned)
  const myIssues = (issues ?? []).filter(
    (i) => !i.assigneeAgentId && !["done", "cancelled"].includes(i.status)
  );

  return (
    <div className="max-w-6xl space-y-6 pb-16">
      <PageHeader
        icon={CircleDot}
        title="My Tasks"
        description="Tasks that need your attention — user-created and unassigned issues."
      />

      {error && <p className="text-sm text-destructive">{error.message}</p>}

      {myIssues.length === 0 && (
        <div className="rounded-3xl border border-dashed border-border/80">
          <EmptyState icon={ListTodo} message="No tasks assigned to you." />
        </div>
      )}

      {myIssues.length > 0 && (
        <BentoGrid>
          {myIssues.map((issue, index) => {
            const featured = index === 0;
            return (
              <Link
                key={issue.id}
                to={`/issues/${issue.identifier ?? issue.id}`}
                className={cn(
                  featured
                    ? "group relative flex flex-col gap-4 overflow-hidden rounded-3xl border-2 border-primary/40 bg-gradient-to-br from-primary/25 via-card/80 to-card/70 p-6 shadow-xl backdrop-blur-md transition-all duration-300 hover:border-primary/70 hover:shadow-2xl sm:col-span-2 lg:col-span-2 lg:row-span-2"
                    : "group flex flex-col gap-3 rounded-3xl border-2 border-border/80 bg-card/80 p-5 shadow-xl backdrop-blur-md transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-2xl",
                )}
              >
                {featured ? (
                  <div className="pointer-events-none absolute -right-10 -top-10 h-36 w-36 rounded-full bg-primary/20 blur-2xl" />
                ) : null}
                <div className="flex items-start justify-between gap-3">
                  <StatusIcon status={issue.status} blockerAttention={issue.blockerAttention} />
                  <MetaPill>{formatDate(issue.createdAt)}</MetaPill>
                </div>
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="w-fit rounded-md border border-border/60 bg-muted/60 px-2 py-0.5 font-mono text-xs text-muted-foreground">
                    {issue.identifier ?? issue.id.slice(0, 8)}
                  </span>
                  <h3
                    className={cn(
                      "mt-2 font-black tracking-tight text-foreground",
                      featured ? "text-2xl leading-tight" : "line-clamp-2 text-base",
                    )}
                  >
                    {issue.title}
                  </h3>
                </div>
                {featured ? (
                  <span className="mt-auto inline-flex items-center gap-1.5 pt-1 text-xs font-black uppercase tracking-wider text-primary">
                    Open task
                    <ArrowUpRight className="h-4 w-4 transition-transform duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                  </span>
                ) : null}
              </Link>
            );
          })}
        </BentoGrid>
      )}
    </div>
  );
}
