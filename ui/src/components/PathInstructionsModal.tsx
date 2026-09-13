import { useState } from "react";
import { Apple, Monitor, Terminal, FolderSearch, Lightbulb } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

type Platform = "mac" | "windows" | "linux";

const platforms: { id: Platform; label: string; icon: typeof Apple }[] = [
  { id: "mac", label: "macOS", icon: Apple },
  { id: "windows", label: "Windows", icon: Monitor },
  { id: "linux", label: "Linux", icon: Terminal },
];

const instructions: Record<Platform, { steps: string[]; tip?: string }> = {
  mac: {
    steps: [
      "Open Finder and navigate to your target folder.",
      "Right-click (or Control-click) the folder item.",
      "Hold down the Option (⌥) key — \"Copy\" dynamically changes to \"Copy as Pathname\".",
      "Click \"Copy as Pathname\", then paste the path directly into the workspace setup field.",
    ],
    tip: "Pro tip: You can also open Terminal, type cd, drag and drop your folder right into the window, and hit Enter. Type pwd to output the full path.",
  },
  windows: {
    steps: [
      "Open File Explorer and navigate to your folder.",
      "Click the address bar at the top of the window to highlight the full string.",
      "Copy the highlighted path, then paste it into the workspace setup field.",
    ],
    tip: "Quick shortcut: Hold down the Shift key and right-click the folder, then select \"Copy as path\" directly from the context menu.",
  },
  linux: {
    steps: [
      "Open your terminal and navigate to the target directory using cd.",
      "Run the pwd command to print out the absolute directory path.",
      "Copy the terminal output and paste it into the workspace setup field.",
    ],
    tip: "In most desktop file managers, pressing Ctrl+L instantly reveals the full absolute path inside the address bar.",
  },
};

function detectPlatform(): Platform {
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes("mac")) return "mac";
  if (ua.includes("win")) return "windows";
  return "linux";
}

interface PathInstructionsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function PathInstructionsModal({
  open,
  onOpenChange,
}: PathInstructionsModalProps) {
  const [platform, setPlatform] = useState<Platform>(detectPlatform);

  const current = instructions[platform];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg rounded-3xl border-2 border-secondary/20 bg-secondary text-white p-6 shadow-2xl backdrop-blur-xl">
        <DialogHeader className="space-y-2 border-b border-white/10 pb-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary text-secondary shadow-md">
              <FolderSearch className="h-4 w-4" />
            </div>
            <DialogTitle className="text-base font-black tracking-tight text-white">How to get a full path</DialogTitle>
          </div>
          <DialogDescription className="text-xs font-medium text-white/70 leading-relaxed">
            Paste your system's absolute folder path (e.g.{" "}
            <code className="text-xs font-mono bg-white/10 text-primary px-2 py-0.5 rounded-lg border border-white/10">
              /Users/you/project
            </code>
            ) into the configuration input.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 pt-2">
          {/* Platform tabs */}
          <div className="flex gap-1.5 rounded-2xl border border-white/15 bg-white/[0.04] p-1.5">
            {platforms.map((p) => {
              const isActive = platform === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  className={cn(
                    "flex flex-1 items-center justify-center gap-2 rounded-xl px-3 py-2 text-xs font-bold transition-all",
                    isActive
                      ? "bg-primary text-secondary shadow-lg shadow-primary/20 scale-[1.02]"
                      : "text-white/70 hover:text-white hover:bg-white/10",
                  )}
                  onClick={() => setPlatform(p.id)}
                >
                  <p.icon className="h-3.5 w-3.5" />
                  <span>{p.label}</span>
                </button>
              );
            })}
          </div>

          {/* Steps */}
          <div className="rounded-2xl bg-white/[0.04] border border-white/10 p-4 space-y-3 shadow-inner">
            <div className="text-[10px] font-black uppercase tracking-widest text-white/40 border-b border-white/10 pb-2">
              Step-by-Step Instructions
            </div>
            <ol className="space-y-3 text-xs font-medium text-white/90">
              {current.steps.map((step, i) => (
                <li key={i} className="flex gap-3 items-start">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/20 text-primary font-mono text-[10px] font-black border border-primary/30 mt-0.5">
                    {i + 1}
                  </span>
                  <span className="leading-relaxed">{step}</span>
                </li>
              ))}
            </ol>
          </div>

          {current.tip && (
            <div className="flex items-start gap-3 rounded-2xl bg-primary/10 border border-primary/20 p-4 text-xs font-medium text-white/90 shadow-sm">
              <Lightbulb className="h-4 w-4 text-primary shrink-0 mt-0.5" />
              <div className="space-y-1">
                <span className="font-bold text-primary block uppercase tracking-wider text-[10px]">Helper Tip</span>
                <p className="leading-relaxed text-white/80">{current.tip}</p>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Small "Choose" button that opens the PathInstructionsModal.
 * Drop-in replacement for the old showDirectoryPicker buttons.
 */
export function ChoosePathButton({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        className={cn(
          "inline-flex items-center justify-center rounded-xl border border-secondary/20 bg-secondary text-primary px-3.5 py-2.5 text-xs font-bold shadow-xs hover:bg-secondary/90 hover:border-secondary/40 transition-all shrink-0",
          className,
        )}
        onClick={() => setOpen(true)}
      >
        Choose Path
      </button>
      <PathInstructionsModal open={open} onOpenChange={setOpen} />
    </>
  );
}