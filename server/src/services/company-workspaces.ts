import { and, asc, desc, eq } from "drizzle-orm";
import fs from "node:fs/promises";
import type { Db } from "@paperclipai/db";
import { companyWorkspaces, companies } from "@paperclipai/db";
import type {
  CompanyWorkspace,
  CompanyWorkspaceSourceType,
  CompanyWorkspaceVisibility,
  CreateCompanyWorkspace,
  UpdateCompanyWorkspace,
} from "@paperclipai/shared";

type CompanyWorkspaceRow = typeof companyWorkspaces.$inferSelect;

function readNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function deriveNameFromCwd(cwd: string): string {
  const normalized = cwd.replace(/[\\/]+$/, "");
  const segments = normalized.split(/[\\/]/).filter(Boolean);
  return segments[segments.length - 1] ?? "Local folder";
}

function deriveNameFromRepoUrl(repoUrl: string): string {
  try {
    const url = new URL(repoUrl);
    const cleanedPath = url.pathname.replace(/\/+$/, "");
    const lastSegment = cleanedPath.split("/").filter(Boolean).pop() ?? "";
    return lastSegment.replace(/\.git$/i, "") || repoUrl;
  } catch {
    return repoUrl;
  }
}

function deriveWorkspaceName(input: { name?: string | null; cwd?: string | null; repoUrl?: string | null }) {
  const explicit = readNonEmptyString(input.name);
  if (explicit) return explicit;
  const cwd = readNonEmptyString(input.cwd);
  if (cwd) return deriveNameFromCwd(cwd);
  const repoUrl = readNonEmptyString(input.repoUrl);
  if (repoUrl) return deriveNameFromRepoUrl(repoUrl);
  return "Company Workspace";
}

function toCompanyWorkspace(row: CompanyWorkspaceRow): CompanyWorkspace {
  return {
    id: row.id,
    companyId: row.companyId,
    name: row.name,
    sourceType: row.sourceType as CompanyWorkspaceSourceType,
    cwd: row.cwd ?? null,
    repoUrl: row.repoUrl ?? null,
    repoRef: row.repoRef ?? null,
    defaultRef: row.defaultRef ?? row.repoRef ?? null,
    visibility: row.visibility as CompanyWorkspaceVisibility,
    setupCommand: row.setupCommand ?? null,
    cleanupCommand: row.cleanupCommand ?? null,
    sharedWorkspaceKey: row.sharedWorkspaceKey ?? null,
    metadata: (row.metadata as Record<string, unknown> | null) ?? null,
    isPrimary: row.isPrimary,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function companyWorkspaceService(db: Db) {
  return {
    listForCompany: async (companyId: string): Promise<CompanyWorkspace[]> => {
      const rows = await db
        .select()
        .from(companyWorkspaces)
        .where(eq(companyWorkspaces.companyId, companyId))
        .orderBy(desc(companyWorkspaces.isPrimary), asc(companyWorkspaces.createdAt), asc(companyWorkspaces.id));
      return rows.map(toCompanyWorkspace);
    },

    getById: async (companyId: string, workspaceId: string): Promise<CompanyWorkspace | null> => {
      const row = await db
        .select()
        .from(companyWorkspaces)
        .where(
          and(
            eq(companyWorkspaces.id, workspaceId),
            eq(companyWorkspaces.companyId, companyId),
          ),
        )
        .then((rows) => rows[0] ?? null);
      return row ? toCompanyWorkspace(row) : null;
    },

    getPrimaryForCompany: async (companyId: string): Promise<CompanyWorkspace | null> => {
      const row = await db
        .select()
        .from(companyWorkspaces)
        .where(and(eq(companyWorkspaces.companyId, companyId), eq(companyWorkspaces.isPrimary, true)))
        .orderBy(asc(companyWorkspaces.createdAt), asc(companyWorkspaces.id))
        .then((rows) => rows[0] ?? null);
      if (row) return toCompanyWorkspace(row);
      const fallback = await db
        .select()
        .from(companyWorkspaces)
        .where(eq(companyWorkspaces.companyId, companyId))
        .orderBy(asc(companyWorkspaces.createdAt), asc(companyWorkspaces.id))
        .then((rows) => rows[0] ?? null);
      return fallback ? toCompanyWorkspace(fallback) : null;
    },

    create: async (companyId: string, data: CreateCompanyWorkspace): Promise<CompanyWorkspace | null> => {
      const company = await db
        .select()
        .from(companies)
        .where(eq(companies.id, companyId))
        .then((rows) => rows[0] ?? null);
      if (!company) return null;

      const cwd = readNonEmptyString(data.cwd);
      const repoUrl = readNonEmptyString(data.repoUrl);
      const sourceType =
        readNonEmptyString(data.sourceType) ?? (repoUrl ? "git_repo" : cwd ? "local_path" : "non_git_path");
      if (!cwd && !repoUrl) return null;
      const name = deriveWorkspaceName({ name: data.name, cwd, repoUrl });

      const existing = await db
        .select()
        .from(companyWorkspaces)
        .where(eq(companyWorkspaces.companyId, companyId))
        .orderBy(asc(companyWorkspaces.createdAt))
        .then((rows) => rows);

      const shouldBePrimary = data.isPrimary === true || existing.length === 0;

      if (cwd && (sourceType === "local_path" || sourceType === "non_git_path")) {
        await fs.mkdir(cwd, { recursive: true });
      }

      const created = await db.transaction(async (tx) => {
        if (shouldBePrimary) {
          await tx
            .update(companyWorkspaces)
            .set({ isPrimary: false, updatedAt: new Date() })
            .where(eq(companyWorkspaces.companyId, companyId));
        }
        const row = await tx
          .insert(companyWorkspaces)
          .values({
            companyId,
            name,
            sourceType,
            cwd: cwd ?? null,
            repoUrl: repoUrl ?? null,
            repoRef: readNonEmptyString(data.repoRef),
            defaultRef: readNonEmptyString(data.defaultRef) ?? readNonEmptyString(data.repoRef),
            visibility: readNonEmptyString(data.visibility) ?? "default",
            setupCommand: readNonEmptyString(data.setupCommand),
            cleanupCommand: readNonEmptyString(data.cleanupCommand),
            sharedWorkspaceKey: readNonEmptyString(data.sharedWorkspaceKey),
            metadata: data.metadata ?? null,
            isPrimary: shouldBePrimary,
          })
          .returning()
          .then((rows) => rows[0] ?? null);
        return row;
      });

      return created ? toCompanyWorkspace(created) : null;
    },

    update: async (
      companyId: string,
      workspaceId: string,
      data: UpdateCompanyWorkspace,
    ): Promise<CompanyWorkspace | null> => {
      const existing = await db
        .select()
        .from(companyWorkspaces)
        .where(
          and(
            eq(companyWorkspaces.id, workspaceId),
            eq(companyWorkspaces.companyId, companyId),
          ),
        )
        .then((rows) => rows[0] ?? null);
      if (!existing) return null;

      const nextCwd = data.cwd !== undefined ? readNonEmptyString(data.cwd) : readNonEmptyString(existing.cwd);
      const nextRepoUrl =
        data.repoUrl !== undefined ? readNonEmptyString(data.repoUrl) : readNonEmptyString(existing.repoUrl);
      if (!nextCwd && !nextRepoUrl) return null;

      const patch: Partial<typeof companyWorkspaces.$inferInsert> = {
        updatedAt: new Date(),
      };
      if (data.name !== undefined) patch.name = deriveWorkspaceName({ name: data.name, cwd: nextCwd, repoUrl: nextRepoUrl });
      if (data.name === undefined && (data.cwd !== undefined || data.repoUrl !== undefined)) {
        patch.name = deriveWorkspaceName({ cwd: nextCwd, repoUrl: nextRepoUrl });
      }
      if (data.cwd !== undefined) patch.cwd = nextCwd ?? null;
      if (data.repoUrl !== undefined) patch.repoUrl = nextRepoUrl ?? null;
      if (data.repoRef !== undefined) patch.repoRef = readNonEmptyString(data.repoRef);
      if (data.sourceType !== undefined) {
        const nextSourceType = readNonEmptyString(data.sourceType);
        if (nextSourceType) patch.sourceType = nextSourceType;
      }
      if (data.defaultRef !== undefined) patch.defaultRef = readNonEmptyString(data.defaultRef);
      if (data.visibility !== undefined) {
        const nextVisibility = readNonEmptyString(data.visibility);
        if (nextVisibility) patch.visibility = nextVisibility;
      }
      if (data.setupCommand !== undefined) patch.setupCommand = readNonEmptyString(data.setupCommand);
      if (data.cleanupCommand !== undefined) patch.cleanupCommand = readNonEmptyString(data.cleanupCommand);
      if (data.sharedWorkspaceKey !== undefined) patch.sharedWorkspaceKey = readNonEmptyString(data.sharedWorkspaceKey);
      if (data.metadata !== undefined) patch.metadata = data.metadata ?? null;

      const updated = await db.transaction(async (tx) => {
        if (data.isPrimary === true) {
          await tx
            .update(companyWorkspaces)
            .set({ isPrimary: false, updatedAt: new Date() })
            .where(eq(companyWorkspaces.companyId, companyId));
          patch.isPrimary = true;
        } else if (data.isPrimary === false) {
          patch.isPrimary = false;
        }
        return await tx
          .update(companyWorkspaces)
          .set(patch)
          .where(eq(companyWorkspaces.id, workspaceId))
          .returning()
          .then((rows) => rows[0] ?? null);
      });

      return updated ? toCompanyWorkspace(updated) : null;
    },

    remove: async (companyId: string, workspaceId: string): Promise<boolean> => {
      const removed = await db
        .delete(companyWorkspaces)
        .where(
          and(
            eq(companyWorkspaces.id, workspaceId),
            eq(companyWorkspaces.companyId, companyId),
          ),
        )
        .returning({ id: companyWorkspaces.id })
        .then((rows) => rows[0] ?? null);
      return removed !== null;
    },
  };
}
