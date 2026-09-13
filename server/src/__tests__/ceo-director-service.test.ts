import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  activityLog,
  agents,
  companies,
  documentRevisions,
  documents,
  issues,
  routineDocuments,
  routineRevisions,
  routineRuns,
  routines,
  routineTriggers,
  createDb,
} from "@paperclipai/db";
import {
  getEmbeddedPostgresTestSupport,
  startEmbeddedPostgresTestDatabase,
} from "./helpers/embedded-postgres.js";
import {
  ceoDirectorService,
  STRATEGIC_REVIEW_CRON,
  STRATEGIC_REVIEW_TITLE,
} from "../services/ceo-director.ts";

const embeddedPostgresSupport = await getEmbeddedPostgresTestSupport();
const describeEmbeddedPostgres = embeddedPostgresSupport.supported ? describe : describe.skip;

if (!embeddedPostgresSupport.supported) {
  console.warn(
    `Skipping embedded Postgres CEO director tests on this host: ${embeddedPostgresSupport.reason ?? "unsupported environment"}`,
  );
}

describeEmbeddedPostgres("CEO director strategic review reconciler", () => {
  let db!: ReturnType<typeof createDb>;
  let tempDb: Awaited<ReturnType<typeof startEmbeddedPostgresTestDatabase>> | null = null;

  beforeAll(async () => {
    tempDb = await startEmbeddedPostgresTestDatabase("paperclip-ceo-director-");
    db = createDb(tempDb.connectionString);
  }, 20_000);

  afterEach(async () => {
    await db.delete(routineRuns);
    await db.delete(routineTriggers);
    await db.delete(routines);
    await db.delete(routineRevisions);
    await db.delete(routineDocuments);
    await db.delete(documentRevisions);
    await db.delete(documents);
    await db.delete(issues);
    await db.delete(activityLog);
    await db.delete(agents);
    await db.delete(companies);
  });

  afterAll(async () => {
    await tempDb?.cleanup();
  });

  async function seedCompanyWithCeo(opts?: {
    companyStatus?: string;
    ceoStatus?: string;
  }) {
    const companyId = randomUUID();
    const ceoId = randomUUID();
    const issuePrefix = `T${companyId.replace(/-/g, "").slice(0, 6).toUpperCase()}`;

    await db.insert(companies).values({
      id: companyId,
      name: "Test Co",
      issuePrefix,
      status: opts?.companyStatus ?? "active",
      requireBoardApprovalForNewAgents: false,
    });
    await db.insert(agents).values({
      id: ceoId,
      companyId,
      name: "CEO",
      role: "ceo",
      status: opts?.ceoStatus ?? "active",
      adapterType: "codex_local",
      adapterConfig: {},
      runtimeConfig: {},
      permissions: {},
    });

    return { companyId, ceoId };
  }

  function noopHeartbeat() {
    return {
      wakeup: async () => ({ id: randomUUID() }),
    };
  }

  it("creates a Strategic Review routine + schedule trigger and fires the first review", async () => {
    const { companyId, ceoId } = await seedCompanyWithCeo();

    const director = ceoDirectorService(db, { heartbeat: noopHeartbeat() });
    const result = await director.reconcileCeoStrategicReviewRoutines(new Date("2026-08-07T12:00:00Z"));

    expect(result.created).toBe(1);
    expect(result.agents).toBe(1);

    const routine = await db
      .select()
      .from(routines)
      .where(eq(routines.companyId, companyId))
      .then((rows) => rows[0] ?? null);
    expect(routine).not.toBeNull();
    expect(routine!.title).toBe(STRATEGIC_REVIEW_TITLE);
    expect(routine!.assigneeAgentId).toBe(ceoId);
    expect(routine!.status).toBe("active");
    expect(routine!.concurrencyPolicy).toBe("skip_if_active");

    const trigger = await db
      .select()
      .from(routineTriggers)
      .where(eq(routineTriggers.routineId, routine!.id))
      .then((rows) => rows[0] ?? null);
    expect(trigger).not.toBeNull();
    expect(trigger!.kind).toBe("schedule");
    expect(trigger!.enabled).toBe(true);
    expect(trigger!.cronExpression).toBe(STRATEGIC_REVIEW_CRON);

    // The bootstrap runRoutine created the first Strategic Review issue
    // assigned to the CEO.
    const reviewIssues = await db
      .select()
      .from(issues)
      .where(eq(issues.companyId, companyId));
    expect(reviewIssues).toHaveLength(1);
    expect(reviewIssues[0].title).toBe(STRATEGIC_REVIEW_TITLE);
    expect(reviewIssues[0].assigneeAgentId).toBe(ceoId);
    expect(reviewIssues[0].status).toBe("todo");

    const logged = await db
      .select()
      .from(activityLog)
      .where(eq(activityLog.companyId, companyId));
    expect(logged.some((row) => row.action === "ceo.strategic_review_routine_created")).toBe(true);
  });

  it("is idempotent — does not duplicate the routine or issue on a second pass", async () => {
    const { companyId } = await seedCompanyWithCeo();
    const director = ceoDirectorService(db, { heartbeat: noopHeartbeat() });

    await director.reconcileCeoStrategicReviewRoutines(new Date("2026-08-07T12:00:00Z"));
    const second = await director.reconcileCeoStrategicReviewRoutines(new Date("2026-08-07T12:05:00Z"));

    expect(second.created).toBe(0);
    expect(second.existing).toBe(1);

    const routineCount = await db
      .select({ id: routines.id })
      .from(routines)
      .where(eq(routines.companyId, companyId))
      .then((rows) => rows.length);
    expect(routineCount).toBe(1);

    const issueCount = await db
      .select({ id: issues.id })
      .from(issues)
      .where(eq(issues.companyId, companyId))
      .then((rows) => rows.length);
    expect(issueCount).toBe(1);
  });

  it("skips paused or terminated CEOs and inactive companies", async () => {
    const pausedCeo = await seedCompanyWithCeo({ ceoStatus: "paused" });
    const terminatedCeo = await seedCompanyWithCeo({ ceoStatus: "terminated" });
    const archivedCompany = await seedCompanyWithCeo({ companyStatus: "archived" });

    const director = ceoDirectorService(db, { heartbeat: noopHeartbeat() });
    const result = await director.reconcileCeoStrategicReviewRoutines(new Date());

    expect(result.created).toBe(0);
    expect(result.agents).toBe(0);

    for (const { companyId } of [pausedCeo, terminatedCeo, archivedCompany]) {
      const routineCount = await db
        .select({ id: routines.id })
        .from(routines)
        .where(eq(routines.companyId, companyId))
        .then((rows) => rows.length);
      expect(routineCount).toBe(0);
    }
  });

  it("respects an existing archived routine as the opt-out (does not resurrect)", async () => {
    const { companyId, ceoId } = await seedCompanyWithCeo();
    await db.insert(routines).values({
      id: randomUUID(),
      companyId,
      title: STRATEGIC_REVIEW_TITLE,
      assigneeAgentId: ceoId,
      status: "archived",
      concurrencyPolicy: "skip_if_active",
      catchUpPolicy: "skip_missed",
      variables: [],
    });

    const director = ceoDirectorService(db, { heartbeat: noopHeartbeat() });
    const result = await director.reconcileCeoStrategicReviewRoutines(new Date());

    expect(result.created).toBe(0);
    expect(result.existing).toBe(1);
  });
});
