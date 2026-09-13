import { and, count, eq } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { agents, projects as projectsTable, teams as teamsTable } from "@paperclipai/db";

type TeamRow = typeof teamsTable.$inferSelect;

export function teamService(db: Db) {
  return {
    async listByCompany(companyId: string): Promise<(typeof teamsTable.$inferSelect)[]> {
      const rows = await db
        .select({
          id: teamsTable.id,
          companyId: teamsTable.companyId,
          name: teamsTable.name,
          description: teamsTable.description,
          leadAgentId: teamsTable.leadAgentId,
          color: teamsTable.color,
          metadata: teamsTable.metadata,
          createdAt: teamsTable.createdAt,
          updatedAt: teamsTable.updatedAt,
          agentCount: db
            .select({ count: count(agents.id).as("count") })
            .from(agents)
            .where(and(eq(agents.companyId, companyId), eq(agents.teamId, teamsTable.id)))
            .as("agent_count"),
        })
        .from(teamsTable)
        .where(eq(teamsTable.companyId, companyId))
        .orderBy(teamsTable.name);
      return rows.map((row) => ({
        ...row,
        agentCount: Number(row.agentCount),
      }));
    },

async getById(id: string): Promise<TeamRow | null> {
       return db.select()
         .from(teamsTable)
         .where(eq(teamsTable.id, id))
         .then((rows) => rows[0] ?? null);
     },

     async listAgentsByTeam(companyId: string, teamId: string) {
       const team = await db
         .select()
         .from(teamsTable)
         .where(eq(teamsTable.id, teamId))
         .then((rows) => rows[0] ?? null);
       if (!team || team.companyId !== companyId) {
         return [];
       }
        return db
          .select()
          .from(agents)
          .where(and(eq(agents.companyId, companyId), eq(agents.teamId, teamId)));
      },

      async listProjectsByTeam(companyId: string, teamId: string) {
        const team = await db
          .select()
          .from(teamsTable)
          .where(eq(teamsTable.id, teamId))
          .then((rows) => rows[0] ?? null);
        if (!team || team.companyId !== companyId) {
          return [];
        }
        return db
          .select({
            id: projectsTable.id,
            companyId: projectsTable.companyId,
            teamId: projectsTable.teamId,
            name: projectsTable.name,
            description: projectsTable.description,
            status: projectsTable.status,
            color: projectsTable.color,
            icon: projectsTable.icon,
            goalId: projectsTable.goalId,
            createdAt: projectsTable.createdAt,
            updatedAt: projectsTable.updatedAt,
          })
          .from(projectsTable)
          .where(and(eq(projectsTable.companyId, companyId), eq(projectsTable.teamId, teamId)))
          .orderBy(projectsTable.createdAt);
      },

    async create(data: {
      companyId: string;
      name: string;
      description: string | null;
      leadAgentId: string | null;
      color: string | null;
      metadata: Record<string, unknown>;
    }): Promise<TeamRow> {
      const [team] = await db.insert(teamsTable)
        .values({
          id: crypto.randomUUID(),
          companyId: data.companyId,
          name: data.name,
          description: data.description,
          leadAgentId: data.leadAgentId,
          color: data.color,
          metadata: data.metadata,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning();
      return team;
    },

    async update(id: string, data: {
      name?: string;
      description?: string | null;
      leadAgentId?: string | null;
      color?: string | null;
      metadata?: Record<string, unknown>;
    }): Promise<TeamRow> {
      const update: Record<string, unknown> = { updatedAt: new Date() };
      if (data.name !== undefined) update.name = data.name;
      if (data.description !== undefined) update.description = data.description;
      if (data.leadAgentId !== undefined) update.leadAgentId = data.leadAgentId;
      if (data.color !== undefined) update.color = data.color;
      if (data.metadata !== undefined) update.metadata = data.metadata;

      const [team] = await db.update(teamsTable)
        .set(update as Partial<TeamRow>)
        .where(eq(teamsTable.id, id))
        .returning();
      return team;
    },

    async delete(id: string): Promise<void> {
      await db.delete(teamsTable)
        .where(eq(teamsTable.id, id));
    },
  };
}