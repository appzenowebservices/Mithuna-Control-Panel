import { Router } from "express";
import type { Db } from "@paperclipai/db";
import { createTeamSchema, updateTeamSchema } from "@paperclipai/shared";
import { validate } from "../middleware/validate.js";
import { teamService } from "../services/teams.js";
import { assertCompanyAccess } from "./authz.js";

export function teamRoutes(db: Db) {
  const router = Router();
  const teams = teamService(db);

  router.get("/companies/:companyId/teams", async (req, res) => {
    const companyId = req.params.companyId as string;
    await assertCompanyAccess(req, companyId);
    const list = await teams.listByCompany(companyId);
    res.json(list);
  });

  router.post("/companies/:companyId/teams", validate(createTeamSchema), async (req, res) => {
    const companyId = req.params.companyId as string;
    await assertCompanyAccess(req, companyId);
    const { name, description, leadAgentId, color, metadata } = req.body;
    const team = await teams.create({
      companyId,
      name,
      description: description ?? null,
      leadAgentId: leadAgentId ?? null,
      color: color ?? null,
      metadata: metadata ?? {},
    });
    res.status(201).json(team);
  });

  router.get("/companies/:companyId/teams/:teamId", async (req, res) => {
    const companyId = req.params.companyId as string;
    const teamId = req.params.teamId as string;
    await assertCompanyAccess(req, companyId);
    const team = await teams.getById(teamId);
    if (!team || team.companyId !== companyId) {
      return res.status(404).json({ error: "Team not found" });
    }
    res.json(team);
  });

  router.get("/companies/:companyId/teams/:teamId/agents", async (req, res) => {
    const companyId = req.params.companyId as string;
    const teamId = req.params.teamId as string;
    await assertCompanyAccess(req, companyId);
    const agents = await teams.listAgentsByTeam(companyId, teamId);
    res.json(agents);
  });

  router.get("/companies/:companyId/teams/:teamId/projects", async (req, res) => {
    const companyId = req.params.companyId as string;
    const teamId = req.params.teamId as string;
    await assertCompanyAccess(req, companyId);
    const projects = await teams.listProjectsByTeam(companyId, teamId);
    res.json(projects);
  });

  router.patch("/companies/:companyId/teams/:teamId", validate(updateTeamSchema), async (req, res) => {
    const companyId = req.params.companyId as string;
    const teamId = req.params.teamId as string;
    await assertCompanyAccess(req, companyId);
    const team = await teams.getById(teamId);
    if (!team || team.companyId !== companyId) {
      return res.status(404).json({ error: "Team not found" });
    }
    const { name, description, leadAgentId, color, metadata } = req.body;
    const updated = await teams.update(teamId, {
      name,
      description: description ?? null,
      leadAgentId: leadAgentId ?? null,
      color: color ?? null,
      metadata,
    });
    res.json(updated);
  });

  router.delete("/companies/:companyId/teams/:teamId", async (req, res) => {
    const companyId = req.params.companyId as string;
    const teamId = req.params.teamId as string;
    await assertCompanyAccess(req, companyId);
    const team = await teams.getById(teamId);
    if (!team || team.companyId !== companyId) {
      return res.status(404).json({ error: "Team not found" });
    }
    await teams.delete(teamId);
    res.status(204).send();
  });

  return router;
}