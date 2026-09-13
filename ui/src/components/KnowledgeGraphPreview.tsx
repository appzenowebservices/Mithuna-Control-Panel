import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { agentsApi } from "../api/agents";
import { queryKeys } from "../lib/queryKeys";
import { MarkdownBody } from "./MarkdownBody";
import { RefreshCw, Network, Loader2 } from "lucide-react";

export function KnowledgeGraphPreview({ agentId, companyId }: { agentId: string; companyId?: string }) {
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState(false);

  const { data: bundle } = useQuery({
    queryKey: queryKeys.agents.instructionsBundle(agentId),
    queryFn: () => agentsApi.instructionsBundle(agentId, companyId),
    enabled: Boolean(companyId),
  });

  const hasGraph = bundle?.files.some((f) => f.path.toLowerCase() === "knowledge_graph.md");

  const { data: file, isLoading } = useQuery({
    queryKey: queryKeys.agents.instructionsFile(agentId, "KNOWLEDGE_GRAPH.md"),
    queryFn: () => agentsApi.instructionsFile(agentId, "KNOWLEDGE_GRAPH.md", companyId),
    enabled: Boolean(companyId) && Boolean(hasGraph),
  });

  const refresh = useMutation({
    mutationFn: () => agentsApi.refreshKnowledgeGraph(agentId, companyId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.agents.instructionsBundle(agentId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.agents.instructionsFile(agentId, "KNOWLEDGE_GRAPH.md") });
    },
  });

  return (
    <div className="rounded-xl border border-border/60 bg-card/60 p-3 space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-xs font-bold text-muted-foreground">
          <Network className="h-3.5 w-3.5" /> Knowledge Graph
        </div>
        <div className="flex items-center gap-1">
          <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={() => refresh.mutate()} disabled={refresh.isPending}>
            {refresh.isPending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <RefreshCw className="h-3 w-3 mr-1" />}
            Refresh
          </Button>
          {file && (
            <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setExpanded((v) => !v)}>
              {expanded ? "Hide" : "Show"}
            </Button>
          )}
        </div>
      </div>

      {!hasGraph && (
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          No <span className="font-mono">KNOWLEDGE_GRAPH.md</span> yet. Click Refresh to generate from your markdown files. Add explicit links like <span className="font-mono">[[SOUL.template.md]]</span> in your MD to create edges.
        </p>
      )}

      {isLoading && <div className="text-xs text-muted-foreground">Loading graph…</div>}

      {file && expanded && (
        <div className="rounded-lg border border-border/50 bg-background p-3 max-h-[520px] overflow-auto paperclip-markdown-graph">
          <MarkdownBody>{file.content}</MarkdownBody>
        </div>
      )}

      {file && !expanded && (
        <div className="rounded-lg border border-border/50 bg-background p-2 overflow-hidden">
          <div className="max-h-[220px] overflow-hidden">
            <MarkdownBody>{file.content}</MarkdownBody>
          </div>
          <div className="pt-2 text-center">
            <span className="text-[11px] text-muted-foreground">Graph rendered above — click Show for full nodes/edges tables</span>
          </div>
        </div>
      )}

      {refresh.isError && (
        <div className="text-xs text-destructive bg-destructive/10 rounded p-2">
          {refresh.error instanceof Error ? refresh.error.message : String(refresh.error)}
        </div>
      )}
    </div>
  );
}
