import { pgTable, uuid, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";
import { teams } from "./teams.js";
import { companySkills, companySkillVersions } from "./company_skills.js";

export const teamSkills = pgTable(
  "team_skills",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
    teamId: uuid("team_id").notNull().references(() => teams.id, { onDelete: "cascade" }),
    companySkillId: uuid("company_skill_id")
      .notNull()
      .references(() => companySkills.id, { onDelete: "cascade" }),
    versionId: uuid("version_id").references(() => companySkillVersions.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyTeamSkillUniqueIdx: uniqueIndex("team_skills_company_team_skill_idx").on(
      table.companyId,
      table.teamId,
      table.companySkillId,
    ),
    companyTeamIdx: index("team_skills_company_team_idx").on(table.companyId, table.teamId),
    companySkillIdx: index("team_skills_company_skill_idx").on(table.companyId, table.companySkillId),
    companyVersionIdx: index("team_skills_company_version_idx").on(table.companyId, table.versionId),
  }),
);
