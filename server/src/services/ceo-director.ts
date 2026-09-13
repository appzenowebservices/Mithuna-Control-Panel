import { and, eq, inArray } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { agents, companies, routines } from "@paperclipai/db";
import { logger } from "../middleware/logger.js";
import { logActivity } from "./activity-log.js";
import type { IssueAssignmentWakeupDeps } from "./issue-assignment-wakeup.js";
import { routineService } from "./routines.js";

/**
 * CEO Director — the company-level orchestration cadence.
 *
 * The heartbeat procedure tells agents "No assignments = exit", so the CEO
 * never originates company-level work on its own. This reconciler closes that
 * gap: for every active company with an invokable CEO agent it ensures a
 * "Strategic Review" routine exists with a schedule trigger assigned to the
 * CEO. Each firing creates a Strategic Review issue assigned to the CEO, which
 * wakes them with assigned work — the standing mechanism that turns board
 * intents and goals into cross-team execution (see the `paperclip-ceo` skill
 * for the loop the CEO runs when woken).
 *
 * The reconciler is idempotent and self-healing: it only creates when no
 * routine with the same title + assignee exists (any status), so archiving the
 * routine opts a CEO out permanently instead of being resurrected.
 */

export const CEO_DIRECTOR_ACTOR_USER_ID = "ceo-director";
const CEO_DIRECTOR_ACTOR = { userId: CEO_DIRECTOR_ACTOR_USER_ID } as const;

export const STRATEGIC_REVIEW_TITLE = "Strategic Review";
/** Cadence for new Strategic Review issues. Overridable via env. */
export const STRATEGIC_REVIEW_CRON =
  process.env.PAPERCLIP_CEO_REVIEW_CRON ?? "*/5 * * * *";
export const STRATEGIC_REVIEW_TIMEZONE = "UTC";

export const STRATEGIC_REVIEW_DESCRIPTION = [
  "Company-level strategic review. As CEO, review the current state of the",
  "company, decide what should happen next, and act on it. This issue is your",
  "standing orchestration cadence — it exists so the company keeps moving",
  "toward its goals even when no one hands you work.",
  "",
  "Run the orchestration loop from the `paperclip-ceo` skill:",
  "1. Pull company state — goals, projects, open/blocked issues, your inbox.",
  "2. Find gaps worth acting on — board intents with no owner, blocked work",
  "   needing an owner, goal milestones with no plan, idle teams with capacity.",
  "3. Originate work — create issues assigned to the team lead or the most",
  "   suitable agent, set priority, wire first-class blockers (blockedByIssueIds).",
  "4. Delegate and monitor — let assignees execute; keep follow-ups as child",
  "   issues. Do not micromanage.",
  "5. Report — update the Board Operations decision log and leave a concise",
  "   comment here summarizing what you reviewed and what you created.",
  "6. Close — mark this issue done only once there is a clear next action and a",
  "   durable trail. If nothing needs doing, say so explicitly and close.",
].join("\n");

const INVOKABLE_AGENT_STATUSES: string[] = ["active", "idle", "running", "error"];

export type CeoDirectorReconcileResult = {
  companies: number;
  agents: number;
  created: number;
  existing: number;
  skipped: number;
};

export function ceoDirectorService(
  db: Db,
  deps: { heartbeat?: IssueAssignmentWakeupDeps } = {},
) {
  const routinesSvc = routineService(db, { heartbeat: deps.heartbeat });

  async function reconcileCeoStrategicReviewRoutines(
    now: Date = new Date(),
  ): Promise<CeoDirectorReconcileResult> {
    const candidates = await db
      .select({ companyId: agents.companyId, agentId: agents.id })
      .from(agents)
      .innerJoin(
        companies,
        and(eq(companies.id, agents.companyId), eq(companies.status, "active")),
      )
      .where(
        and(eq(agents.role, "ceo"), inArray(agents.status, INVOKABLE_AGENT_STATUSES)),
      );

    const companiesWithCeo = new Set(candidates.map((row) => row.companyId));
    let created = 0;
    let existing = 0;
    let skipped = 0;

    for (const candidate of candidates) {
      const existingRoutine = await db
        .select({ id: routines.id })
        .from(routines)
        .where(
          and(
            eq(routines.companyId, candidate.companyId),
            eq(routines.assigneeAgentId, candidate.agentId),
            eq(routines.title, STRATEGIC_REVIEW_TITLE),
          ),
        )
        .limit(1)
        .then((rows) => rows[0] ?? null);

      if (existingRoutine) {
        existing += 1;
        continue;
      }

      try {
        const routine = await routinesSvc.create(
          candidate.companyId,
          {
            title: STRATEGIC_REVIEW_TITLE,
            description: STRATEGIC_REVIEW_DESCRIPTION,
            priority: "medium",
            status: "active",
            concurrencyPolicy: "skip_if_active",
            catchUpPolicy: "skip_missed",
            assigneeAgentId: candidate.agentId,
            variables: [],
          },
          CEO_DIRECTOR_ACTOR,
        );

        const { trigger } = await routinesSvc.createTrigger(
          routine.id,
          {
            kind: "schedule",
            label: "Strategic Review cadence",
            cronExpression: STRATEGIC_REVIEW_CRON,
            timezone: STRATEGIC_REVIEW_TIMEZONE,
            enabled: true,
          },
          CEO_DIRECTOR_ACTOR,
        );

        // Kick the first review immediately so the CEO is woken on bootstrap
        // instead of waiting for the first cron boundary. Subsequent cycles are
        // driven by the schedule trigger (skip_if_active prevents stacking).
        await routinesSvc.runRoutine(
          routine.id,
          {
            triggerId: trigger.id,
            source: "manual",
            idempotencyKey: `ceo-director:bootstrap:${candidate.companyId}:${candidate.agentId}:${now.toISOString()}`,
          },
          CEO_DIRECTOR_ACTOR,
        );

        await logActivity(db, {
          companyId: candidate.companyId,
          actorType: "system",
          actorId: CEO_DIRECTOR_ACTOR_USER_ID,
          action: "ceo.strategic_review_routine_created",
          entityType: "routine",
          entityId: routine.id,
          details: {
            agentId: candidate.agentId,
            cronExpression: STRATEGIC_REVIEW_CRON,
          },
        });
        created += 1;
      } catch (err) {
        skipped += 1;
        logger.warn(
          { err, companyId: candidate.companyId, agentId: candidate.agentId },
          "ceo-director: failed to create strategic review routine",
        );
      }
    }

    return {
      companies: companiesWithCeo.size,
      agents: candidates.length,
      created,
      existing,
      skipped,
    };
  }

  return { reconcileCeoStrategicReviewRoutines };
}
