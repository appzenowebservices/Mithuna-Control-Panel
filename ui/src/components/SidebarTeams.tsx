import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { teamsApi } from "@/api/teams";
import { useCompany } from "@/context/CompanyContext";
import { queryKeys } from "@/lib/queryKeys";
import { SidebarSection } from "./SidebarSection";
import { SidebarNavItem } from "./SidebarNavItem";
import { Users, Plus } from "lucide-react";

export function SidebarTeams() {
  const { selectedCompanyId } = useCompany();
  const queryClient = useQueryClient();

  const { data: teams } = useQuery({
    queryKey: queryKeys.teams.list(selectedCompanyId!),
    queryFn: () => teamsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const createTeam = useMutation({
    mutationFn: (companyId: string) => teamsApi.create(companyId, { name: "Default Team" }),
    onSuccess: (_, companyId) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.teams.list(companyId) });
    },
  });

  if (!selectedCompanyId) return null;

  return (
    <SidebarSection
      label="Teams"
      headerAction={
        selectedCompanyId
          ? {
              icon: Plus,
              ariaLabel: "Create new team",
              onClick: () => createTeam.mutate(selectedCompanyId),
            }
          : undefined
      }
    >
      {teams && teams.length > 0 ? (
        teams.map((team) => (
          <SidebarNavItem
            key={team.id}
            to={`/teams/${team.id}`}
            label={team.name}
            icon={Users}
          />
        ))
      ) : (
        <div className="text-xs text-muted-foreground px-2 py-1">No teams yet</div>
      )}
    </SidebarSection>
  );
}
