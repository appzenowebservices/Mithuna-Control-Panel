import { cn } from "@/lib/utils";
import { GlassCard } from "./design-system";
import { MarkdownBody } from "./MarkdownBody";
import { Button } from "@/components/ui/button";
import {
  AlertTriangle, CheckCircle2, Check, HelpCircle, ShieldAlert, GitBranch, PieChart,
  Stars, Sparkles, Download, RefreshCw, Send, Database, X, Play, ExternalLink,
  FileJson, FileText
} from "lucide-react";

type Payload = {
  layout: string;
  metadata: { issue_title: string; status_badge: { label: string; variant: string; icon?: string }; capable_badge?: { label: string; variant: string; icon?: string } };
  agent_info?: { name: string; id: string; avatar_icon?: string };
  sections?: Array<{ id: string; title: string; component: string; variant?: string; message?: string; language?: string; code?: string; data?: unknown; items?: unknown[]; steps?: unknown[] }>;
};

const badgeVariantClass: Record<string,string> = {
  success: "bg-emerald-500/15 border-emerald-500/30 text-emerald-700 dark:text-emerald-300",
  warning: "bg-amber-500/15 border-amber-500/30 text-amber-700 dark:text-amber-300",
  danger: "bg-red-500/15 border-red-500/30 text-red-700 dark:text-red-300",
  info: "bg-sky-500/15 border-sky-500/30 text-sky-700 dark:text-sky-300",
  neutral: "bg-secondary border-border text-muted-foreground",
};

function SectionCard({ title, children, icon }: { title: string; children: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border/60 bg-card/50 p-3 space-y-2">
      <div className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-muted-foreground">
        {icon}{title}
      </div>
      {children}
    </div>
  );
}

export function IssueStructuredCard({ payload, soulEnabled }: { payload: Payload; soulEnabled?: boolean }) {
  if (soulEnabled) {
    return (
      <GlassCard className="relative overflow-hidden p-6 text-center">
        <div className="absolute inset-0 backdrop-blur-md bg-background/60" />
        <div className="relative space-y-2">
          <div className="mx-auto h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center"><Sparkles className="h-5 w-5 text-primary" /></div>
          <p className="text-sm font-black">Soul reincarnating soon</p>
          <p className="text-xs text-muted-foreground">Structured view is paused while SOUL is on — upcoming feature with personality-aware cards.</p>
        </div>
      </GlassCard>
    );
  }
  const meta = payload.metadata;
  const sections = payload.sections ?? [];
  const statusVariant = badgeVariantClass[meta.status_badge.variant] ?? badgeVariantClass.neutral;

  return (
    <GlassCard className="overflow-hidden p-0">
      {/* Header */}
      <div className="px-3 sm:px-4 py-3 border-b border-border/60 flex flex-wrap items-center gap-2">
        <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold", statusVariant)}>
          {meta.status_badge.variant==="danger" ? <AlertTriangle className="h-3 w-3"/> : meta.status_badge.variant==="success" ? <CheckCircle2 className="h-3 w-3"/> : meta.status_badge.variant==="info" ? <GitBranch className="h-3 w-3"/> : <HelpCircle className="h-3 w-3"/>}
          {meta.status_badge.label}
        </span>
        {meta.capable_badge && (
          <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[11px] font-bold", badgeVariantClass[meta.capable_badge.variant] ?? badgeVariantClass.neutral)}>
            {meta.capable_badge.label}
          </span>
        )}
        {payload.agent_info && (
          <span className="ml-auto inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
            <Stars className="h-3.5 w-3.5 text-primary" /> {payload.agent_info.name}
          </span>
        )}
      </div>
      <div className="px-3 sm:px-4 py-2">
        <p className="text-xs text-muted-foreground">Issue: <span className="font-semibold text-foreground">{meta.issue_title}</span></p>
      </div>
      {/* Sections grid */}
      <div className="grid gap-3 p-3 sm:p-4 bg-muted/20">
        {sections.map((sec) => {
          const comp = sec.component;
          if (comp === "form_fields") {
            const items = (sec.items ?? []) as Array<{key:string; label:string; type:string; required?:boolean}>;
            return (
              <SectionCard key={sec.id} title={sec.title} icon={<HelpCircle className="h-3 w-3"/>}>
                <div className="grid gap-2 sm:grid-cols-2">
                  {items.map((it)=> (
                    <div key={it.key} className="space-y-1">
                      <label className="text-xs font-semibold">{it.label} {it.required && <span className="text-destructive">*</span>}</label>
                      <div className="rounded-lg border border-border bg-background px-2 py-1.5 text-xs text-muted-foreground">{it.type} input</div>
                    </div>
                  ))}
                </div>
              </SectionCard>
            );
          }
          if (comp === "file_group") {
            const items = (sec.items ?? []) as Array<{name:string; type:string; size?:string; download_url?:string}>;
            return (
              <SectionCard key={sec.id} title={sec.title} icon={<FileText className="h-3 w-3"/>}>
                <div className="grid gap-2 sm:grid-cols-2">
                  {items.map((f)=> (
                    <div key={f.name} className="flex items-center gap-2 rounded-lg border border-border bg-background px-2.5 py-2">
                      {f.type==="pdf" ? <FileText className="h-4 w-4 text-red-500"/> : <FileJson className="h-4 w-4 text-sky-500"/>}
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold truncate">{f.name}</p>
                        <p className="text-[11px] text-muted-foreground">{f.size}</p>
                      </div>
                      <Button size="sm" variant="outline" className="h-7 text-xs gap-1"><Download className="h-3 w-3"/> Download</Button>
                    </div>
                  ))}
                </div>
              </SectionCard>
            );
          }
          if (comp === "code_block") {
            return (
              <SectionCard key={sec.id} title={sec.title} icon={<AlertTriangle className="h-3 w-3 text-red-500"/>}>
                <pre className="rounded-lg bg-neutral-950 text-neutral-100 p-3 text-xs overflow-auto">{sec.code ?? ""}</pre>
              </SectionCard>
            );
          }
          if (comp === "callout_banner") {
            return (
              <div key={sec.id} className={cn("rounded-xl border px-3 py-2.5 text-sm", sec.variant==="success" ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-800 dark:text-emerald-200" : "bg-secondary") }>
                <Check className="h-4 w-4 inline mr-1.5"/>{sec.message}
              </div>
            );
          }
          if (comp === "kv_grid") {
            const data = (sec.data ?? []) as Array<{label:string; value:string; type?:string}>;
            return (
              <SectionCard key={sec.id} title={sec.title} icon={<ShieldAlert className="h-3 w-3"/>}>
                <div className="grid gap-2 sm:grid-cols-2">
                  {data.map((kv,i)=> (
                    <div key={i} className="rounded-lg border border-border bg-background p-2">
                      <p className="text-[11px] text-muted-foreground">{kv.label}</p>
                      <p className="text-xs font-semibold break-all">{kv.value}</p>
                    </div>
                  ))}
                </div>
              </SectionCard>
            );
          }
          if (comp === "step_tracker") {
            const steps = (sec.steps ?? []) as Array<{step:string; assigned_agent:string; status:string}>;
            return (
              <SectionCard key={sec.id} title={sec.title} icon={<GitBranch className="h-3 w-3"/>}>
                <div className="space-y-1.5">
                  {steps.map((s, idx)=> (
                    <div key={idx} className="flex items-center gap-2 rounded-lg border border-border bg-background px-2.5 py-2 text-xs">
                      <span className={cn("h-5 w-5 rounded-full flex items-center justify-center text-[11px] font-bold", s.status==="completed" ? "bg-emerald-500 text-white" : "bg-amber-500/20 text-amber-700")}>{s.status==="completed" ? "✓" : "○"}</span>
                      <span className="flex-1 font-medium">{s.step}</span>
                      <span className="text-[11px] text-muted-foreground">{s.assigned_agent}</span>
                      <span className={cn("rounded-full px-1.5 py-0.5 text-[10px] font-bold", s.status==="completed" ? "bg-emerald-500/15 text-emerald-700" : "bg-amber-500/15 text-amber-700")}>{s.status}</span>
                    </div>
                  ))}
                </div>
              </SectionCard>
            );
          }
          if (comp === "action_list") {
            const items = (sec.items ?? []) as Array<{label:string; action_type:string; button_variant:string; icon?:string}>;
            return (
              <SectionCard key={sec.id} title={sec.title}>
                <div className="flex flex-wrap gap-2">
                  {items.map((a,i)=>{
                    const variant = a.button_variant==="primary" ? "default" : a.button_variant==="danger" ? "destructive" : "outline";
                    return <Button key={i} variant={variant as any} size="sm" className="gap-1.5 text-xs">{a.label} {a.icon==="download" && <Download className="h-3 w-3"/>}{a.icon==="refresh-cw" && <RefreshCw className="h-3 w-3"/>}{a.icon==="send" && <Send className="h-3 w-3"/>}{a.icon==="play" && <Play className="h-3 w-3"/>}{a.icon==="check-shield" && <CheckCircle2 className="h-3 w-3"/>}{a.icon==="x" && <X className="h-3 w-3"/>}</Button>;
                  })}
                </div>
              </SectionCard>
            );
          }
          // fallback generic
          return (
            <SectionCard key={sec.id} title={sec.title}>
              <MarkdownBody>{sec.message ?? JSON.stringify(sec, null, 2)}</MarkdownBody>
            </SectionCard>
          );
        })}
      </div>
    </GlassCard>
  );
}

export function IssueStructuredHistory({ issueId }: { issueId: string }) {
  // placeholder - actual fetching done in parent, this is tiny standalone for reuse
  return null;
}
