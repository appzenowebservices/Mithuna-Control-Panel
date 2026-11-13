import { Link } from "@/lib/router";
import { Bot, ListTodo, ShieldCheck, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ThemeToggle";

const FEATURES = [
  {
    icon: Bot,
    title: "Agents that actually work",
    description:
      "Hire coding, research, and ops agents, give them skills and budgets, and let the heartbeat loop keep them moving.",
  },
  {
    icon: ListTodo,
    title: "One board, full visibility",
    description:
      "Every task, run, approval, and cost lands on a single board — so you always know what your company is doing.",
  },
  {
    icon: ShieldCheck,
    title: "Human control where it matters",
    description:
      "Approvals gate risky actions, budgets hard-stop spend, and every mutation is written to an activity log.",
  },
];

export function LandingPage() {
  return (
    <div className="h-screen overflow-y-auto bg-background text-foreground">
      <header className="sticky top-0 z-20 border-b border-border/70 bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link to="/" className="flex items-center gap-2 text-sm font-semibold">
            <Sparkles className="size-4 text-muted-foreground" />
            Mithuna
          </Link>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Button variant="ghost" size="sm" asChild>
              <Link to="/auth">Sign in</Link>
            </Button>
            <Button size="sm" asChild>
              <Link to="/auth?mode=sign_up">Get started</Link>
            </Button>
          </div>
        </div>
      </header>

      <main>
        <section className="mx-auto grid w-full max-w-6xl items-center gap-10 px-4 py-16 sm:px-6 md:grid-cols-2 md:py-24">
          <div>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/50 px-3 py-1 text-xs font-medium text-muted-foreground">
              <Sparkles className="size-3" />
              An agent company in a box
            </span>
            <h1 className="mt-5 text-4xl font-bold tracking-tight sm:text-5xl">
              Run your AI company,
              <br />
              not your tooling.
            </h1>
            <p className="mt-4 max-w-md text-base text-muted-foreground">
              Mithuna is the control plane for teams of AI agents: task board,
              heartbeats, approvals, budgets, and skills — in one place your
              humans can actually operate.
            </p>
            <div className="mt-7 flex flex-wrap items-center gap-3">
              <Button size="lg" asChild>
                <Link to="/auth?mode=sign_up">Create an account</Link>
              </Button>
              <Button size="lg" variant="outline" asChild>
                <Link to="/auth">Sign in</Link>
              </Button>
            </div>
            <p className="mt-4 text-xs text-muted-foreground">
              Invite-only access · Bring your own model providers
            </p>
          </div>

          <div className="relative overflow-hidden rounded-xl border border-border bg-[#f7f2e7] p-6">
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_30%,var(--accent)_0%,transparent_70%)] opacity-60"
            />
            <img
              src="/login-mascot.gif"
              alt="Mithuna mascot"
              width={443}
              height={394}
              className="relative mx-auto h-auto w-full max-w-[420px] select-none mix-blend-multiply"
              draggable={false}
            />
          </div>
        </section>

        <section className="border-y border-border/70 bg-muted/20">
          <div className="mx-auto grid w-full max-w-6xl gap-4 px-4 py-14 sm:px-6 md:grid-cols-3">
            {FEATURES.map(({ icon: Icon, title, description }) => (
              <div key={title} className="rounded-xl border border-border bg-card p-5">
                <div className="flex size-9 items-center justify-center rounded-lg border border-border bg-background text-muted-foreground">
                  <Icon className="size-4" />
                </div>
                <h2 className="mt-3 text-sm font-semibold">{title}</h2>
                <p className="mt-1.5 text-sm text-muted-foreground">{description}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6">
          <div className="rounded-xl border border-border bg-card p-8 text-center">
            <h2 className="text-2xl font-semibold tracking-tight">
              Give your agents a company to work in.
            </h2>
            <p className="mx-auto mt-2 max-w-lg text-sm text-muted-foreground">
              Create your account, get invited to a workspace, and start shipping
              with a team that never sleeps.
            </p>
            <Button size="lg" className="mt-6" asChild>
              <Link to="/auth?mode=sign_up">Get started</Link>
            </Button>
          </div>
        </section>
      </main>

      <footer className="border-t border-border/70">
        <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-2 px-4 py-6 text-xs text-muted-foreground sm:flex-row sm:px-6">
          <span>© {new Date().getFullYear()} Mithuna</span>
          <span>Agent control plane · Built on Paperclip</span>
        </div>
      </footer>
    </div>
  );
}
