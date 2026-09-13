import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Radio, Search, RefreshCw, ExternalLink } from "lucide-react";
import { useCompany } from "@/context/CompanyContext";
import { channelsApi, type ChannelsPlatform } from "@/api/channels";
import { queryKeys } from "@/lib/queryKeys";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

function statusTone(status: ChannelsPlatform["status"]) {
  switch (status) {
    case "connected":
      return "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30";
    case "disabled":
      return "bg-zinc-500/15 text-zinc-600 dark:text-zinc-300 border-zinc-500/20";
    case "not_configured":
      return "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30";
    default:
      return "bg-slate-500/10 text-slate-600 dark:text-slate-300 border-slate-500/20";
  }
}

function statusIcon(status: ChannelsPlatform["status"]) {
  switch (status) {
    case "connected":
      return "🟢";
    case "disabled":
      return "⚪";
    case "not_configured":
      return "🟡";
    default:
      return "⚫";
  }
}

export function Channels() {
  const { selectedCompanyId, selectedCompany } = useCompany();
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"all" | "connected" | "not_configured">("all");

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: queryKeys.channels.list(selectedCompanyId ?? ""),
    queryFn: () => channelsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const platforms = useMemo(() => {
    if (!data?.platforms) return [];
    let list = data.platforms;
    if (filter !== "all") list = list.filter((p) => p.status === filter);
    if (q.trim()) {
      const needle = q.trim().toLowerCase();
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(needle) ||
          p.label.toLowerCase().includes(needle) ||
          p.channels.some((c) => String(c.name ?? "").toLowerCase().includes(needle) || String(c.id).toLowerCase().includes(needle)),
      );
    }
    return list;
  }, [data, q, filter]);

  if (!selectedCompanyId) {
    return (
      <div className="mx-auto max-w-5xl p-6">
        <p className="text-sm text-muted-foreground">Select a company to view channels ✨</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl p-6 space-y-6">
      {/* header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <Radio className="h-6 w-6 text-primary" />
            Channels
            <span className="text-sm font-normal text-muted-foreground">· {selectedCompany?.name ?? selectedCompanyId}</span>
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Read-only overview of Hermes messaging platforms & reachable channels 📡 — per-company view of the global gateway.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={`h-4 w-4 mr-1.5 ${isFetching ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardHeader className="py-3">
            <CardDescription>Platforms</CardDescription>
            <CardTitle className="text-2xl">{data?.totalPlatforms ?? "—"}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="py-3">
            <CardDescription>Connected</CardDescription>
            <CardTitle className="text-2xl">{data?.connectedPlatforms ?? "—"}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="py-3">
            <CardDescription>Channels</CardDescription>
            <CardTitle className="text-2xl">{data?.totalChannels ?? "—"}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="py-3">
            <CardDescription>Last sync</CardDescription>
            <CardTitle className="text-sm font-normal truncate" title={data?.updatedAt ?? undefined}>
              {data?.updatedAt ? new Date(data.updatedAt).toLocaleString() : "—"}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      {/* toolbar */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[220px] max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search platform or channel… 🔍" value={q} onChange={(e) => setQ(e.target.value)} className="pl-8" />
        </div>
        <div className="flex gap-1.5">
          {[
            { k: "all", label: "All" },
            { k: "connected", label: "Connected 🟢" },
            { k: "not_configured", label: "Not configured" },
          ].map((opt) => (
            <Button
              key={opt.k}
              variant={filter === opt.k ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setFilter(opt.k as typeof filter)}
            >
              {opt.label}
            </Button>
          ))}
        </div>
        <span className="text-xs text-muted-foreground ml-auto">
          {platforms.length} platforms shown · aliases: {data?.aliasCount ?? 0}
        </span>
      </div>

      {isLoading ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">Loading channels… ✨</CardContent>
        </Card>
      ) : error ? (
        <Card className="border-destructive/40">
          <CardContent className="py-6 text-sm text-destructive">
            Failed to load channels: {(error as Error).message}
          </CardContent>
        </Card>
      ) : platforms.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No platforms match your filter. Try “All” or clear search 🌸
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {platforms.map((p) => (
            <Card key={p.name} className="flex flex-col">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <span className="text-lg" aria-hidden>
                      {p.emoji}
                    </span>
                    {p.label}
                    <span className="text-xs font-normal text-muted-foreground">{p.name}</span>
                  </CardTitle>
                  <Badge variant="outline" className={`shrink-0 ${statusTone(p.status)}`}>
                    {statusIcon(p.status)} {p.status.replace("_", " ")}
                  </Badge>
                </div>
                <CardDescription className="flex items-center gap-2">
                  <span>
                    {p.channelCount} channel{p.channelCount !== 1 ? "s" : ""} · {p.source}
                  </span>
                  {p.enabled === false ? <Badge variant="secondary" className="text-[10px]">disabled</Badge> : null}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex-1 min-h-[80px]">
                {p.channels.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic">No channels discovered yet — send a message or check gateway ⏳</p>
                ) : (
                  <ul className="space-y-1.5 max-h-[180px] overflow-auto pr-1">
                    {p.channels.slice(0, 30).map((c, idx) => (
                      <li
                        key={`${c.id}-${idx}`}
                        className="flex items-center justify-between gap-2 rounded-md border border-border/50 px-2.5 py-1.5 text-xs bg-muted/30"
                      >
                        <span className="truncate font-medium" title={String(c.name)}>
                          {String(c.name ?? c.id)}
                        </span>
                        <span className="shrink-0 text-[10px] text-muted-foreground font-mono truncate max-w-[110px]" title={String(c.id)}>
                          {String(c.id)}
                        </span>
                      </li>
                    ))}
                    {p.channels.length > 30 ? (
                      <li className="text-[11px] text-muted-foreground text-center pt-1">+{p.channels.length - 30} more</li>
                    ) : null}
                  </ul>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <p className="text-xs text-muted-foreground flex items-center gap-1.5">
        <ExternalLink className="h-3 w-3" />
        Read-only · Data from <code className="px-1 py-0.5 rounded bg-muted text-[11px]">~/.hermes/channel_directory.json</code> via Hermes gateway. Configure platforms in Hermes · this view is company-scoped but mirrors the global gateway (per-company isolation planned) 🌷
      </p>
    </div>
  );
}
