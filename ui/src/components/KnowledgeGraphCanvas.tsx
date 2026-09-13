import { useMemo, useState, useRef, useEffect, useCallback } from "react";
import { Network, Maximize2, Minus, Plus, RefreshCw, Loader2, Sparkles, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";

type GraphNode = {
  id: string;
  label: string;
  path: string;
  degree: number;
  isEntry?: boolean;
  isGraphFile?: boolean;
};

type GraphEdge = {
  from: string;
  to: string;
  reason: string;
};

function parseGraphFromMarkdown(content: string): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  // parse Nodes table | id | file | edges |
  const lines = content.split("\n");
  let inNodes = false;
  let inEdges = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("## Nodes")) { inNodes = true; inEdges = false; continue; }
    if (trimmed.startsWith("## Edges")) { inNodes = false; inEdges = true; continue; }
    if (trimmed.startsWith(">") || trimmed.startsWith("#") || trimmed.startsWith("```") || !trimmed.startsWith("|")) {
      if (trimmed.startsWith("|") === false) continue;
    }
    if (trimmed.startsWith("| ---") || trimmed.startsWith("|---") || trimmed.toLowerCase().includes("| id | file")) continue;
    if (!trimmed.startsWith("|")) continue;
    const cols = trimmed.split("|").map((s) => s.trim()).filter(Boolean);
    if (inNodes && cols.length >= 2) {
      const id = cols[0];
      const file = cols[1];
      if (id === "—" || id === "-" || !id || file === "—") continue;
      // skip header separator already handled
      if (id.toLowerCase() === "id") continue;
      const degree = cols[2] ? parseInt(cols[2], 10) || 0 : 0;
      nodes.push({
        id,
        label: file.split("/").pop() || file,
        path: file,
        degree,
        isEntry: file.toLowerCase().endsWith("agents.md"),
        isGraphFile: file.toLowerCase() === "knowledge_graph.md",
      });
    } else if (inEdges && cols.length >= 3) {
      const from = cols[0];
      const to = cols[1];
      const reason = cols[2];
      if (from === "—" || from === "-" || !from) continue;
      if (from.toLowerCase() === "from") continue;
      edges.push({ from, to, reason });
    }
  }
  // Collapse duplicate from→to pairs (the refresh route can emit the same
  // link several times). Keeps the canvas readable: "3 nodes · 15 edges"
  // becomes the real topology, with multiplicity folded into the reason.
  const seen = new Map<string, GraphEdge & { count: number }>();
  for (const e of edges) {
    const key = `${e.from}→${e.to}`;
    const existing = seen.get(key);
    if (existing) {
      existing.count += 1;
    } else {
      seen.set(key, { ...e, count: 1 });
    }
  }
  const deduped = [...seen.values()].map((e) =>
    e.count > 1 ? { ...e, reason: `${e.reason} (×${e.count})` } : e,
  );
  return { nodes, edges: deduped };
}

function fallbackNodesFromContent(content: string): { nodes: GraphNode[]; edges: GraphEdge[] } {
  return parseGraphFromMarkdown(content);
}

// Simple force-lite circular layout with jitter based on degree
function layoutNodes(nodes: GraphNode[], width: number, height: number) {
  if (nodes.length === 0) return new Map<string, { x: number; y: number }>();
  // Sort entry first, then by degree desc so important nodes are central/top
  const sorted = [...nodes].sort((a, b) => {
    if (a.isEntry && !b.isEntry) return -1;
    if (!a.isEntry && b.isEntry) return 1;
    return b.degree - a.degree;
  });
  const positions = new Map<string, { x: number; y: number }>();
  const cx = width / 2;
  const cy = height / 2;
  const radius = Math.min(width, height) * 0.36;
  const innerRadius = radius * 0.45;

  // entry at center
  const entry = sorted.find((n) => n.isEntry);
  if (entry) {
    positions.set(entry.id, { x: cx, y: cy });
  }

  const ringNodes = sorted.filter((n) => !n.isEntry);

  // Tiny graphs (≤6 nodes): a horizontal row reads far better than a cramped
  // ring — rings collapse into a vertical blob when radius is height-bound.
  if (sorted.length <= 6) {
    const n = sorted.length;
    const spacing = n > 1 ? Math.min(240, (width - 160) / (n - 1 || 1)) : 0;
    sorted.forEach((node, i) => {
      positions.set(node.id, {
        x: cx + (i - (n - 1) / 2) * spacing,
        y: cy + (i % 2 === 0 ? -24 : 24),
      });
    });
    return positions;
  }

  // 2 rings: high-degree inner, rest outer
  const split = Math.ceil(ringNodes.length / 2);
  const inner = ringNodes.slice(0, split);
  const outer = ringNodes.slice(split);

  const placeRing = (list: GraphNode[], r: number, offset = 0) => {
    const n = list.length;
    if (n === 0) return;
    list.forEach((node, i) => {
      const angle = (i / n) * Math.PI * 2 - Math.PI / 2 + offset;
      const jitter = ((node.degree % 3) - 1) * 8;
      positions.set(node.id, {
        x: cx + Math.cos(angle) * (r + jitter),
        y: cy + Math.sin(angle) * (r + jitter),
      });
    });
  };
  placeRing(inner, innerRadius, 0.2);
  placeRing(outer, radius, -0.15);

  // if single ring only
  if (ringNodes.length > 0 && inner.length === 0) placeRing(ringNodes, radius);

  // ensure all have pos (fallback)
  sorted.forEach((n) => {
    if (!positions.has(n.id)) positions.set(n.id, { x: cx + (Math.random() - 0.5) * 40, y: cy + (Math.random() - 0.5) * 40 });
  });
  return positions;
}

export function KnowledgeGraphCanvas({
  content,
  onSelectFile,
  selectedFile,
  bundleFiles,
  isRefreshing,
  onRefresh,
  title,
}: {
  content: string | null;
  onSelectFile?: (path: string) => void;
  selectedFile?: string | null;
  bundleFiles?: string[];
  isRefreshing?: boolean;
  onRefresh?: () => void;
  title?: string;
}) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const draggingRef = useRef<{ startX: number; startY: number; origPan: { x: number; y: number }; dragging: boolean } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [containerSize, setContainerSize] = useState({ w: 720, h: 420 });
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const obs = new ResizeObserver((entries) => {
      const e = entries[0];
      if (e) setContainerSize({ w: e.contentRect.width, h: Math.max(380, Math.min(520, e.contentRect.width * 0.58)) });
    });
    obs.observe(containerRef.current);
    return () => obs.disconnect();
  }, []);

  const parsed = useMemo(() => {
    if (!content) {
      // fallback from bundleFiles: create orphan nodes
      if (bundleFiles && bundleFiles.length > 0) {
        const nodes: GraphNode[] = bundleFiles.filter((p) => p.toLowerCase() !== "knowledge_graph.md").map((path, i) => ({
          id: `n${i + 1}`,
          label: path.split("/").pop() || path,
          path,
          degree: 0,
          isEntry: path.toLowerCase().endsWith("agents.md"),
        }));
        return { nodes, edges: [] as GraphEdge[] };
      }
      return { nodes: [] as GraphNode[], edges: [] as GraphEdge[] };
    }
    try {
      const p = fallbackNodesFromContent(content);
      // if parser found nothing but bundle exists, fallback to bundle
      if (p.nodes.length === 0 && bundleFiles && bundleFiles.length) {
        const nodes: GraphNode[] = bundleFiles.filter((p) => p.toLowerCase() !== "knowledge_graph.md").map((path, i) => ({
          id: `n${i + 1}`,
          label: path.split("/").pop() || path,
          path,
          degree: 0,
          isEntry: path.toLowerCase().endsWith("agents.md"),
        }));
        return { nodes, edges: [] as GraphEdge[] };
      }
      return p;
    } catch {
      return { nodes: [] as GraphNode[], edges: [] as GraphEdge[] };
    }
  }, [content, bundleFiles]);

  const positions = useMemo(() => layoutNodes(parsed.nodes, containerSize.w, containerSize.h), [parsed.nodes, containerSize]);

  const connectedSet = useMemo(() => {
    if (!hoveredId) return null;
    const s = new Set<string>([hoveredId]);
    parsed.edges.forEach((e) => {
      if (e.from === hoveredId) s.add(e.to);
      if (e.to === hoveredId) s.add(e.from);
    });
    return s;
  }, [hoveredId, parsed.edges]);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.92 : 1.08;
    setZoom((z) => Math.max(0.6, Math.min(1.8, z * delta)));
  }, []);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    draggingRef.current = { startX: e.clientX, startY: e.clientY, origPan: { ...pan }, dragging: true };
    (e.target as Element).setPointerCapture(e.pointerId);
  }, [pan]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!draggingRef.current?.dragging) return;
    const dx = e.clientX - draggingRef.current.startX;
    const dy = e.clientY - draggingRef.current.startY;
    setPan({ x: draggingRef.current.origPan.x + dx, y: draggingRef.current.origPan.y + dy });
  }, []);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    if (draggingRef.current) draggingRef.current.dragging = false;
    try { (e.target as Element).releasePointerCapture(e.pointerId); } catch { /* ignore */ }
  }, []);

  const selectedId = useMemo(() => {
    if (!selectedFile) return null;
    const found = parsed.nodes.find((n) => n.path.toLowerCase() === selectedFile.toLowerCase());
    return found?.id ?? null;
  }, [selectedFile, parsed.nodes]);

  if (!content && parsed.nodes.length === 0) {
    return (
      <div className="rounded-2xl border-2 border-dashed border-border/60 bg-card/40 p-8 text-center space-y-3">
        <div className="mx-auto h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
          <Network className="h-5 w-5 text-primary" />
        </div>
        <div className="space-y-1">
          <p className="text-sm font-black">No knowledge graph yet</p>
          <p className="text-xs text-muted-foreground max-w-sm mx-auto leading-relaxed">
            Generate from your markdown bundle. Add <span className="font-mono bg-muted px-1 py-0.5 rounded text-[11px]">[[AGENTS.md]]</span> style links to create explicit edges.
          </p>
        </div>
        {onRefresh && (
          <Button size="sm" onClick={onRefresh} disabled={isRefreshing} className="gap-1.5">
            {isRefreshing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
            Generate graph
          </Button>
        )}
      </div>
    );
  }

  const hasEdges = parsed.edges.length > 0;

  return (
    <div className="rounded-2xl border-2 border-border/80 bg-card/80 shadow-xl backdrop-blur-md overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-border/60 bg-card/60">
        <div className="flex items-center gap-2 min-w-0">
          <div className="h-7 w-7 rounded-lg bg-primary text-primary-foreground flex items-center justify-center shrink-0">
            <Network className="h-3.5 w-3.5" />
          </div>
          <div className="min-w-0">
            <div className="text-xs font-black tracking-tight flex items-center gap-1.5">
              {title || "Knowledge Graph"}
              <span className="hidden sm:inline-flex items-center gap-1 rounded-full border border-border bg-background px-1.5 py-0.5 text-[10px] font-bold text-muted-foreground">
                <Eye className="h-3 w-3" /> {parsed.nodes.length} nodes · {parsed.edges.length} edges
              </span>
            </div>
            <div className="text-[11px] text-muted-foreground hidden sm:block">
              Agent reads this on wake • writes before sleep • <span className="font-mono">[[file.md]]</span> creates edges
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <div className="hidden sm:flex items-center gap-0.5 rounded-lg border border-border/60 p-0.5 bg-background">
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setZoom((z) => Math.max(0.6, z * 0.88))} title="Zoom out">
              <Minus className="h-3 w-3" />
            </Button>
            <span className="text-[10px] font-mono w-9 text-center">{Math.round(zoom * 100)}%</span>
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setZoom((z) => Math.min(1.8, z * 1.12))} title="Zoom in">
              <Plus className="h-3 w-3" />
            </Button>
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }} title="Reset view">
              <Maximize2 className="h-3 w-3" />
            </Button>
          </div>
          {onRefresh && (
            <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={onRefresh} disabled={isRefreshing}>
              {isRefreshing ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
              <span className="hidden sm:inline">Refresh</span>
            </Button>
          )}
        </div>
      </div>

      {/* Canvas */}
      <div
        ref={containerRef}
        className="relative bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary/[0.06] via-transparent to-transparent"
        style={{ height: containerSize.h }}
        onWheel={handleWheel}
      >
        <svg
          ref={svgRef}
          width={containerSize.w}
          height={containerSize.h}
          viewBox={`0 0 ${containerSize.w} ${containerSize.h}`}
          className="absolute inset-0 touch-none select-none"
          style={{ cursor: draggingRef.current?.dragging ? "grabbing" : "grab" }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
        >
          <defs>
            <marker id={`arrow-${title ?? "kg"}`} viewBox="0 0 10 10" refX={10} refY={5} markerWidth={6} markerHeight={6} orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" className="fill-muted-foreground/60" />
            </marker>
            <filter id="glow">
              <feGaussianBlur stdDeviation="2.5" result="coloredBlur" />
              <feMerge>
                <feMergeNode in="coloredBlur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* Grid */}
          <g opacity={0.06}>
            {Array.from({ length: Math.ceil(containerSize.w / 48) }).map((_, i) => (
              <line key={`v-${i}`} x1={i * 48} y1={0} x2={i * 48} y2={containerSize.h} stroke="currentColor" strokeWidth={1} />
            ))}
            {Array.from({ length: Math.ceil(containerSize.h / 48) }).map((_, i) => (
              <line key={`h-${i}`} x1={0} y1={i * 48} x2={containerSize.w} y2={i * 48} stroke="currentColor" strokeWidth={1} />
            ))}
          </g>

          <g transform={`translate(${pan.x} ${pan.y}) scale(${zoom})`}>
            {/* Edges */}
            {parsed.edges.map((e, idx) => {
              const a = positions.get(e.from);
              const b = positions.get(e.to);
              if (!a || !b) return null;
              const isActive = hoveredId && (e.from === hoveredId || e.to === hoveredId);
              const isDimmed = hoveredId && !isActive;
              const isSameDir = e.reason.includes("same dir");
              return (
                <g key={`${e.from}-${e.to}-${idx}`} opacity={isDimmed ? 0.18 : 1}>
                  <line
                    x1={a.x}
                    y1={a.y}
                    x2={b.x}
                    y2={b.y}
                    style={{ stroke: isActive ? "hsl(var(--primary))" : isSameDir ? "hsl(var(--muted-foreground))" : "hsl(var(--border))" }}
                    strokeWidth={isActive ? 2.2 : 1.2}
                    strokeDasharray={isSameDir ? "6 5" : undefined}
                    opacity={isSameDir ? 0.55 : 0.9}
                    markerEnd={`url(#arrow-${title ?? "kg"})`}
                  />
                  {/* edge label on hover */}
                  {isActive && (
                    <text
                      x={(a.x + b.x) / 2}
                      y={(a.y + b.y) / 2 - 6}
                      textAnchor="middle"
                      className="fill-muted-foreground"
                      fontSize={8}
                      fontWeight={700}
                    >
                      {e.reason.slice(0, 32)}
                    </text>
                  )}
                </g>
              );
            })}

            {/* Nodes */}
            {parsed.nodes.map((node) => {
              const pos = positions.get(node.id);
              if (!pos) return null;
              const isHovered = hoveredId === node.id;
              const isConnected = connectedSet?.has(node.id);
              const isSelected = selectedId === node.id;
              const isDimmed = hoveredId !== null && !isConnected;
              const dimOpacity = isDimmed ? 0.28 : 1;

              const isEntry = !!node.isEntry;
              const r = isEntry ? 28 : node.degree > 2 ? 22 : 18;
              const bg = isEntry
                ? "hsl(var(--primary))"
                : node.isGraphFile
                  ? "hsl(var(--muted))"
                  : "hsl(var(--card))";
              const border = isSelected ? "hsl(var(--primary))" : isEntry ? "hsl(var(--primary))" : "hsl(var(--border))";
              const textColor = isEntry ? "hsl(var(--primary-foreground))" : "hsl(var(--foreground))";

              return (
                <g
                  key={node.id}
                  opacity={dimOpacity}
                  onPointerEnter={() => setHoveredId(node.id)}
                  onPointerLeave={() => setHoveredId((v) => (v === node.id ? null : v))}
                  onClick={() => onSelectFile?.(node.path)}
                  style={{ cursor: onSelectFile ? "pointer" : "default" }}
                >
                  <title>{node.path}</title>
                  {/* halo for selected/hovered */}
                  {(isHovered || isSelected) && (
                    <circle cx={pos.x} cy={pos.y} r={r + 8} style={{ fill: "hsl(var(--primary))" }} opacity={0.12} />
                  )}
                  <g filter={isHovered || isSelected ? "url(#glow)" : undefined}>
                    <rect
                      x={pos.x - r}
                      y={pos.y - r}
                      width={r * 2}
                      height={r * 2}
                      rx={isEntry ? 14 : 12}
                      style={{ fill: bg, stroke: border }}
                      strokeWidth={isSelected ? 2.2 : 1.4}
                    />
                  </g>
                  {/* label */}
                  <text
                    x={pos.x}
                    y={pos.y - (isEntry ? 2 : 0)}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fontSize={isEntry ? 9 : 8}
                    fontWeight={isEntry ? 800 : 700}
                    style={{ fill: textColor, pointerEvents: "none" }}
                  >
                    {node.label.length > 22 ? node.label.slice(0, 21) + "…" : node.label}
                  </text>
                  {isEntry && (
                    <text x={pos.x} y={pos.y + 9} textAnchor="middle" fontSize={7} fontWeight={800} opacity={0.9} style={{ fill: textColor, pointerEvents: "none" }}>
                      ENTRY
                    </text>
                  )}
                  {/* degree badge */}
                  {!isEntry && node.degree > 0 && (
                    <g style={{ pointerEvents: "none" }}>
                      <circle cx={pos.x + r - 4} cy={pos.y - r + 4} r={7} style={{ fill: "hsl(var(--primary))", stroke: "hsl(var(--card))" }} strokeWidth={1.2} />
                      <text x={pos.x + r - 4} y={pos.y - r + 4} textAnchor="middle" dominantBaseline="middle" fontSize={7} fontWeight={900} style={{ fill: "hsl(var(--primary-foreground))" }}>
                        {node.degree}
                      </text>
                    </g>
                  )}
                  {/* id tag */}
                  <text x={pos.x} y={pos.y + r + 10} textAnchor="middle" fontSize={7} fontWeight={600} style={{ fill: "hsl(var(--muted-foreground))", pointerEvents: "none" }}>
                    {node.id}
                  </text>
                </g>
              );
            })}
          </g>
        </svg>

        {/* floating hint */}
        {!hasEdges && parsed.nodes.length > 1 && (
          <div className="absolute bottom-2 left-2 right-2 flex justify-center pointer-events-none">
            <div className="rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-[11px] font-semibold text-amber-700 dark:text-amber-300">
              No edges yet — add <span className="font-mono">[[filename.md]]</span> in your markdown to connect nodes
            </div>
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-3 px-3 py-2 text-[11px] text-muted-foreground border-t border-border/60 bg-muted/20">
        <span className="flex items-center gap-1.5"><span className="h-2 w-4 rounded-full bg-primary inline-block" /> entry</span>
        <span className="flex items-center gap-1.5"><span className="h-0.5 w-4 bg-border inline-block" /> explicit [[link]]</span>
        <span className="flex items-center gap-1.5"><span className="h-0.5 w-4 bg-muted-foreground/60 inline-block border-t border-dashed" /> same dir</span>
        <span className="ml-auto hidden sm:inline">Drag to pan • Scroll to zoom • Hover to highlight • Click node to edit</span>
      </div>
    </div>
  );
}
