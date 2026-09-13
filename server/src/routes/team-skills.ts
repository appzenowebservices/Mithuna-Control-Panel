import { Router } from "express";
import type { Db } from "@paperclipai/db";
import { assignTeamSkillsSchema } from "@paperclipai/shared";
import { validate } from "../middleware/validate.js";
import { teamSkillService } from "../services/team-skills.js";
import { assertCompanyAccess } from "./authz.js";

export function teamSkillRoutes(db: Db) {
  const router = Router();
  const teamSkills = teamSkillService(db);

  router.get("/companies/:companyId/teams/:teamId/skills", async (req, res) => {
    const companyId = req.params.companyId as string;
    const teamId = req.params.teamId as string;
    await assertCompanyAccess(req, companyId);
    const entries = await teamSkills.list(companyId, teamId);
    res.json(entries);
  });

  router.post(
    "/companies/:companyId/teams/:teamId/skills",
    validate(assignTeamSkillsSchema),
    async (req, res) => {
      const companyId = req.params.companyId as string;
      const teamId = req.params.teamId as string;
      await assertCompanyAccess(req, companyId);
      const entries = await teamSkills.assign(companyId, teamId, req.body.desiredSkills);
      res.status(201).json(entries);
    },
  );

  router.delete("/companies/:companyId/teams/:teamId/skills/:companySkillId", async (req, res) => {
    const companyId = req.params.companyId as string;
    const teamId = req.params.teamId as string;
    const companySkillId = req.params.companySkillId as string;
    await assertCompanyAccess(req, companyId);
    const entries = await teamSkills.remove(companyId, teamId, [companySkillId]);
    res.json(entries);
  });

  return router;
}
