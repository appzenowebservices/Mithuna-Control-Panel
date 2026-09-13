import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

type GlassCardVariant = "default" | "featured" | "hero";

interface GlassCardProps extends ComponentProps<"div"> {
  variant?: GlassCardVariant;
  interactive?: boolean;
}

const VARIANTS: Record<GlassCardVariant, string> = {
  default: "rounded-3xl border-2 border-border/80 bg-card/80 shadow-xl backdrop-blur-md",
  featured:
    "rounded-3xl border-2 border-primary/40 bg-gradient-to-br from-primary/25 via-card/80 to-card/70 shadow-xl backdrop-blur-md",
  hero: "rounded-3xl border-2 border-border/80 bg-primary/80 shadow-xl backdrop-blur-md",
};

export function GlassCard({ variant = "default", interactive, className, ...props }: GlassCardProps) {
  return (
    <div
      className={cn(
        VARIANTS[variant],
        interactive &&
          "transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-2xl",
        className,
      )}
      {...props}
    />
  );
}
