import { useState } from "react";
import { Plus, Users, Edit3, Trash2, Sparkles } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useCompany } from "@/context/CompanyContext";
import { useBreadcrumbs } from "@/context/BreadcrumbContext";
import { teamsApi } from "@/api/teams";
import { queryKeys } from "@/lib/queryKeys";
import { PageSkeleton } from "@/components/PageSkeleton";
import { EmptyState } from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Team } from "@paperclipai/shared";
import { PageHeader, GlassCard, CountBadge, BentoGrid, MetaPill, IconChip } from "@/components/design-system";

interface TeamBentoCardProps {
  team: Team;
  featured?: boolean;
  onDelete: () => void;
  onUpdate: (updates: Partial<Omit<Team, "id">>) => void;
}

function TeamBentoCard({ team, featured, onDelete, onUpdate }: TeamBentoCardProps) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(team.name);
  const [description, setDescription] = useState(team.description ?? "");

  const handleSave = () => {
    onUpdate({ name, description: description || null });
    setEditing(false);
  };

  return (
    <div
      className={cn(
        "group relative flex flex-col gap-3 rounded-3xl border-2 p-5 shadow-xl backdrop-blur-md transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-2xl",
        featured
          ? "overflow-hidden border-primary/40 bg-gradient-to-br from-primary/25 via-card/80 to-card/70 p-6"
          : "border-border/80 bg-card/80",
        featured && "sm:col-span-2 lg:col-span-2 lg:row-span-2",
      )}
    >
      {featured && (
        <div className="pointer-events-none absolute -right-10 -top-10 h-36 w-36 rounded-full bg-primary/20 blur-2xl" />
      )}
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <IconChip icon={featured ? Sparkles : Users} size={featured ? "md" : "sm"} />
          {editing ? (
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-xl border border-border/60 bg-card/80 px-3 py-1.5 text-sm font-medium text-foreground shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
              autoFocus
            />
          ) : (
            <h3 className={cn("truncate font-black tracking-tight text-foreground", featured ? "text-2xl" : "text-base")}>
              {team.name}
            </h3>
          )}
        </div>
        <div className="flex gap-1 shrink-0">
          {editing ? (
            <button
              onClick={handleSave}
              className="rounded-xl border border-primary/40 bg-primary/15 px-3 py-1 text-xs font-bold text-primary transition-colors hover:bg-primary/25"
            >
              Save
            </button>
          ) : null}
          <button
            onClick={() => setEditing(!editing)}
            className="rounded-xl p-1.5 text-muted-foreground opacity-0 transition-all group-hover:opacity-100 hover:bg-muted/40 hover:text-foreground"
          >
            <Edit3 className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={onDelete}
            className="rounded-xl p-1.5 text-muted-foreground opacity-0 transition-all group-hover:opacity-100 hover:bg-destructive/10 hover:text-destructive"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      {editing ? (
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="w-full resize-none rounded-xl border border-border/60 bg-card/80 px-3 py-2 text-xs text-muted-foreground shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
          rows={2}
          placeholder="Description"
        />
      ) : (
        team.description && (
          <p className="line-clamp-2 text-xs font-medium text-muted-foreground">{team.description}</p>
        )
      )}
      <div className="mt-auto flex items-center gap-1.5 pt-2">
        <MetaPill>
          <Users className="mr-1 h-3 w-3" />
          Team
        </MetaPill>
        {team.color && (
          <MetaPill className="gap-1.5">
            <span
              className="inline-block h-2.5 w-2.5 rounded-full border border-border"
              style={{ backgroundColor: team.color }}
            />
            {team.color}
          </MetaPill>
        )}
      </div>
    </div>
  );
}

export function Teams() {
  const { selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const [creating, setCreating] = useState(false);

  const { data: teams, isLoading } = useQuery({
    queryKey: queryKeys.teams.list(selectedCompanyId!),
    queryFn: () => teamsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const [newName, setNewName] = useState("");

  const handleCreate = async () => {
    if (!newName.trim() || !selectedCompanyId) return;
    setCreating(true);
    try {
      await teamsApi.create(selectedCompanyId, { name: newName.trim() });
      setNewName("");
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (teamId: string) => {
    await teamsApi.delete(teamId, selectedCompanyId!);
  };

  const handleUpdate = async (teamId: string, updates: Partial<Omit<Team, "id">>) => {
    await teamsApi.update(teamId, selectedCompanyId!, updates);
  };

  setBreadcrumbs([{ label: "Teams" }]);

  if (!selectedCompanyId) {
    return <EmptyState icon={Plus} message="Select a company to view teams." />;
  }

  if (isLoading) {
    return <PageSkeleton variant="list" />;
  }

  return (
    <div className="max-w-6xl space-y-8 pb-16">
      <PageHeader
        icon={Users}
        title="Teams"
        description="Organize your agents into focused teams."
      />

      <GlassCard className="flex flex-wrap items-center justify-between gap-4 px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="text"
            placeholder="New team name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            className="h-10 w-56 rounded-xl border border-border/60 bg-card/80 px-3 text-sm text-foreground shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
          />
          <Button onClick={handleCreate} disabled={creating || !newName.trim()} className="h-10 cursor-pointer gap-2 rounded-xl px-4 font-bold shadow-sm">
            <Plus className="h-4 w-4" />
            Create
          </Button>
        </div>
        {teams && teams.length > 0 && (
          <CountBadge>
            {teams.length} team{teams.length !== 1 ? "s" : ""}
          </CountBadge>
        )}
      </GlassCard>

      {teams && teams.length === 0 ? (
        <EmptyState
          icon={Plus}
          message="Create your first team to get started."
          action="Create Team"
          onAction={() => setCreating(true)}
        />
      ) : (
        <BentoGrid>
          {teams?.map((team, index) => (
            <TeamBentoCard
              key={team.id}
              team={team}
              featured={index === 0}
              onDelete={() => handleDelete(team.id)}
              onUpdate={(updates) => handleUpdate(team.id, updates)}
            />
          ))}
        </BentoGrid>
      )}
    </div>
  );
}
