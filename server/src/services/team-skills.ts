import { and, eq, inArray } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { companySkills, teamSkills, teams as teamsTable } from "@paperclipai/db";
import type { TeamSkillEntry } from "@paperclipai/shared";
import { notFound, unprocessable } from "../errors.js";
import { companySkillService } from "./company-skills.js";

type TeamSkillRow = typeof teamSkills.$inferSelect;
type TeamSkillSelection = string | { key: string; versionId?: string | null };

export function teamSkillService(db: Db) {
  const skillsSvc = companySkillService(db);

  async function assertTeam(companyId: string, teamId: string): Promise<void> {
    const team = await db
      .select({ id: teamsTable.id, companyId: teamsTable.companyId })
      .from(teamsTable)
      .where(eq(teamsTable.id, teamId))
      .then((rows) => rows[0] ?? null);
    if (!team || team.companyId !== companyId) {
      throw notFound("Team not found");
    }
  }

  async function toEntries(rows: TeamSkillRow[]): Promise<TeamSkillEntry[]> {
    if (rows.length === 0) return [];
    const skillRows = await db
      .select()
      .from(companySkills)
      .where(inArray(companySkills.id, rows.map((row) => row.companySkillId)));
    const skillById = new Map(skillRows.map((skill) => [skill.id, skill]));

    return rows.map((row) => {
      const skill = skillById.get(row.companySkillId);
      return {
        id: row.id,
        teamId: row.teamId,
        companyId: row.companyId,
        companySkillId: row.companySkillId,
        versionId: row.versionId,
        skill: {
          key: skill?.key ?? row.companySkillId,
          slug: skill?.slug ?? "",
          name: skill?.name ?? "Deleted skill",
          description: skill?.description ?? null,
          iconUrl: skill?.iconUrl ?? null,
          color: skill?.color ?? null,
          sourceType: skill?.sourceType ?? "local_path",
          categories: skill?.categories ?? [],
        },
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      };
    });
  }

  async function list(companyId: string, teamId: string): Promise<TeamSkillEntry[]> {
    const rows = await db
      .select()
      .from(teamSkills)
      .where(and(eq(teamSkills.companyId, companyId), eq(teamSkills.teamId, teamId)))
      .orderBy(teamSkills.createdAt);
    return toEntries(rows);
  }

  async function assign(
    companyId: string,
    teamId: string,
    requestedSelections: TeamSkillSelection[],
  ): Promise<TeamSkillEntry[]> {
    await assertTeam(companyId, teamId);
    const normalized = requestedSelections.map((selection) => {
      if (typeof selection === "string") return selection;
      return { key: selection.key, versionId: selection.versionId ?? null };
    });
    const resolved = await skillsSvc.resolveRequestedSkillEntries(companyId, normalized);
    if (resolved.length === 0) {
      throw unprocessable("At least one valid company skill is required.");
    }

    const skills: NonNullable<Awaited<ReturnType<typeof skillsSvc.getByKey>>>[] = [];
    for (const entry of resolved) {
      const skill = await skillsSvc.getByKey(companyId, entry.key);
      if (!skill) {
        throw unprocessable(`Company skill not found: ${entry.key}`);
      }
      skills.push(skill);
    }

    await db.transaction(async (tx) => {
      await tx
        .delete(teamSkills)
        .where(and(eq(teamSkills.companyId, companyId), eq(teamSkills.teamId, teamId)));
      for (let index = 0; index < resolved.length; index += 1) {
        const entry = resolved[index]!;
        const skill = skills[index]!;
        await tx.insert(teamSkills).values({
          companyId,
          teamId,
          companySkillId: skill.id,
          versionId: entry.versionId ?? null,
        });
      }
    });

    return list(companyId, teamId);
  }

  async function remove(companyId: string, teamId: string, skillIds: string[]): Promise<TeamSkillEntry[]> {
    await assertTeam(companyId, teamId);
    if (skillIds.length > 0) {
      await db
        .delete(teamSkills)
        .where(
          and(
            eq(teamSkills.companyId, companyId),
            eq(teamSkills.teamId, teamId),
            inArray(teamSkills.companySkillId, skillIds),
          ),
        );
    }
    return list(companyId, teamId);
  }

  return {
    list,
    assign,
    remove,
  };
}
