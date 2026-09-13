import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ArrowUpDown, Check, SlidersHorizontal } from "lucide-react";

export type ProjectSortField = "name" | "updated" | "created" | "targetDate";
export type ProjectSortDir = "asc" | "desc";

const PROJECT_SORT_OPTIONS: Array<{ field: ProjectSortField; label: string }> = [
  { field: "name", label: "Name" },
  { field: "updated", label: "Updated" },
  { field: "created", label: "Created" },
  { field: "targetDate", label: "Target date" },
];

export interface ProjectControlBarProps {
  projectCount: number;
  initialSortField?: ProjectSortField;
  initialSortDir?: ProjectSortDir;
  onSortChange?: (field: ProjectSortField, dir: ProjectSortDir) => void;
}

export function ProjectControlBar({
  projectCount,
  initialSortField = "name",
  initialSortDir = "asc",
  onSortChange,
}: ProjectControlBarProps) {
  const [sortField, setSortField] = useState<ProjectSortField>(initialSortField);
  const [sortDir, setSortDir] = useState<ProjectSortDir>(initialSortDir);
  const [popoverOpen, setPopoverOpen] = useState(false);

  const handleSortToggle = (field: ProjectSortField) => {
    let newDir = sortDir;
    if (sortField === field) {
      newDir = sortDir === "asc" ? "desc" : "asc";
    } else {
      newDir = field === "name" || field === "targetDate" ? "asc" : "desc";
    }
    setSortField(field);
    setSortDir(newDir);
    onSortChange?.(field, newDir);
    setPopoverOpen(false);
  };

  const sortLabel = PROJECT_SORT_OPTIONS.find((option) => option.field === sortField)?.label ?? "Name";

  return (
    <div className="flex items-center justify-between gap-4 rounded-3xl border-2 border-secondary/30 bg-secondary px-6 py-4 shadow-md backdrop-blur-md">
      <div className="flex items-center gap-3.5">
        <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/20 text-primary border border-primary/30 shadow-xs">
          <SlidersHorizontal className="h-4 w-4" />
        </div>
        <span className="text-xs font-black uppercase tracking-widest text-white/70">Sort by</span>
        
        <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="gap-2.5 rounded-2xl h-11 px-5 text-xs font-bold border-white/20 bg-white/[0.06] text-white shadow-md hover:bg-white/15 hover:text-white hover:border-primary/50 transition-all group"
            >
              <ArrowUpDown className="h-3.5 w-3.5 text-primary group-hover:scale-110 transition-transform" />
              <span className="tracking-wide">{sortLabel}</span>
              <span className="rounded-full bg-primary/20 px-2 py-0.5 text-[10px] font-extrabold text-primary border border-primary/30 uppercase">
                {sortDir}
              </span>
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-60 p-2 rounded-3xl shadow-md border-white/20 bg-secondary text-white backdrop-blur-xl">
            <div className="px-3 py-2 text-[10px] font-black uppercase tracking-widest text-white/40 border-b border-white/10 mb-1">
              Select Sorting Order
            </div>
            <div className="space-y-1">
              {PROJECT_SORT_OPTIONS.map((option) => {
                const isActive = sortField === option.field;
                return (
                  <button
                    key={option.field}
                    type="button"
                    className={`flex w-full items-center justify-between rounded-2xl px-3.5 py-3 text-xs font-bold transition-all ${
                      isActive
                        ? "bg-primary text-secondary shadow-md shadow-primary/20 font-black scale-[1.02]"
                        : "text-white/80 hover:bg-white/10 hover:text-white"
                    }`}
                    onClick={() => handleSortToggle(option.field)}
                  >
                    <span className="tracking-wide">{option.label}</span>
                    {isActive && (
                      <span className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wider">
                        <Check className="h-3.5 w-3.5 stroke-[3]" />
                        {sortDir}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </PopoverContent>
        </Popover>
      </div>

      <div className="hidden sm:flex items-center gap-2 rounded-2xl bg-white/[0.04] border border-white/10 px-4 py-2 shadow-inner">
        <span className="text-xs font-medium text-white/60">Active Projects:</span>
        <span className="text-xs font-black text-primary bg-primary/10 border border-primary/30 px-2.5 py-0.5 rounded-xl">
          {projectCount}
        </span>
      </div>
    </div>
  );
}