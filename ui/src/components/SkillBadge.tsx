import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export type SkillBadgeVariant = "ponytail" | "caveman" | "default";

interface SkillBadgeProps {
  skill: SkillBadgeVariant;
  active?: boolean;
  label?: string;
  className?: string;
}

const SKILL_CONFIG: Record<SkillBadgeVariant, { label: string; description: string; icon: string }> = {
  ponytail: {
    label: "Ponytail",
    description: "Lazy senior dev mindset — writes only what's needed",
    icon: "🪮",
  },
  caveman: {
    label: "Caveman",
    description: "Concise responses — 65% fewer output tokens",
    icon: "🪨",
  },
  default: {
    label: "Skill",
    description: "Agent skill enabled",
    icon: "🔧",
  },
};

export function SkillBadge({ skill, active = false, label, className }: SkillBadgeProps) {
  const config = SKILL_CONFIG[skill];
  const displayLabel = label ?? config.label;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={cn(
            "inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-md border font-mono",
            active
              ? "bg-primary/10 border-primary/30 text-primary"
              : "bg-muted/50 border-border text-muted-foreground",
            className
          )}
        >
          <span aria-label={config.icon} role="img">{config.icon}</span>
          <span>{displayLabel}</span>
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs">
        <p className="text-sm font-medium">{config.label}</p>
        <p className="text-xs text-muted-foreground mt-1">{config.description}</p>
      </TooltipContent>
    </Tooltip>
  );
}