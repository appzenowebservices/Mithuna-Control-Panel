import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function StatCell({
  label,
  value,
  className,
}: {
  label: string;
  value: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-border/70 bg-background/50 px-3 py-2 text-center shadow-xs",
        className,
      )}
    >
      <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className="mt-0.5 truncate text-sm font-black tabular-nums text-foreground">{value}</p>
    </div>
  );
}
