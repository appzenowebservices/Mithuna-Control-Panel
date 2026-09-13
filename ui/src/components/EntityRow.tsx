import { type ReactNode } from "react";
import { Link } from "@/lib/router";
import { cn } from "../lib/utils";

interface EntityRowProps {
  leading?: ReactNode;
  identifier?: string;
  title: string;
  subtitle?: string;
  /**
   * Optional metadata columns rendered immediately after the title. When set,
   * the title stops flex-growing and a spacer is inserted between `meta` and
   * `trailing`, so meta sits next to the name while trailing stays pinned right.
   */
  meta?: ReactNode;
  trailing?: ReactNode;
  selected?: boolean;
  to?: string;
  onClick?: () => void;
  className?: string;
  titleClassName?: string;
  reserveSubtitleSpace?: boolean;
}

export function EntityRow({
  leading,
  identifier,
  title,
  subtitle,
  meta,
  trailing,
  selected,
  to,
  onClick,
  className,
  titleClassName,
  reserveSubtitleSpace,
}: EntityRowProps) {
  const isClickable = !!(to || onClick);
  const classes = cn(
    "flex items-center gap-4 px-6 py-4 text-sm border-b border-border/60 last:border-b-0 transition-all duration-200 group/row",
    isClickable && "cursor-pointer hover:bg-accent/40 hover:shadow-xs",
    selected && "bg-primary/10 border-primary/20",
    className
  );

  const content = (
    <>
      {leading && <div className="flex items-center gap-3 shrink-0">{leading}</div>}
      <div className={cn("min-w-0 flex-1", !meta && "flex-1", titleClassName)}>
        <div className="flex items-center gap-2.5">
          {identifier && (
            <span className="shrink-0 rounded-xl border border-border/60 bg-secondary/50 px-2 py-0.5 font-mono text-[10px] font-black tracking-wider text-foreground/80">
              {identifier}
            </span>
          )}
          <span className="truncate font-black tracking-tight text-foreground group-hover/row:text-primary transition-colors" title={title}>
            {title}
          </span>
        </div>
        {(subtitle || reserveSubtitleSpace) && (
          <p
            className={cn("text-xs text-muted-foreground/80 font-normal truncate mt-1 min-h-4", !subtitle && "invisible")}
            aria-hidden={!subtitle}
          >
            {subtitle}
          </p>
        )}
      </div>
      {meta && <div className="flex items-center gap-3 shrink-0">{meta}</div>}
      {meta && <div className="flex-1" />}
      {trailing && <div className="flex items-center gap-3 shrink-0">{trailing}</div>}
    </>
  );

  if (to) {
    return (
      <Link to={to} className={cn("no-underline text-inherit block", classes)} onClick={onClick}>
        {content}
      </Link>
    );
  }

  return (
    <div className={classes} onClick={onClick}>
      {content}
    </div>
  );
}