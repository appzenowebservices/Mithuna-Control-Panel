import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function SectionLabel({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "text-[10px] font-black uppercase tracking-widest text-muted-foreground",
        className,
      )}
    >
      {children}
    </span>
  );
}

export function CountBadge({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "rounded-2xl border border-secondary/30 bg-secondary px-3.5 py-1 text-xs font-extrabold uppercase tracking-widest text-primary shadow-xs",
        className,
      )}
    >
      {children}
    </span>
  );
}

export function MetaPill({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-xl border border-border/60 bg-secondary/50 px-2 py-1 text-[10px] font-black tabular-nums text-foreground/80",
        className,
      )}
    >
      {children}
    </span>
  );
}
