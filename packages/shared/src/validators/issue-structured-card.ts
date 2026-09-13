import { z } from "zod";
import { STRUCTURED_CARD_SCENARIO_CODES } from "../types/issue-structured-card.js";

export const createIssueStructuredCardSchema = z.object({
  payload: z.record(z.unknown()),
  scenarioCode: z.enum(STRUCTURED_CARD_SCENARIO_CODES as unknown as [string, ...string[]]),
  soulEnabled: z.boolean().optional().default(false),
  runId: z.string().uuid().nullable().optional(),
});

export type CreateIssueStructuredCard = z.infer<typeof createIssueStructuredCardSchema>;
