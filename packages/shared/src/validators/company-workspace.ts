import { z } from "zod";

export const companyWorkspaceSourceTypeSchema = z.enum(["local_path", "git_repo", "non_git_path"]);
export const companyWorkspaceVisibilitySchema = z.enum(["default", "advanced"]);

const companyWorkspaceFields = {
  name: z.string().min(1).optional(),
  sourceType: companyWorkspaceSourceTypeSchema.optional(),
  cwd: z.string().min(1).optional().nullable(),
  repoUrl: z.string().url().optional().nullable(),
  repoRef: z.string().optional().nullable(),
  defaultRef: z.string().optional().nullable(),
  visibility: companyWorkspaceVisibilitySchema.optional(),
  setupCommand: z.string().optional().nullable(),
  cleanupCommand: z.string().optional().nullable(),
  sharedWorkspaceKey: z.string().optional().nullable(),
  metadata: z.record(z.string(), z.unknown()).optional().nullable(),
};

function validateCompanyWorkspace(value: Record<string, unknown>, ctx: z.RefinementCtx) {
  const hasCwd = typeof value.cwd === "string" && value.cwd.trim().length > 0;
  const hasRepo = typeof value.repoUrl === "string" && value.repoUrl.trim().length > 0;
  if (!hasCwd && !hasRepo) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Company workspace requires at least one of cwd or repoUrl.",
      path: ["cwd"],
    });
  }
}

export const createCompanyWorkspaceSchema = z
  .object({
    ...companyWorkspaceFields,
    isPrimary: z.boolean().optional().default(false),
  })
  .superRefine(validateCompanyWorkspace);

export type CreateCompanyWorkspace = z.infer<typeof createCompanyWorkspaceSchema>;

export const updateCompanyWorkspaceSchema = z
  .object({
    ...companyWorkspaceFields,
    isPrimary: z.boolean().optional(),
  })
  .partial();

export type UpdateCompanyWorkspace = z.infer<typeof updateCompanyWorkspaceSchema>;
