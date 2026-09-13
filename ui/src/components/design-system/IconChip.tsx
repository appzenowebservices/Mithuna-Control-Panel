import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type IconChipSize = "sm" | "md" | "lg";

interface IconChipProps {
  icon: LucideIcon;
  size?: IconChipSize;
  className?: string;
}

const SIZES: Record<IconChipSize, { box: string; icon: string }> = {
  sm: { box: "h-7 w-7 rounded-xl bg-primary/20 border border-primary/30 shadow-xs", icon: "h-4 w-4" },
  md: { box: "h-8 w-8 rounded-xl bg-primary/20 border border-primary/30 shadow-xs", icon: "h-4 w-4" },
  lg: { box: "h-14 w-14 rounded-2xl bg-primary/15 shadow-inner", icon: "h-7 w-7" },
};

export function IconChip({ icon: Icon, size = "md", className }: IconChipProps) {
  const dims = SIZES[size];
  return (
    <div
      className={cn("flex shrink-0 items-center justify-center text-primary", dims.box, className)}
      aria-hidden
    >
      <Icon className={dims.icon} />
    </div>
  );
}
