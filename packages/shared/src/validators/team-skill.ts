import { z } from "zod";

export const teamSkillDesiredEntrySchema = z.object({
  key: z.string().trim().min(1),
  versionId: z.string().uuid().nullable().optional(),
});

export const teamSkillDesiredSkillSchema = z.union([z.string().trim().min(1), teamSkillDesiredEntrySchema]);

export const assignTeamSkillsSchema = z.object({
  desiredSkills: z.array(teamSkillDesiredSkillSchema).min(1),
});

export type AssignTeamSkills = z.infer<typeof assignTeamSkillsSchema>;
