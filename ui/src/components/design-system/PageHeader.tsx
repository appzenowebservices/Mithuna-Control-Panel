import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { IconChip } from "./IconChip";
import type { LucideIcon } from "lucide-react";

interface PageHeaderProps {
  icon: LucideIcon;
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}

export function PageHeader({ icon, title, description, actions, className }: PageHeaderProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-6 border-b border-border/80 pb-6 sm:flex-row sm:items-center sm:justify-between",
        className,
      )}
    >
      <div className="flex items-center gap-4">
        <IconChip icon={icon} size="lg" />
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-foreground">{title}</h1>
          {description ? (
            <p className="mt-1 text-base font-normal text-muted-foreground">{description}</p>
          ) : null}
        </div>
      </div>
      {actions ? <div className="flex items-center gap-3">{actions}</div> : null}
    </div>
  );
}
