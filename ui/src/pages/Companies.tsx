import { useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCompany } from "../context/CompanyContext";
import { useDialogActions } from "../context/DialogContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { companiesApi } from "../api/companies";
import { queryKeys } from "../lib/queryKeys";
import { cn, formatCents, relativeTime } from "../lib/utils";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Pencil,
  Check,
  X,
  Plus,
  MoreHorizontal,
  Trash2,
  Users,
  CircleDot,
  DollarSign,
  Calendar,
  Building2,
  Sparkles,
} from "lucide-react";
import { PageHeader, BentoGrid, StatCell, MetaPill, IconChip } from "../components/design-system";

export function Companies() {
  const {
    companies,
    selectedCompanyId,
    setSelectedCompanyId,
    loading,
    error,
  } = useCompany();
  const { openOnboarding } = useDialogActions();
  const { setBreadcrumbs } = useBreadcrumbs();
  const queryClient = useQueryClient();

  const { data: stats } = useQuery({
    queryKey: queryKeys.companies.stats,
    queryFn: () => companiesApi.stats(),
  });

  // Inline edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const editMutation = useMutation({
    mutationFn: ({ id, newName }: { id: string; newName: string }) =>
      companiesApi.update(id, { name: newName }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.companies.all });
      setEditingId(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => companiesApi.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.companies.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.companies.stats });
      setConfirmDeleteId(null);
    },
  });

  useEffect(() => {
    setBreadcrumbs([{ label: "Companies" }]);
  }, [setBreadcrumbs]);

  function startEdit(companyId: string, currentName: string) {
    setEditingId(companyId);
    setEditName(currentName);
  }

  function saveEdit() {
    if (!editingId || !editName.trim()) return;
    editMutation.mutate({ id: editingId, newName: editName.trim() });
  }

  function cancelEdit() {
    setEditingId(null);
    setEditName("");
  }

  return (
    <div className="max-w-6xl space-y-8 pb-16">
      <PageHeader
        icon={Building2}
        title="Companies"
        description="Manage your companies and switch between workspaces."
        actions={
          <Button
            size="lg"
            onClick={() => openOnboarding()}
            className="h-12 cursor-pointer gap-2 rounded-2xl px-6 font-bold shadow-md"
          >
            <Plus className="h-5 w-5" />
            New Company
          </Button>
        }
      />

      <div className="h-6">
        {loading && <p className="text-sm text-muted-foreground">Loading companies...</p>}
        {error && <p className="text-sm text-destructive">{error.message}</p>}
      </div>

      <BentoGrid>
        {companies.map((company, index) => {
          const selected = company.id === selectedCompanyId;
          const isEditing = editingId === company.id;
          const isConfirmingDelete = confirmDeleteId === company.id;
          const featured = index === 0;
          const companyStats = stats?.[company.id];
          const agentCount = companyStats?.agentCount ?? 0;
          const issueCount = companyStats?.issueCount ?? 0;
          const budgetPct =
            company.budgetMonthlyCents > 0
              ? Math.round(
                  (company.spentMonthlyCents / company.budgetMonthlyCents) * 100,
                )
              : 0;
          const budgetText =
            company.budgetMonthlyCents > 0
              ? `${formatCents(company.spentMonthlyCents)} / ${formatCents(company.budgetMonthlyCents)} (${budgetPct}%)`
              : `${formatCents(company.spentMonthlyCents)} · Unlimited`;

          return (
            <div
              key={company.id}
              role="button"
              tabIndex={0}
              onClick={() => setSelectedCompanyId(company.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setSelectedCompanyId(company.id);
                }
              }}
              className={cn(
                "group relative flex flex-col gap-4 rounded-3xl border-2 p-5 shadow-xl backdrop-blur-md transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-2xl",
                featured
                  ? "overflow-hidden border-primary/40 bg-gradient-to-br from-primary/25 via-card/80 to-card/70 p-6"
                  : "border-border/80 bg-card/80",
                selected && "border-primary ring-1 ring-primary",
                featured && "sm:col-span-2 lg:col-span-2 lg:row-span-2",
              )}
            >
              {featured && (
                <div className="pointer-events-none absolute -right-10 -top-10 h-36 w-36 rounded-full bg-primary/20 blur-2xl" />
              )}

              {/* Header row: name + menu */}
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <IconChip icon={featured ? Sparkles : Building2} size={featured ? "md" : "sm"} />
                    {isEditing ? (
                      <div
                        className="flex items-center gap-2"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Input
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          className="h-7 text-sm"
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === "Enter") saveEdit();
                            if (e.key === "Escape") cancelEdit();
                          }}
                        />
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          onClick={saveEdit}
                          disabled={editMutation.isPending}
                        >
                          <Check className="h-3.5 w-3.5 text-green-500" />
                        </Button>
                        <Button variant="ghost" size="icon-xs" onClick={cancelEdit}>
                          <X className="h-3.5 w-3.5 text-muted-foreground" />
                        </Button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <h3 className={cn("font-black tracking-tight text-foreground", featured ? "text-2xl" : "text-base")}>
                          {company.name}
                        </h3>
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                            company.status === "active"
                              ? "bg-green-500/10 text-green-600 dark:text-green-400"
                              : company.status === "paused"
                                ? "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400"
                                : "bg-muted text-muted-foreground"
                          }`}
                        >
                          {company.status}
                        </span>
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          className="text-muted-foreground opacity-0 group-hover:opacity-100"
                          onClick={(e) => {
                            e.stopPropagation();
                            startEdit(company.id, company.name);
                          }}
                        >
                          <Pencil className="h-3 w-3" />
                        </Button>
                      </div>
                    )}
                  </div>
                  {company.description && !isEditing && (
                    <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                      {company.description}
                    </p>
                  )}
                </div>

                {/* Three-dot menu */}
                <div onClick={(e) => e.stopPropagation()}>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        className="text-muted-foreground opacity-0 group-hover:opacity-100 data-[state=open]:opacity-100"
                      >
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        onClick={() => startEdit(company.id, company.name)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        Rename
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        variant="destructive"
                        onClick={() => setConfirmDeleteId(company.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Delete Company
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>

              {/* Stats */}
              {featured ? (
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <StatCell label="Agents" value={agentCount} />
                  <StatCell label="Tasks" value={issueCount} />
                  <StatCell label="Budget" value={budgetText} />
                  <StatCell label="Created" value={relativeTime(company.createdAt)} />
                </div>
              ) : (
                <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-2">
                  <MetaPill>
                    <Users className="mr-1 h-3 w-3" />
                    {agentCount} agent{agentCount === 1 ? "" : "s"}
                  </MetaPill>
                  <MetaPill>
                    <CircleDot className="mr-1 h-3 w-3" />
                    {issueCount} task{issueCount === 1 ? "" : "s"}
                  </MetaPill>
                  <MetaPill>
                    <DollarSign className="mr-1 h-3 w-3" />
                    {budgetText}
                  </MetaPill>
                  <MetaPill className="hidden md:inline-flex">
                    <Calendar className="mr-1 h-3 w-3" />
                    {relativeTime(company.createdAt)}
                  </MetaPill>
                </div>
              )}

              {/* Delete confirmation */}
              {isConfirmingDelete && (
                <div
                  className="mt-4 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-destructive/20 bg-destructive/5 px-4 py-3"
                  onClick={(e) => e.stopPropagation()}
                >
                  <p className="text-sm text-destructive font-medium">
                    Delete this company and all its data? This cannot be undone.
                  </p>
                  <div className="flex items-center gap-2 ml-4 shrink-0">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setConfirmDeleteId(null)}
                      disabled={deleteMutation.isPending}
                    >
                      Cancel
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => deleteMutation.mutate(company.id)}
                      disabled={deleteMutation.isPending}
                    >
                      {deleteMutation.isPending ? "Deleting…" : "Delete"}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </BentoGrid>
    </div>
  );
}
