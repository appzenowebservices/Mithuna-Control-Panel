import { Loader2, LogOut } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";

interface SignOutConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  pending?: boolean;
}

/**
 * Confirmation shown before ending a browser session. Lives next to the two
 * sign-out affordances (account popover + workspace switcher) so both flows
 * share the same copy, pending state, and destructive styling.
 */
export function SignOutConfirmDialog({
  open,
  onOpenChange,
  onConfirm,
  pending = false,
}: SignOutConfirmDialogProps) {
  return (
    <AlertDialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!pending) onOpenChange(nextOpen);
      }}
    >
      <AlertDialogContent className="gap-0 overflow-hidden rounded-xl border-border/70 p-0 sm:max-w-[420px]">
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-destructive/[0.08] to-transparent" />
        <div className="relative px-6 pb-5 pt-6">
          <div className="flex flex-col items-center gap-4 text-center sm:flex-row sm:items-start sm:text-left">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-destructive/25 bg-destructive/10 text-destructive shadow-xs">
              <LogOut className="size-5" strokeWidth={1.8} />
            </span>
            <AlertDialogHeader className="gap-1.5">
              <AlertDialogTitle className="text-base font-semibold tracking-tight">
                Sign out of your account?
              </AlertDialogTitle>
              <AlertDialogDescription className="text-sm leading-relaxed text-muted-foreground">
                This ends your session on this browser and returns you to the sign-in
                screen. You can sign back in anytime with your email and password.
              </AlertDialogDescription>
            </AlertDialogHeader>
          </div>
        </div>
        <AlertDialogFooter className="border-t border-border/70 bg-muted/30 px-6 py-3.5 sm:justify-end">
          <AlertDialogCancel
            disabled={pending}
            className="mt-0 h-9 rounded-lg px-4 text-sm"
          >
            Stay signed in
          </AlertDialogCancel>
          <AlertDialogAction
            disabled={pending}
            onClick={(event) => {
              event.preventDefault();
              onConfirm();
            }}
            className={cn(
              buttonVariants({ variant: "destructive" }),
              "h-9 gap-2 rounded-lg px-4 text-sm font-medium",
            )}
          >
            {pending ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Signing out...
              </>
            ) : (
              "Sign out"
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
