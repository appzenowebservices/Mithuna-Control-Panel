import { createContext, useContext, type ReactNode } from "react";
import { NavLink } from "@/lib/router";
import type { LucideIcon } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

import { useSidebar } from "../context/SidebarContext";
import { SIDEBAR_SCROLL_RESET_STATE } from "../lib/navigation-scroll";
import { cn, SIDEBAR_RAIL_HIDDEN_LABEL } from "../lib/utils";

const SidebarNavExpandedContext = createContext(false);

export function SidebarNavExpandedProvider({ children }: { children: ReactNode }) {
  return (
    <SidebarNavExpandedContext.Provider value={true}>
      {children}
    </SidebarNavExpandedContext.Provider>
  );
}

export function useSidebarNavExpanded() {
  return useContext(SidebarNavExpandedContext);
}

interface SidebarNavItemProps {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
  className?: string;
  badge?: number;
  badgeTone?: "default" | "danger";
  badgeLabel?: string;
  textBadge?: string;
  textBadgeTone?: "default" | "amber";
  alert?: boolean;
  liveCount?: number;
}

export function SidebarNavItem({
  to,
  label,
  icon: Icon,
  end,
  className,
  badge,
  badgeTone = "default",
  badgeLabel,
  textBadge,
  textBadgeTone = "default",
  alert = false,
  liveCount,
}: SidebarNavItemProps) {
  const { isMobile, setSidebarOpen, collapsed, peeking } = useSidebar();
  const forceExpanded = useSidebarNavExpanded();
  const rail = collapsed && !peeking && !forceExpanded;

  const hasBadge = badge != null && badge > 0;
  const hasLive = liveCount != null && liveCount > 0;

  const railAriaLabel = !rail
    ? undefined
    : hasLive
      ? `${label}, ${liveCount} live`
      : hasBadge
        ? `${label}, ${badge}${badgeLabel ? ` ${badgeLabel}` : ""}`
        : alert
          ? `${label}, attention needed`
          : undefined;

  const link = (
    <NavLink
      to={to}
      state={SIDEBAR_SCROLL_RESET_STATE}
      end={end}
      aria-label={railAriaLabel}
      onClick={() => isMobile && setSidebarOpen(false)}
      className={({ isActive }) =>
        cn(
          "flex items-center gap-2.5 px-3 py-2 pointer-coarse:py-1.5 text-[13px] transition-all rounded-2xl",
          isActive
            ? "bg-primary font-bold text-primary-foreground shadow-md"
            : "font-medium text-foreground/70 hover:bg-accent/50 hover:text-foreground",
          className
        )
      }
    >
      <span className="relative shrink-0">
        <Icon className="h-4 w-4" />
        {alert && (
          <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-red-500 shadow-[0_0_0_2px_hsl(var(--background))]" />
        )}
        {rail && !alert && hasLive && (
          <span className="absolute -right-0.5 -top-0.5 flex h-2 w-2">
            <span className="animate-pulse absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-blue-500 shadow-[0_0_0_2px_hsl(var(--background))]" />
          </span>
        )}
        {rail && !alert && !hasLive && hasBadge && (
          <span
            className={cn(
              "absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full shadow-[0_0_0_2px_hsl(var(--background))]",
              badgeTone === "danger" ? "bg-red-600" : "bg-primary"
            )}
          />
        )}
      </span>

      <span className={rail ? SIDEBAR_RAIL_HIDDEN_LABEL : "flex-1 truncate"}>{label}</span>

      {!rail && textBadge && (
        <span
          className={cn(
            "ml-auto rounded-full px-1.5 py-0.5 text-[10px] font-medium leading-none",
            textBadgeTone === "amber"
              ? "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400"
              : "bg-muted text-muted-foreground"
          )}
        >
          {textBadge}
        </span>
      )}

      {!rail && hasLive && (
        <span className="ml-auto flex items-center gap-1.5 text-blue-600 dark:text-blue-400">
          <span className="relative flex h-2 w-2">
            <span className="animate-pulse absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500" />
          </span>
          <span className="text-[11px] font-medium">{liveCount}</span>
        </span>
      )}

      {!rail && hasBadge && (
        <span
          className={cn(
            "ml-auto rounded-full px-1.5 py-0.5 text-[10px] font-bold leading-none min-w-[16px] text-center",
            badgeTone === "danger"
              ? "bg-red-600 text-white"
              : "bg-primary text-primary-foreground"
          )}
        >
          {badge}
        </span>
      )}
    </NavLink>
  );

  if (!rail) return link;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div>{link}</div>
      </TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  );
}