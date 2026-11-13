import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "@/lib/router";

interface MetricCardProps {
  icon: LucideIcon;
  value: string | number;
  label: string;
  description?: ReactNode;
  to?: string;
  onClick?: () => void;
}

export function MetricCard({ icon: Icon, value, label, description, to, onClick }: MetricCardProps) {
  const isClickable = !!(to || onClick);

  const inner = (
    <div className={`h-full rounded-xl border border-border/70 bg-card p-5 shadow-sm transition-colors ${isClickable ? "cursor-pointer hover:border-primary/40 hover:bg-accent/30" : ""}`}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <p className="text-3xl font-bold tracking-tight tabular-nums text-foreground sm:text-4xl">
            {value}
          </p>
          <p className="mt-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {label}
          </p>
          {description && (
            <div className="mt-2.5 hidden text-xs text-muted-foreground sm:block">{description}</div>
          )}
        </div>
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon className="h-5 w-5" aria-hidden="true" />
        </div>
      </div>
    </div>
  );

  if (to) {
    return (
      <Link to={to} className="no-underline text-inherit h-full block" onClick={onClick}>
        {inner}
      </Link>
    );
  }

  if (onClick) {
    return (
      <div className="h-full cursor-pointer" onClick={onClick}>
        {inner}
      </div>
    );
  }

  return inner;
}