import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { IconChip } from "./IconChip";
import { CountBadge } from "./chips";

interface SectionHeaderProps {
  title: string;
  icon?: React.ComponentProps<typeof IconChip>["icon"];
  count?: number;
  countLabel?: string;
  actions?: ReactNode;
  className?: string;
}

export function SectionHeader({
  title,
  icon,
  count,
  countLabel,
  actions,
  className,
}: SectionHeaderProps) {
  return (
    <div className={cn("flex items-center justify-between px-2", className)}>
      <div className="flex items-center gap-2.5">
        <h2 className="flex items-center gap-2.5 text-xl font-black tracking-tight text-foreground">
          {icon ? <IconChip icon={icon} size="sm" /> : null}
          {title}
        </h2>
      </div>
      <div className="flex items-center gap-3">
        {actions}
        {count != null && (
          <CountBadge>
            {count} {countLabel}
            {count === 1 ? "" : "s"}
          </CountBadge>
        )}
      </div>
    </div>
  );
}
