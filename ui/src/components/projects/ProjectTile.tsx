import { cn } from "../../lib/utils";
import { getProjectIcon } from "../../lib/project-icons";

/**
 * Reusable project tile (IA Phase 3 — PAP-58; icon picker added PAP-68 part 3).
 *
 * Default render is a neutral gray rounded rectangle with a folder icon.
 * An optional `color` tints the background; an optional `icon` selects which
 * Lucide glyph to render (defaults to `folder`).
 *
 * Used by the Projects list rows and the project detail header. Both `color`
 * and `icon` live on the project itself (`project.color` / `project.icon`).
 */

export type ProjectTileSize = "xs" | "sm" | "md" | "lg";

const SIZE_STYLES: Record<ProjectTileSize, { box: string; icon: string }> = {
  xs: { box: "h-5 w-5 rounded-md shadow-xs", icon: "h-3 w-3" },
  sm: { box: "h-7 w-7 rounded-lg shadow-sm", icon: "h-4 w-4" },
  md: { box: "h-9 w-9 rounded-xl shadow-md", icon: "h-5 w-5" },
  lg: { box: "h-11 w-11 rounded-2xl shadow-lg", icon: "h-6 w-6" },
};

export interface ProjectTileProps {
  /** Optional project color. When unset, the tile stays neutral gray. */
  color?: string | null;
  /** Optional Lucide icon name. When unset, defaults to `folder`. */
  icon?: string | null;
  size?: ProjectTileSize;
  className?: string;
}

export function ProjectTile({ color, icon, size = "md", className }: ProjectTileProps) {
  const dims = SIZE_STYLES[size];
  const tinted = Boolean(color);
  const Icon = getProjectIcon(icon);

  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex shrink-0 items-center justify-center transition-all duration-200 transform hover:scale-105",
        dims.box,
        tinted 
          ? "text-white shadow-primary/20 ring-1 ring-white/20" 
          : "bg-muted/80 text-muted-foreground border border-border/60 hover:bg-muted hover:text-foreground",
        className,
      )}
      style={tinted ? { backgroundColor: color ?? undefined } : undefined}
    >
      <Icon className={cn(dims.icon, "transition-transform duration-200")} />
    </span>
  );
}