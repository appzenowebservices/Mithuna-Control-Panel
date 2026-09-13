import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Router } from "express";
import { z } from "zod";
import type { Db } from "@paperclipai/db";
import {
  createCompanyWorkspaceSchema,
  updateCompanyWorkspaceSchema,
} from "@paperclipai/shared";
import { badRequest } from "../errors.js";
import { validate } from "../middleware/validate.js";
import { companyWorkspaceService, logActivity } from "../services/index.js";
import { assertBoard, assertCompanyAccess, getActorInfo } from "./authz.js";

function collectCompanyWorkspaceCommandPaths(value: unknown): string[] {
  if (!value || typeof value !== "object") return [];
  const paths: string[] = [];
  if (Object.prototype.hasOwnProperty.call(value, "setupCommand")) paths.push("setupCommand");
  if (Object.prototype.hasOwnProperty.call(value, "cleanupCommand")) paths.push("cleanupCommand");
  return paths;
}

const promoteCompanyWorkspaceSchema = z.object({
  issueId: z.string().uuid().optional().nullable(),
  filePaths: z.array(z.string().min(1)).optional().default([]),
  title: z.string().optional().nullable(),
  message: z.string().optional().nullable(),
});

const DEFAULT_HERMES_ENDPOINT = "http://localhost:8765/api/v1";

function hermesEndpoint(): string {
  return process.env.HERMES_HTTP_ENDPOINT?.trim() || DEFAULT_HERMES_ENDPOINT;
}

function stripSkillFrontmatter(content: string): string {
  return content.replace(/^---[\s\S]*?---\s*\n/, "");
}

async function loadGitWorkflowPrSkill(): Promise<string> {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const skillPath = path.resolve(here, "../../../skills/git-workflow-pr/SKILL.md");
  try {
    return stripSkillFrontmatter(await fs.readFile(skillPath, "utf-8"));
  } catch {
    return (
      "You promote approved workspace files into a git repository: create a " +
      "feature branch, commit the approved files, push, and open a pull request."
    );
  }
}

async function detectHermesModel(endpoint: string): Promise<{ model?: string; provider?: string }> {
  try {
    const res = await fetch(`${endpoint}/model`, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return {};
    const info = (await res.json()) as { model?: string; provider?: string };
    return { model: info.model || undefined, provider: info.provider || undefined };
  } catch {
    return {};
  }
}

export function companyWorkspaceRoutes(db: Db) {
  const router = Router();
  const svc = companyWorkspaceService(db);

  router.get("/companies/:companyId/workspaces", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const workspaces = await svc.listForCompany(companyId);
    res.json(workspaces);
  });

  router.get("/companies/:companyId/workspaces/:workspaceId", async (req, res) => {
    const companyId = req.params.companyId as string;
    const workspaceId = req.params.workspaceId as string;
    assertCompanyAccess(req, companyId);
    const workspace = await svc.getById(companyId, workspaceId);
    if (!workspace) {
      res.status(404).json({ error: "Company workspace not found" });
      return;
    }
    res.json(workspace);
  });

  router.post("/companies/:companyId/workspaces", validate(createCompanyWorkspaceSchema), async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    if (req.actor.type === "agent" && collectCompanyWorkspaceCommandPaths(req.body).length > 0) {
      res.status(403).json({ error: "Agent keys cannot modify host-executed workspace commands." });
      return;
    }
    const workspace = await svc.create(companyId, req.body);
    if (!workspace) {
      res.status(422).json({ error: "Invalid company workspace payload" });
      return;
    }
    const actor = getActorInfo(req);
    await logActivity(db, {
      companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      action: "company.workspace_created",
      entityType: "company",
      entityId: companyId,
      details: {
        workspaceId: workspace.id,
        name: workspace.name,
        cwd: workspace.cwd,
        isPrimary: workspace.isPrimary,
      },
    });
    res.status(201).json(workspace);
  });

  router.patch(
    "/companies/:companyId/workspaces/:workspaceId",
    validate(updateCompanyWorkspaceSchema),
    async (req, res) => {
      const companyId = req.params.companyId as string;
      const workspaceId = req.params.workspaceId as string;
      assertCompanyAccess(req, companyId);
      if (req.actor.type === "agent" && collectCompanyWorkspaceCommandPaths(req.body).length > 0) {
        res.status(403).json({ error: "Agent keys cannot modify host-executed workspace commands." });
        return;
      }
      const existing = await svc.getById(companyId, workspaceId);
      if (!existing) {
        res.status(404).json({ error: "Company workspace not found" });
        return;
      }
      const workspace = await svc.update(companyId, workspaceId, req.body);
      if (!workspace) {
        res.status(422).json({ error: "Invalid company workspace payload" });
        return;
      }
      const actor = getActorInfo(req);
      await logActivity(db, {
        companyId,
        actorType: actor.actorType,
        actorId: actor.actorId,
        agentId: actor.agentId,
        action: "company.workspace_updated",
        entityType: "company",
        entityId: companyId,
        details: {
          workspaceId: workspace.id,
          changedKeys: Object.keys(req.body).sort(),
        },
      });
      res.json(workspace);
    },
  );

  router.delete("/companies/:companyId/workspaces/:workspaceId", async (req, res) => {
    const companyId = req.params.companyId as string;
    const workspaceId = req.params.workspaceId as string;
    assertCompanyAccess(req, companyId);
    const existing = await svc.getById(companyId, workspaceId);
    if (!existing) {
      res.status(404).json({ error: "Company workspace not found" });
      return;
    }
    await svc.remove(companyId, workspaceId);
    const actor = getActorInfo(req);
    await logActivity(db, {
      companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      action: "company.workspace_deleted",
      entityType: "company",
      entityId: companyId,
      details: {
        workspaceId,
        name: existing.name,
      },
    });
    res.status(204).end();
  });

  router.post(
    "/companies/:companyId/workspaces/:workspaceId/promotions",
    validate(promoteCompanyWorkspaceSchema),
    async (req, res) => {
      const companyId = req.params.companyId as string;
      const workspaceId = req.params.workspaceId as string;
      assertBoard(req);
      assertCompanyAccess(req, companyId);

      const workspace = await svc.getById(companyId, workspaceId);
      if (!workspace) {
        res.status(404).json({ error: "Company workspace not found" });
        return;
      }
      if (!workspace.cwd) {
        res.status(422).json({ error: "Company workspace has no local path configured." });
        return;
      }
      if (!workspace.repoUrl) {
        res.status(422).json({ error: "Company workspace needs a repo URL to open a pull request." });
        return;
      }

      const filePaths: string[] = Array.isArray(req.body.filePaths) ? req.body.filePaths : [];
      const issueId = typeof req.body.issueId === "string" ? req.body.issueId : null;
      const title = typeof req.body.title === "string" && req.body.title.trim().length > 0 ? req.body.title.trim() : null;
      const extraMessage = typeof req.body.message === "string" && req.body.message.trim().length > 0 ? req.body.message.trim() : null;

      const skillBody = await loadGitWorkflowPrSkill();
      const apiUrl = process.env.PAPERCLIP_API_URL?.replace(/\/$/, "") ?? `http://localhost:${process.env.PORT ?? 3100}`;
      const apiKey = process.env.PAPERCLIP_AGENT_API_KEY?.trim() || null;

      const connectionNote =
        `\n\n## Paperclip Connection\n` +
        `- PAPERCLIP_API_URL = ${apiUrl}\n` +
        `- PAPERCLIP_COMPANY_ID = ${companyId}\n` +
        (apiKey ? `- PAPERCLIP_API_KEY is available in the run env for work-product registration.\n` : ``) +
        (issueId ? `- Target issue id: ${issueId}\n` : ``) +
        `- Workspace cwd: ${workspace.cwd}\n` +
        `- Repo url: ${workspace.repoUrl}\n`;

      const fileList =
        filePaths.length > 0
          ? filePaths.map((filePath) => `- ${filePath}`).join("\n")
          : "(none provided — inspect the workspace and include all board-approved deliverables)";

      const message =
        `Promote board-approved artifacts in the company workspace at ${workspace.cwd} to the repo ` +
        `${workspace.repoUrl} by running the git-workflow-pr procedure.\n\n` +
        `Approved files (workspace-relative):\n${fileList}\n\n` +
        (title ? `PR title: ${title}\n` : ``) +
        (extraMessage ? `Additional instructions: ${extraMessage}\n` : ``);

      const systemPrompt = skillBody + connectionNote;

      let hermesResponse: string;
      let provider: string | undefined;
      let model: string | undefined;
      try {
        const detected = await detectHermesModel(hermesEndpoint());
        const endpoint = hermesEndpoint();
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 30 * 60 * 1000);
        try {
          const response = await fetch(`${endpoint}/chat/sync`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              message,
              system_prompt: systemPrompt,
              skills: ["git-workflow-pr"],
              cwd: workspace.cwd,
              companyId,
              max_turns: 40,
              ...(apiKey ? { apiKey } : {}),
              ...(issueId ? { issueId } : {}),
              ...detected,
            }),
            signal: controller.signal,
          });
          if (!response.ok) {
            const detail = await response.text().catch(() => "");
            throw new Error(`Hermes promote failed with HTTP ${response.status}${detail ? `: ${detail.slice(0, 300)}` : ""}`);
          }
          const payload = (await response.json()) as {
            response?: string;
            provider?: string;
            model?: string;
          };
          hermesResponse = payload.response ?? "";
          provider = payload.provider;
          model = payload.model;
        } finally {
          clearTimeout(timeout);
        }
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        res.status(502).json({ error: `Promote run failed: ${reason}` });
        return;
      }

      const actor = getActorInfo(req);
      await logActivity(db, {
        companyId,
        actorType: actor.actorType,
        actorId: actor.actorId,
        agentId: actor.agentId,
        action: "company.workspace_promote",
        entityType: "company",
        entityId: companyId,
        details: {
          workspaceId,
          filePathCount: filePaths.length,
          issueId,
        },
      });

      res.json({
        ok: true,
        response: hermesResponse.slice(0, 4000),
        provider,
        model,
      });
    },
  );

  return router;
}
