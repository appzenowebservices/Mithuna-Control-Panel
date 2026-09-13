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
    <div className={`h-full p-6 rounded-3xl border-2 border-border/80 bg-primary/80 shadow-xl backdrop-blur-md transition-all duration-300 ${isClickable ? " hover:border-foreground/40 hover:scale-[1.02] cursor-pointer" : ""}`}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <p className="text-3xl sm:text-4xl font-black tracking-tight tabular-nums text-secondary">
            {value}
          </p>
          <p className="text-[10px] font-black uppercase tracking-widest text-secondary/70 mt-1.5">
            {label}
          </p>
          {description && (
            <div className="text-xs font-bold text-secondary/70 mt-2.5 hidden sm:block">{description}</div>
          )}
        </div>
        <div className="flex items-center justify-center h-10 w-10 rounded-2xl border-2 border-secondary/30 bg-secondary/20 text-secondary shadow-xs shrink-0">
          <Icon className="h-5 w-5" />
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