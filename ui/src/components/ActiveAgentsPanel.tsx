import { memo, useMemo } from "react";
import { Link } from "@/lib/router";
import { useQueries, useQuery } from "@tanstack/react-query";
import type { Issue, IssueRecoveryAction } from "@paperclipai/shared";
import { heartbeatsApi, type LiveRunForIssue } from "../api/heartbeats";
import type { TranscriptEntry } from "../adapters";
import { issuesApi } from "../api/issues";
import { queryKeys } from "../lib/queryKeys";
import { cn, relativeTime } from "../lib/utils";
import {
  deriveActiveRecoveryDisplayState,
  RECOVERY_CHIP_DEFAULT_TONE,
} from "../lib/recovery-display";
import { ExternalLink, Terminal, Activity } from "lucide-react";
import { Identity } from "./Identity";
import { RunChatSurface } from "./RunChatSurface";
import { useLiveRunTranscripts } from "./transcript/useLiveRunTranscripts";

function RunCardRecoveryChip({ action }: { action: IssueRecoveryAction }) {
  const state = deriveActiveRecoveryDisplayState(action);
  if (!state) return null;
  const tone = RECOVERY_CHIP_DEFAULT_TONE[state];
  const Icon = tone.icon;
  return (
    <span
      data-testid="active-agent-run-recovery-indicator"
      data-recovery-state={state}
      role="status"
      aria-label={tone.label}
      title={`${tone.label} — open the source task to act.`}
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-bold shadow-xs",
        tone.className,
      )}
    >
      <Icon className="h-3 w-3" aria-hidden />
      {tone.label}
    </span>
  );
}

const MIN_DASHBOARD_RUNS = 4;
const DASHBOARD_RUN_CARD_LIMIT = 4;
const DASHBOARD_LOG_POLL_INTERVAL_MS = 15_000;
const DASHBOARD_LOG_READ_LIMIT_BYTES = 64_000;
const DASHBOARD_MAX_CHUNKS_PER_RUN = 40;
const EMPTY_TRANSCRIPT: TranscriptEntry[] = [];

function isRunActive(run: LiveRunForIssue): boolean {
  return run.status === "queued" || run.status === "running";
}

interface ActiveAgentsPanelProps {
  companyId: string;
  title?: string;
  minRunCount?: number;
  fetchLimit?: number;
  cardLimit?: number;
  gridClassName?: string;
  cardClassName?: string;
  emptyMessage?: string;
  queryScope?: string;
  showMoreLink?: boolean;
}

export function ActiveAgentsPanel({
  companyId,
  title = "Agents",
  minRunCount = MIN_DASHBOARD_RUNS,
  fetchLimit,
  cardLimit = DASHBOARD_RUN_CARD_LIMIT,
  gridClassName,
  cardClassName,
  emptyMessage = "No recent agent runs.",
  queryScope = "dashboard",
  showMoreLink = true,
}: ActiveAgentsPanelProps) {
  const { data: liveRuns } = useQuery({
    queryKey: [...queryKeys.liveRuns(companyId), queryScope, { minRunCount, fetchLimit }],
    queryFn: () => heartbeatsApi.liveRunsForCompany(companyId, { minCount: minRunCount, limit: fetchLimit }),
  });

  const runs = liveRuns ?? [];
  const visibleRuns = useMemo(() => runs.slice(0, cardLimit), [cardLimit, runs]);
  const hiddenRunCount = Math.max(0, runs.length - visibleRuns.length);
  const visibleIssueIds = useMemo(
    () => [...new Set(visibleRuns.map((run) => run.issueId).filter((issueId): issueId is string => Boolean(issueId)))],
    [visibleRuns],
  );

  const issueQueries = useQueries({
    queries: visibleIssueIds.map((issueId) => ({
      queryKey: queryKeys.issues.detail(issueId),
      queryFn: () => issuesApi.get(issueId),
      staleTime: 30_000,
      retry: false,
    })),
  });

  const issueById = useMemo(() => {
    const map = new Map<string, Issue>();
    for (const query of issueQueries) {
      const issue = query.data;
      if (issue) map.set(issue.id, issue);
    }
    return map;
  }, [issueQueries]);

  const { transcriptByRun, hasOutputForRun } = useLiveRunTranscripts({
    runs: visibleRuns,
    companyId,
    maxChunksPerRun: DASHBOARD_MAX_CHUNKS_PER_RUN,
    logPollIntervalMs: DASHBOARD_LOG_POLL_INTERVAL_MS,
    logReadLimitBytes: DASHBOARD_LOG_READ_LIMIT_BYTES,
    enableRealtimeUpdates: false,
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-black uppercase tracking-wider text-foreground/80 flex items-center gap-2">
          <Activity className="h-4 w-4 text-primary" />
          {title}
        </h3>
        {showMoreLink && hiddenRunCount > 0 && (
          <Link to="/dashboard/live" className="text-xs font-bold text-muted-foreground hover:text-foreground transition-colors">
            +{hiddenRunCount} more active/recent run{hiddenRunCount === 1 ? "" : "s"} &rarr;
          </Link>
        )}
      </div>

      {runs.length === 0 ? (
        <div className="rounded-3xl border-2 border-border/80 bg-card/80 p-8 shadow-xl backdrop-blur-md text-center">
          <Terminal className="h-8 w-8 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-sm font-bold text-muted-foreground">{emptyMessage}</p>
        </div>
      ) : (
        <div className={cn("grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4", gridClassName)}>
          {visibleRuns.map((run) => (
            <AgentRunCard
              key={run.id}
              companyId={companyId}
              run={run}
              issue={run.issueId ? issueById.get(run.issueId) : undefined}
              transcript={transcriptByRun.get(run.id) ?? EMPTY_TRANSCRIPT}
              hasOutput={hasOutputForRun(run.id)}
              isActive={isRunActive(run)}
              className={cardClassName}
            />
          ))}
        </div>
      )}
    </div>
  );
}

const AgentRunCard = memo(function AgentRunCard({
  companyId,
  run,
  issue,
  transcript,
  hasOutput,
  isActive,
  className,
}: {
  companyId: string;
  run: LiveRunForIssue;
  issue?: Issue;
  transcript: TranscriptEntry[];
  hasOutput: boolean;
  isActive: boolean;
  className?: string;
}) {
  return (
    <div className={cn(
      "flex h-[340px] flex-col overflow-hidden rounded-3xl border-2 shadow-xl backdrop-blur-md transition-all duration-300",
      isActive
        ? "border-cyan-500/40 bg-gradient-to-b from-cyan-500/[0.08] via-card/90 to-card shadow-[0_20px_50px_rgba(6,182,212,0.12)] ring-1 ring-cyan-500/20"
        : "border-border/80 bg-card/80 hover:border-border",
      className,
    )}>
      <div className="border-b-2 border-border/60 px-4 py-4 bg-muted/20">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2.5">
              {isActive ? (
                <span className="relative flex h-3 w-3 shrink-0">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-cyan-400 opacity-75" />
                  <span className="relative inline-flex h-3 w-3 rounded-full bg-cyan-500 shadow-sm shadow-cyan-500/50" />
                </span>
              ) : (
                <span className="inline-flex h-3 w-3 rounded-full bg-muted-foreground/40 shrink-0" />
              )}
              <Identity name={run.agentName} size="sm" className="font-bold text-foreground [&>span:last-child]:!text-xs [&>span:last-child]:!font-bold" />
            </div>
            <div className="mt-2.5 flex items-center gap-2 text-xs font-bold text-muted-foreground">
              {isActive ? (
                run.status === "queued" ? (
                  <span className="inline-flex items-center gap-1.5 rounded-xl border border-amber-500/40 bg-amber-100 px-2.5 py-1 text-[10px] font-black uppercase tracking-widest text-amber-700 shadow-xs content-dark:bg-amber-500/15 content-dark:text-amber-700">
                    Queued
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 rounded-xl border border-cyan-500/40 bg-cyan-100 px-2.5 py-1 text-[10px] font-black uppercase tracking-widest text-cyan-700 shadow-xs content-dark:bg-cyan-500/15 content-dark:text-cyan-700">
                    <span className="relative flex h-1.5 w-1.5">
                      <span className="animate-pulse absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75" />
                      <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-cyan-500" />
                    </span>
                    Running
                  </span>
                )
              ) : (
                <span className="rounded-xl border border-border/60 bg-background/80 px-2.5 py-1 text-[10px] font-black uppercase tracking-widest shadow-xs tabular-nums">
                  {run.finishedAt ? `Finished ${relativeTime(run.finishedAt)}` : `Started ${relativeTime(run.createdAt)}`}
                </span>
              )}
            </div>
          </div>

          <Link
            to={`/agents/${run.agentId}/runs/${run.id}`}
            className="inline-flex items-center justify-center h-8 w-8 rounded-full border-2 border-border/80 bg-background/85 text-muted-foreground transition-all hover:text-foreground hover:border-foreground/40 shadow-xs hover:scale-105"
            title="View full run details"
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </Link>
        </div>

        {run.issueId && (
          <div className="mt-3.5 rounded-2xl border-2 border-border/70 bg-background/80 p-3 shadow-inner space-y-2">
            <Link
              to={`/issues/${issue?.identifier ?? run.issueId}`}
              className={cn(
                "line-clamp-2 text-xs font-bold leading-snug hover:underline block",
                isActive ? "text-cyan-700 font-extrabold" : "text-foreground hover:text-primary",
              )}
              title={issue?.title ? `${issue?.identifier ?? run.issueId.slice(0, 8)} - ${issue.title}` : issue?.identifier ?? run.issueId.slice(0, 8)}
            >
              <span className="font-black uppercase tracking-wider text-muted-foreground mr-1.5">{issue?.identifier ?? run.issueId.slice(0, 8)}</span>
              {issue?.title ? issue.title : ""}
            </Link>
            {issue?.activeRecoveryAction ? (
              <div>
                <RunCardRecoveryChip action={issue.activeRecoveryAction} />
              </div>
            ) : null}
          </div>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4 bg-card/40">
        <RunChatSurface
          run={run}
          transcript={transcript}
          hasOutput={hasOutput}
          companyId={companyId}
        />
      </div>
    </div>
  );
});