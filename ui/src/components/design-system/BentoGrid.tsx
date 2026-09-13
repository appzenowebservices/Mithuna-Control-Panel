import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

interface BentoGridProps {
  children: ReactNode;
  className?: string;
}

export function BentoGrid({ children, className }: BentoGridProps) {
  return (
    <div
      className={cn(
        "grid grid-cols-1 gap-5 sm:grid-cols-2 lg:auto-rows-[minmax(0,1fr)] lg:grid-flow-dense lg:grid-cols-3",
        className,
      )}
    >
      {children}
    </div>
  );
}

interface BentoFeaturedProps extends ComponentProps<"div"> {
  className?: string;
}

export function BentoFeatured({ className, ...props }: BentoFeaturedProps) {
  return <div className={cn("sm:col-span-2 lg:col-span-2 lg:row-span-2", className)} {...props} />;
}
