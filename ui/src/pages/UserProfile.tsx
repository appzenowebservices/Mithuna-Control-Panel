import { useEffect, useMemo, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertCircle, UserRound } from "lucide-react";
import type { UserProfileDailyPoint, UserProfileWindowStats } from "@paperclipai/shared";
import { Link, useParams } from "@/lib/router";
import { userProfilesApi } from "../api/userProfiles";
import { Avatar, AvatarFallback, AvatarImage } from "../components/ui/avatar";
import { EmptyState } from "../components/EmptyState";
import { PageSkeleton } from "../components/PageSkeleton";
import { IssueStatusBadge } from "../components/StatusBadge";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { useCompany } from "../context/CompanyContext";
import { queryKeys } from "../lib/queryKeys";
import { cn, formatCents, formatDate, formatNumber, formatShortDate, formatTokens, issueUrl, providerDisplayName, relativeTime } from "../lib/utils";

const NO_COMPANY = "__none__";

function initials(name: string | null | undefined) {
  const value = name?.trim() || "User";
  const parts = value.split(/\s+/).filter(Boolean);
  if (parts.length > 1) return `${parts[0]?.[0] ?? ""}${parts[parts.length - 1]?.[0] ?? ""}`.toUpperCase();
  return value.slice(0, 2).toUpperCase();
}

function totalTokens(stats: Pick<UserProfileWindowStats, "inputTokens" | "cachedInputTokens" | "outputTokens">) {
  return stats.inputTokens + stats.cachedInputTokens + stats.outputTokens;
}

function completionRate(stats: UserProfileWindowStats) {
  if (stats.touchedIssues === 0) return "0%";
  return `${Math.round((stats.completedIssues / stats.touchedIssues) * 100)}%`;
}

function Panel({
  title,
  meta,
  children,
  className,
  bodyClassName,
}: {
  title: string;
  meta?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={cn("flex min-h-0 flex-col rounded-3xl border-2 border-border/80 bg-card/80 shadow-xl backdrop-blur-md", className)}>
      <header className="flex shrink-0 items-baseline justify-between gap-3 border-b border-border/70 px-5 py-3">
        <h2 className="text-lg font-black tracking-tight">{title}</h2>
        {meta != null ? <span className="text-xs font-semibold tabular-nums text-muted-foreground">{meta}</span> : null}
      </header>
      <div className={cn("min-h-0 flex-1 overflow-y-auto px-5 py-1", bodyClassName)}>{children}</div>
    </section>
  );
}

function StatCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="relative overflow-hidden rounded-3xl border-2 border-border/80 bg-card/80 p-5 shadow-xl backdrop-blur-md">
      <div className="pointer-events-none absolute -right-8 -top-8 size-28 rounded-full bg-primary/10 blur-2xl" />
      <div className="relative">
        <div className="text-3xl font-black tabular-nums">{value}</div>
        <div className="mt-1 text-[10px] font-black uppercase tracking-widest text-muted-foreground">{label}</div>
        {hint ? <div className="mt-1 truncate text-xs font-semibold text-muted-foreground/80">{hint}</div> : null}
      </div>
    </div>
  );
}

function Metric({ value, label }: { value: string; label: string }) {
  return (
    <div className="min-w-0">
      <div className="truncate text-xl font-black tabular-nums">{value}</div>
      <div className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">{label}</div>
    </div>
  );
}

function WindowCard({ stats }: { stats: UserProfileWindowStats }) {
  const tokens = totalTokens(stats);
  return (
    <div className="rounded-3xl border-2 border-border/80 bg-card/80 p-4 shadow-xl backdrop-blur-md">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">{stats.label}</h2>
        <span className="text-[11px] font-semibold tabular-nums text-muted-foreground">{completionRate(stats)} done</span>
      </div>
      <div className="mt-2.5 grid grid-cols-4 gap-2">
        <Metric value={formatNumber(stats.touchedIssues)} label="Touched" />
        <Metric value={formatNumber(stats.completedIssues)} label="Completed" />
        <Metric value={formatNumber(stats.commentCount)} label="Comments" />
        <Metric value={formatNumber(stats.activityCount)} label="Actions" />
      </div>
      <div className="mt-2.5 grid grid-cols-2 gap-x-4 gap-y-0.5 border-t border-border/70 pt-2 text-[11px] tabular-nums text-muted-foreground">
        <span>Tokens</span>
        <span className="text-right font-semibold text-foreground">{formatTokens(tokens)}</span>
        <span>Spend</span>
        <span className="text-right font-semibold text-foreground">{formatCents(stats.costCents)}</span>
        <span>Created</span>
        <span className="text-right font-semibold text-foreground">{formatNumber(stats.createdIssues)}</span>
        <span>Open</span>
        <span className="text-right font-semibold text-foreground">{formatNumber(stats.assignedOpenIssues)}</span>
      </div>
    </div>
  );
}

function UsageChart({ points }: { points: UserProfileDailyPoint[] }) {
  const totals = points.map((point) => totalTokens(point));
  const maxTokens = Math.max(1, ...totals);
  const maxCompleted = Math.max(1, ...points.map((point) => point.completedIssues));

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="grid h-16 shrink-0 grid-cols-[repeat(14,minmax(0,1fr))] items-end gap-1.5 sm:gap-2">
        {points.map((point) => {
          const tokens = totalTokens(point);
          const heightPct = tokens === 0 ? 0 : Math.max(2, Math.round((tokens / maxTokens) * 100));
          const completedPct = point.completedIssues === 0
            ? 0
            : Math.max(8, Math.round((point.completedIssues / maxCompleted) * 36));
          return (
            <div key={point.date} className="group flex h-full flex-col justify-end">
              <div
                className="w-full rounded-t-sm bg-foreground/80 transition-opacity group-hover:bg-foreground"
                style={{ height: `${heightPct}%`, minHeight: tokens === 0 ? 1 : undefined }}
                title={`${formatShortDate(point.date)}: ${formatTokens(tokens)} tokens, ${point.completedIssues} completed`}
              />
              {completedPct > 0 ? (
                <div
                  className="mt-1 w-full rounded-full bg-emerald-500/80"
                  style={{ height: 2, opacity: Math.min(1, 0.35 + completedPct / 100) }}
                />
              ) : null}
            </div>
          );
        })}
      </div>
      <div className="mt-2 shrink-0 grid grid-cols-[repeat(14,minmax(0,1fr))] gap-1.5 text-[10px] tabular-nums text-muted-foreground sm:gap-2">
        {points.map((point, index) => (
          <div key={point.date} className="text-center">
            {index === 0 || index === 6 || index === 13 ? formatShortDate(point.date) : null}
          </div>
        ))}
      </div>
      <div className="mt-2 flex shrink-0 flex-wrap items-center gap-4 text-[10px] uppercase tracking-wide text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 bg-foreground/80" /> tokens / day
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-[3px] w-4 rounded-full bg-emerald-500/80" /> completions
        </span>
      </div>
    </div>
  );
}

interface UsageRow {
  key: string;
  label: string;
  sublabel: string;
  costCents: number;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
}

function UsageRows({ empty, rows }: { empty: string; rows: UsageRow[] }) {
  if (rows.length === 0) {
    return <div className="py-4 text-sm text-muted-foreground">{empty}</div>;
  }
  return (
    <ul className="divide-y divide-border">
      {rows.map((row) => (
        <li key={row.key} className="grid gap-1 py-2 sm:grid-cols-[1fr_auto] sm:items-center">
          <div className="min-w-0">
            <div className="truncate text-sm font-medium">{row.label}</div>
            <div className="truncate text-xs text-muted-foreground">{row.sublabel}</div>
          </div>
          <div className="flex items-baseline gap-3 text-xs tabular-nums sm:justify-end">
            <span className="text-muted-foreground">{formatTokens(totalTokens(row))}</span>
            <span className="font-medium">{formatCents(row.costCents)}</span>
          </div>
        </li>
      ))}
    </ul>
  );
}

export function UserProfile() {
  const { userSlug = "" } = useParams<{ userSlug: string }>();
  const { selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const companyId = selectedCompanyId ?? NO_COMPANY;

  const { data, isLoading, error } = useQuery({
    queryKey: queryKeys.userProfile(companyId, userSlug),
    queryFn: () => userProfilesApi.get(companyId, userSlug),
    enabled: !!selectedCompanyId && !!userSlug,
  });

  useEffect(() => {
    setBreadcrumbs([{ label: "Users" }, { label: data?.user.name ?? userSlug }]);
  }, [data?.user.name, setBreadcrumbs, userSlug]);

  const allTime = data?.stats.find((entry) => entry.key === "all");
  const last7 = data?.stats.find((entry) => entry.key === "last7");
  const displayName = data?.user.name?.trim() || data?.user.email?.split("@")[0] || "User";

  const agentUsageRows = useMemo<UsageRow[]>(
    () =>
      (data?.topAgents ?? []).map((row) => ({
        key: row.agentId ?? "unknown",
        label: row.agentName ?? (row.agentId ? row.agentId.slice(0, 8) : "unknown"),
        sublabel: "Task-linked usage",
        costCents: row.costCents,
        inputTokens: row.inputTokens,
        cachedInputTokens: row.cachedInputTokens,
        outputTokens: row.outputTokens,
      })),
    [data?.topAgents],
  );

  const providerUsageRows = useMemo<UsageRow[]>(
    () =>
      (data?.topProviders ?? []).map((row) => ({
        key: `${row.provider}:${row.biller}:${row.model}`,
        label: `${providerDisplayName(row.provider)} / ${row.model}`,
        sublabel: `Billed through ${providerDisplayName(row.biller)}`,
        costCents: row.costCents,
        inputTokens: row.inputTokens,
        cachedInputTokens: row.cachedInputTokens,
        outputTokens: row.outputTokens,
      })),
    [data?.topProviders],
  );

  if (!selectedCompanyId) {
    return <EmptyState icon={UserRound} message="Select a company to view user profiles." />;
  }

  if (isLoading) {
    return <PageSkeleton variant="dashboard" />;
  }

  if (error || !data) {
    return <EmptyState icon={AlertCircle} message="User profile not found for this company." />;
  }

  const allTimeTokens = allTime ? totalTokens(allTime) : 0;
  const dailyTokens = data.daily.reduce((sum, point) => sum + totalTokens(point), 0);
  const metaParts = [
    data.user.membershipRole ?? "member",
    data.user.membershipStatus,
    `joined ${formatDate(data.user.joinedAt)}`,
  ];

  return (
    <div className="flex flex-col gap-4">
      <section className="shrink-0 border-b border-border/80 pb-4">
        <div className="flex flex-wrap items-center gap-4">
          <Avatar className="size-16 border-2 border-border/80 shadow-xl" size="lg">
            {data.user.image ? <AvatarImage src={data.user.image} alt={displayName} /> : null}
            <AvatarFallback className="text-lg font-black">{initials(displayName)}</AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
              <h1 className="truncate text-3xl font-extrabold tracking-tight">{displayName}</h1>
              <span className="text-base font-medium text-muted-foreground">@{data.user.slug}</span>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm text-muted-foreground">
              {data.user.email ? <span className="truncate">{data.user.email}</span> : null}
              {data.user.email ? <span aria-hidden>·</span> : null}
              <span>{metaParts.join(" · ")}</span>
            </div>
          </div>
        </div>
      </section>

      <div className="grid shrink-0 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="All-time tokens" value={formatTokens(allTimeTokens)} hint={`${formatCents(allTime?.costCents ?? 0)} spent`} />
        <StatCard label="Completed" value={formatNumber(allTime?.completedIssues ?? 0)} hint={allTime ? `${completionRate(allTime)} rate` : undefined} />
        <StatCard label="Open assigned" value={formatNumber(allTime?.assignedOpenIssues ?? 0)} hint={`${formatNumber(allTime?.createdIssues ?? 0)} created`} />
        <StatCard label="7-day actions" value={formatNumber(last7?.activityCount ?? 0)} hint={`${formatNumber(last7?.commentCount ?? 0)} comments`} />
      </div>

      <div className="grid shrink-0 gap-4 lg:grid-cols-3">
        {data.stats.map((entry) => <WindowCard key={entry.key} stats={entry} />)}
      </div>

      <div className="grid h-[360px] shrink-0 gap-4 lg:grid-cols-3">
        <div className="flex min-h-0 flex-col gap-4 lg:col-span-2">
          <Panel
            title="Last 14 days"
            meta={`${formatTokens(dailyTokens)} tokens`}
            className="shrink-0"
            bodyClassName="pb-3 pt-3"
          >
            <UsageChart points={data.daily} />
          </Panel>

          <Panel title="Recent tasks" meta={data.recentIssues.length} className="flex-1">
            {data.recentIssues.length === 0 ? (
              <div className="py-4 text-sm text-muted-foreground">No touched tasks yet.</div>
            ) : (
              <ul className="divide-y divide-border">
                {data.recentIssues.map((issue) => (
                  <li key={issue.id}>
                    <Link
                      to={issueUrl(issue)}
                      className="grid gap-1 py-2 transition-colors hover:bg-accent/40 sm:grid-cols-[auto_1fr_auto] sm:items-center"
                    >
                      <span className="font-mono text-xs text-muted-foreground">{issue.identifier ?? issue.id.slice(0, 8)}</span>
                      <span className="truncate text-sm">{issue.title}</span>
                      <span className="flex items-center gap-2.5 sm:justify-end">
                        <IssueStatusBadge status={issue.status} />
                        <span className="text-xs tabular-nums text-muted-foreground">{relativeTime(issue.updatedAt)}</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>

        <Panel title="Recent activity" meta={data.recentActivity.length} className="min-h-0">
          {data.recentActivity.length === 0 ? (
            <div className="py-4 text-sm text-muted-foreground">No direct user actions recorded yet.</div>
          ) : (
            <ul className="divide-y divide-border">
              {data.recentActivity.map((event) => (
                <li key={event.id} className="grid gap-0.5 py-2 sm:grid-cols-[1fr_auto] sm:items-center">
                  <div className="min-w-0">
                    <div className="truncate text-sm">{event.action.replaceAll("_", " ")}</div>
                    <div className="truncate text-xs text-muted-foreground">
                      {event.entityType} · {event.entityId.slice(0, 12)}
                    </div>
                  </div>
                  <span className="text-xs tabular-nums text-muted-foreground sm:justify-self-end">{relativeTime(event.createdAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <div className="grid shrink-0 gap-4 lg:grid-cols-2">
        <Panel title="Agent attribution" meta={agentUsageRows.length} className="max-h-40">
          <UsageRows empty="No issue-linked token usage yet." rows={agentUsageRows} />
        </Panel>
        <Panel title="Provider mix" meta={providerUsageRows.length} className="max-h-40">
          <UsageRows empty="No provider usage attributed yet." rows={providerUsageRows} />
        </Panel>
      </div>
    </div>
  );
}
