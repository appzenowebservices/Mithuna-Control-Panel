import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { goalsApi } from "../api/goals";
import { useCompany } from "../context/CompanyContext";
import { useDialogActions } from "../context/DialogContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { queryKeys } from "../lib/queryKeys";
import { GoalTree } from "../components/GoalTree";
import { EmptyState } from "../components/EmptyState";
import { PageSkeleton } from "../components/PageSkeleton";
import { Button } from "@/components/ui/button";
import { Target, Plus } from "lucide-react";
import { PageHeader, SectionHeader } from "../components/design-system";

export function Goals() {
  const { selectedCompanyId } = useCompany();
  const { openNewGoal } = useDialogActions();
  const { setBreadcrumbs } = useBreadcrumbs();

  useEffect(() => {
    setBreadcrumbs([{ label: "Goals" }]);
  }, [setBreadcrumbs]);

  const { data: goals, isLoading, error } = useQuery({
    queryKey: queryKeys.goals.list(selectedCompanyId!),
    queryFn: () => goalsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  if (!selectedCompanyId) {
    return <EmptyState icon={Target} message="Select a company to view goals." />;
  }

  if (isLoading) {
    return <PageSkeleton variant="list" />;
  }

  return (
    <div className="max-w-6xl space-y-8 pb-16">
      <PageHeader
        icon={Target}
        title="Goals"
        description="Mission hierarchy for your agents and the outcomes they drive."
        actions={
          <Button
            size="lg"
            onClick={() => openNewGoal()}
            className="h-12 cursor-pointer gap-2 rounded-2xl px-6 font-bold shadow-md"
          >
            <Plus className="h-5 w-5" />
            New Goal
          </Button>
        }
      />

      {error && <p className="text-sm font-semibold text-destructive">{error.message}</p>}

      {goals && goals.length === 0 && (
        <div className="rounded-3xl border border-dashed border-border/80">
          <EmptyState
            icon={Target}
            message="No goals yet."
            action="Add Goal"
            onAction={() => openNewGoal()}
          />
        </div>
      )}

      {goals && goals.length > 0 && (
        <section className="space-y-4">
          <SectionHeader icon={Target} title="All Goals" count={goals.length} countLabel="goal" />
          <div className="overflow-hidden rounded-3xl border-2 border-border/80 bg-card/40 shadow-xl backdrop-blur-md divide-y divide-border/60">
            <GoalTree goals={goals} goalLink={(goal) => `/goals/${goal.id}`} />
          </div>
        </section>
      )}
    </div>
  );
}
