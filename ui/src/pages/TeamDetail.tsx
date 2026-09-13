import { Link, useParams, Navigate, useNavigate } from "@/lib/router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useCompany } from "@/context/CompanyContext";
import { teamsApi } from "@/api/teams";
import { agentsApi } from "@/api/agents";
import { companySkillsApi } from "@/api/companySkills";
import { queryKeys } from "@/lib/queryKeys";
import { PageSkeleton } from "@/components/PageSkeleton";
import { EmptyState } from "@/components/EmptyState";
import { useBreadcrumbs } from "@/context/BreadcrumbContext";
import { useToastActions } from "@/context/ToastContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { formatDate } from "@/lib/utils";
import { Users, Edit3, Trash2, Calendar, Palette, User, Hash, FileText } from "lucide-react";
import type { Team, TeamSkillEntry } from "@paperclipai/shared";
import { useMemo, useState, useEffect } from "react";
import { PageHeader, GlassCard, SectionHeader, MetaPill } from "@/components/design-system";

export function TeamDetail() {
  const { selectedCompanyId } = useCompany();
  const { teamId } = useParams<{ teamId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { pushToast } = useToastActions();

  const { data: team, isLoading } = useQuery({
    queryKey: queryKeys.teams.detail(teamId!),
    queryFn: () => teamsApi.get(teamId!, selectedCompanyId!),
    enabled: !!selectedCompanyId && !!teamId,
  });

  const { data: teamAgents } = useQuery({
    queryKey: queryKeys.teams.agents(teamId!),
    queryFn: () => teamsApi.listAgents(selectedCompanyId!, teamId!),
    enabled: !!selectedCompanyId && !!teamId,
  });

  const { data: companyAgents = [] } = useQuery({
    queryKey: queryKeys.agents.list(selectedCompanyId!),
    queryFn: () => agentsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const { data: teamProjects = [] } = useQuery({
    queryKey: ["teams", teamId!, "projects", selectedCompanyId!],
    queryFn: () => teamsApi.listProjects(selectedCompanyId!, teamId!),
    enabled: !!selectedCompanyId && !!teamId,
  });

  const { data: teamSkills = [] } = useQuery({
    queryKey: ["teams", teamId!, "skills", selectedCompanyId!],
    queryFn: () => teamsApi.listSkills(selectedCompanyId!, teamId!),
    enabled: !!selectedCompanyId && !!teamId,
  });

  const { data: availableCompanySkills = [] } = useQuery({
    queryKey: queryKeys.companySkills.list(selectedCompanyId!),
    queryFn: () => companySkillsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const leadAgent = teamAgents?.find((agent) => agent.id === team?.leadAgentId);
  const selectedSkillKeys = useMemo(
    () => new Set(teamSkills.map((entry: TeamSkillEntry) => entry.skill.key)),
    [teamSkills],
  );

  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(team?.name ?? "");
  const [description, setDescription] = useState(team?.description ?? "");
  const [leadAgentId, setLeadAgentId] = useState(team?.leadAgentId ?? null);
  const [color, setColor] = useState(team?.color ?? "");
  const [metadata, setMetadata] = useState<string>("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (team) {
      setName(team.name);
      setDescription(team.description ?? "");
      setLeadAgentId(team.leadAgentId ?? null);
      setColor(team.color ?? "");
      setMetadata(team.metadata ? JSON.stringify(team.metadata, null, 2) : "");
    }
  }, [team]);

  const updateTeam = useMutation({
    mutationFn: (data: Partial<Team> & { metadata?: Record<string, unknown> | null }) =>
      teamsApi.update(teamId!, selectedCompanyId!, data),
    onMutate: () => {
      setSaving(true);
    },
    onSuccess: () => {
      setEditing(false);
      setSaving(false);
      pushToast({ title: "Team updated", tone: "success" });
      queryClient.invalidateQueries({ queryKey: queryKeys.teams.detail(teamId!) });
    },
    onError: (err) => {
      setSaving(false);
      pushToast({ title: err.message, tone: "error" });
    },
  });

  const deleteTeam = useMutation({
    mutationFn: () => teamsApi.delete(teamId!, selectedCompanyId!),
    onSuccess: () => {
      navigate("/teams", { replace: true });
    },
  });

  const assignTeamSkills = useMutation({
    mutationFn: (desiredSkills: Array<string | { key: string; versionId?: string | null }>) =>
      teamsApi.assignSkills(selectedCompanyId!, teamId!, desiredSkills),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["teams", teamId!, "skills", selectedCompanyId!] });
      pushToast({ title: "Team skills updated", tone: "success" });
    },
    onError: (err: Error) => {
      pushToast({ title: err.message, tone: "error" });
    },
  });

  const toggleTeamSkill = (skillKey: string) => {
    if (!selectedCompanyId || !teamId) return;
    const nextKeys = new Set<string>(selectedSkillKeys);
    if (nextKeys.has(skillKey)) {
      nextKeys.delete(skillKey);
    } else {
      nextKeys.add(skillKey);
    }
    assignTeamSkills.mutate(Array.from(nextKeys));
  };

  const { setBreadcrumbs } = useBreadcrumbs();

  useEffect(() => {
    setBreadcrumbs([
      { label: "Teams", href: "/teams" },
      { label: team?.name ?? "Team" },
    ]);
  }, [team?.name, setBreadcrumbs]);

  if (!selectedCompanyId) {
    return <EmptyState icon={Users} message="Select a company to view teams." />;
  }

  if (isLoading) {
    return <PageSkeleton variant="detail" />;
  }

  if (!team) {
    return <Navigate to="/teams" replace />;
  }

  return (
    <div className="max-w-6xl space-y-8 pb-16">
      {editing ? (
        <GlassCard className="flex flex-wrap items-center justify-between gap-4 p-5">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="max-w-md flex-1 text-2xl font-bold"
            placeholder="Team name"
            autoFocus
          />
          <div className="flex gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setEditing(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={() => {
                const parsedMetadata = metadata.trim() ? (() => {
                  try {
                    return JSON.parse(metadata);
                  } catch {
                    pushToast({ title: "Invalid JSON in metadata", tone: "error" });
                    return null;
                  }
                })() : null;
                if (parsedMetadata === null && metadata.trim()) return;
                updateTeam.mutate({
                  name,
                  description: description || null,
                  leadAgentId: leadAgentId || null,
                  color: color || null,
                  metadata: parsedMetadata,
                });
              }}
              disabled={saving || !name.trim()}
            >
              {saving ? "Saving..." : "Save"}
            </Button>
          </div>
        </GlassCard>
      ) : (
        <PageHeader
          icon={Users}
          title={team.name}
          actions={
            <div className="flex gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setEditing(true)}
              >
                <Edit3 className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => deleteTeam.mutate()}
                className="cursor-pointer text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          }
        />
      )}

      {editing ? (
        <GlassCard className="space-y-5 p-6">
          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Team description (optional)"
              rows={3}
              className="bg-card/80"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="leadAgentId">Lead Agent</Label>
            <select
              id="leadAgentId"
              value={leadAgentId ?? ""}
              onChange={(e) => setLeadAgentId(e.target.value || null)}
              className="w-full rounded-xl border border-border bg-card/80 px-3 py-2.5 text-sm font-medium outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            >
              <option value="">No lead agent</option>
              {companyAgents.map((agent) => (
                <option key={agent.id} value={agent.id}>
                  {agent.name}{agent.title ? ` — ${agent.title}` : ""} ({agent.role})
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">
              The team lead receives issues the CEO delegates to this team.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="color">Color</Label>
            <div className="flex gap-2">
              <Input
                id="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                placeholder="#7c3aed"
                className="flex-1 bg-card/80"
              />
              <Input
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="w-12 p-1 border border-border/60"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="metadata">Metadata (JSON)</Label>
            <Textarea
              id="metadata"
              value={metadata}
              onChange={(e) => setMetadata(e.target.value)}
              placeholder='{"key": "value"}'
              rows={6}
              className="bg-card/80 font-mono text-xs"
            />
          </div>
        </GlassCard>
      ) : (
        <div className="grid gap-6 md:grid-cols-2">
          <GlassCard className="p-6">
            <SectionHeader icon={Hash} title="Team Information" />
            <div className="mt-5 space-y-3">
              <div className="flex items-start gap-3 text-sm">
                <User className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                <div className="min-w-0">
                  <span className="text-muted-foreground">Team ID:</span>
                  <span className="ml-2 font-mono">{team.id}</span>
                </div>
              </div>
              <div className="flex items-start gap-3 text-sm">
                <User className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                <div className="min-w-0">
                  <span className="text-muted-foreground">Company ID:</span>
                  <span className="ml-2 font-mono">{team.companyId}</span>
                </div>
              </div>
              {team.description && (
                <div className="flex items-start gap-3 text-sm">
                  <FileText className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                  <div className="min-w-0">
                    <span className="text-muted-foreground">Description:</span>
                    <span className="ml-2">{team.description}</span>
                  </div>
                </div>
              )}
              {team.leadAgentId && (
                <div className="flex items-start gap-3 text-sm">
                  <User className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                  <div className="min-w-0">
                    <span className="text-muted-foreground">Lead Agent:</span>
                    <span className="ml-2 font-semibold">
                      {leadAgent?.name ?? <span className="font-mono text-xs">{team.leadAgentId}</span>}
                    </span>
                  </div>
                </div>
              )}
              {team.color && (
                <div className="flex items-start gap-3 text-sm">
                  <Palette className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">Color:</span>
                    <div
                      className="w-5 h-5 rounded-full border border-border"
                      style={{ backgroundColor: team.color }}
                    />
                    <span className="ml-1 font-mono text-xs">{team.color}</span>
                  </div>
                </div>
              )}
              <div className="flex items-start gap-3 text-sm">
                <Calendar className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                <div>
                  <span className="text-muted-foreground">Created:</span>
                  <span className="ml-2">{formatDate(team.createdAt)}</span>
                </div>
              </div>
              <div className="flex items-start gap-3 text-sm">
                <Calendar className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                <div>
                  <span className="text-muted-foreground">Updated:</span>
                  <span className="ml-2">{formatDate(team.updatedAt)}</span>
                </div>
              </div>
            </div>
          </GlassCard>

          <GlassCard className="p-6">
            <SectionHeader icon={FileText} title="Team Metadata" />
            <div className="mt-5 space-y-2">
              {team.metadata && Object.keys(team.metadata).length > 0 ? (
                <pre className="rounded-2xl border border-border/60 bg-background/50 p-4 text-xs font-mono overflow-x-auto">
                  {JSON.stringify(team.metadata, null, 2)}
                </pre>
              ) : (
                <span className="text-sm text-muted-foreground">No metadata</span>
              )}
            </div>
          </GlassCard>
        </div>
      )}

      {!editing && (
        <div className="space-y-6">
          <GlassCard className="p-6">
            <SectionHeader icon={FileText} title="Projects" count={teamProjects.length} countLabel="project" />
            {teamProjects.length > 0 ? (
              <div className="mt-5 grid gap-3 md:grid-cols-2">
                {teamProjects.map((project: { id: string; name: string; description: string | null; status: string }) => (
                  <Link
                    key={project.id}
                    to={`/projects/${project.id}`}
                    className="rounded-2xl border border-border/70 bg-background/50 p-4 transition-colors hover:bg-muted/40"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold">{project.name}</span>
                      <MetaPill className="shrink-0">{project.status}</MetaPill>
                    </div>
                    {project.description && (
                      <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{project.description}</p>
                    )}
                  </Link>
                ))}
              </div>
            ) : (
              <span className="mt-5 block text-sm text-muted-foreground">No projects assigned to this team</span>
            )}
          </GlassCard>

          <GlassCard className="p-6">
            <SectionHeader icon={FileText} title="Team Skills" count={teamSkills.length} countLabel="skill" />
            {availableCompanySkills.length > 0 ? (
              <div className="mt-5 space-y-2">
                {availableCompanySkills.map((skill) => (
                  <label
                    key={skill.id}
                    className="flex items-center justify-between gap-3 rounded-2xl border border-border/70 bg-background/50 p-3"
                  >
                    <div className="min-w-0">
                      <div className="font-medium">{skill.name}</div>
                      {skill.description && (
                        <div className="text-sm text-muted-foreground">{skill.description}</div>
                      )}
                    </div>
                    <input
                      type="checkbox"
                      checked={selectedSkillKeys.has(skill.key)}
                      onChange={() => toggleTeamSkill(skill.key)}
                      disabled={assignTeamSkills.isPending}
                      className="h-4 w-4 shrink-0"
                    />
                  </label>
                ))}
              </div>
            ) : (
              <span className="mt-5 block text-sm text-muted-foreground">No company skills available</span>
            )}
          </GlassCard>

          <SectionHeader icon={Users} title="Team Agents" count={teamAgents?.length ?? 0} countLabel="agent" />
          {teamAgents && teamAgents.length > 0 ? (
            <div className="overflow-hidden rounded-3xl border-2 border-border/80 bg-card/40 shadow-xl backdrop-blur-md divide-y divide-border/60">
              {teamAgents.map(agent => (
                <div key={agent.id} className="flex items-center justify-between gap-3 px-6 py-5 transition-all hover:bg-muted/40">
                  <div className="min-w-0">
                    <div className="truncate font-semibold text-foreground">{agent.name}</div>
                    <div className="truncate text-sm text-muted-foreground">
                      {agent.role}
                      {agent.title && ` — ${agent.title}`}
                    </div>
                  </div>
                  <MetaPill className="shrink-0">{agent.status}</MetaPill>
                </div>
              ))}
            </div>
          ) : (
            <span className="text-sm text-muted-foreground">No agents assigned to this team</span>
          )}
        </div>
      )}
    </div>
  );
}
