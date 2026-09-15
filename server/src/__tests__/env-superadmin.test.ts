import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  authAccounts,
  authUsers,
  companies,
  companyMemberships,
  createDb,
  instanceUserRoles,
  principalPermissionGrants,
} from "@paperclipai/db";
import { ensureEnvSuperadmin } from "../services/env-superadmin.js";
import {
  getEmbeddedPostgresTestSupport,
  startEmbeddedPostgresTestDatabase,
} from "./helpers/embedded-postgres.js";

const embeddedPostgresSupport = await getEmbeddedPostgresTestSupport();
const describeEmbeddedPostgres = embeddedPostgresSupport.supported ? describe : describe.skip;

const hashPassword = async (password: string) => `scrypt-test-hash:${password}`;

describeEmbeddedPostgres("env super-admin", () => {
  let db!: ReturnType<typeof createDb>;
  let tempDb: Awaited<ReturnType<typeof startEmbeddedPostgresTestDatabase>> | null = null;

  beforeAll(async () => {
    tempDb = await startEmbeddedPostgresTestDatabase("env-superadmin-");
    db = createDb(tempDb.connectionString);
  }, 20_000);

  afterEach(async () => {
    await db.delete(principalPermissionGrants);
    await db.delete(companyMemberships);
    await db.delete(authAccounts);
    await db.delete(instanceUserRoles);
    await db.delete(companies);
    await db.delete(authUsers);
  });

  afterAll(async () => {
    await tempDb?.cleanup();
  });

  it("is disabled when env vars are unset", async () => {
    const result = await ensureEnvSuperadmin(db, {
      email: undefined,
      password: undefined,
      hashPassword,
    });
    expect(result).toEqual({
      enabled: false,
      reason: "not-configured",
      message: "super-admin env vars unset",
    });
  });

  it("rejects an invalid email or short password", async () => {
    const badEmail = await ensureEnvSuperadmin(db, {
      email: "not-an-email",
      password: "long-enough-password",
      hashPassword,
    });
    expect(badEmail.enabled).toBe(false);

    const shortPassword = await ensureEnvSuperadmin(db, {
      email: "admin@example.test",
      password: "short",
      hashPassword,
    });
    expect(shortPassword.enabled).toBe(false);

    const users = await db.select({ id: authUsers.id }).from(authUsers);
    expect(users).toEqual([]);
  });

  it("creates the user, credential, admin role, and owner memberships", async () => {
    const company = await db
      .insert(companies)
      .values({
        name: "Superadmin Co",
        issuePrefix: `SA${randomUUID().slice(0, 6).toUpperCase()}`,
      })
      .returning()
      .then((rows) => rows[0]!);

    const result = await ensureEnvSuperadmin(db, {
      email: "Admin@Example.test",
      password: "super-secret-password",
      hashPassword,
    });
    expect(result.enabled).toBe(true);
    if (!result.enabled) return;

    expect(result.createdUser).toBe(true);
    expect(result.adminGranted).toBe(true);
    expect(result.companiesGranted).toBe(1);

    // Email is normalized; credential stores the sync hash.
    const user = await db
      .select()
      .from(authUsers)
      .where(eq(authUsers.email, "admin@example.test"))
      .then((rows) => rows[0]!);
    expect(user.id).toBe(result.userId);
    expect(user.emailVerified).toBe(true);

    const account = await db
      .select()
      .from(authAccounts)
      .where(
        and(
          eq(authAccounts.userId, user.id),
          eq(authAccounts.providerId, "credential"),
        ),
      )
      .then((rows) => rows[0]!);
    expect(account.password).toBe("scrypt-test-hash:super-secret-password");

    const admin = await db
      .select()
      .from(instanceUserRoles)
      .where(
        and(
          eq(instanceUserRoles.userId, user.id),
          eq(instanceUserRoles.role, "instance_admin"),
        ),
      );
    expect(admin).toHaveLength(1);

    const membership = await db
      .select()
      .from(companyMemberships)
      .where(
        and(
          eq(companyMemberships.companyId, company.id),
          eq(companyMemberships.principalId, user.id),
        ),
      )
      .then((rows) => rows[0]!);
    expect(membership.status).toBe("active");
    expect(membership.membershipRole).toBe("owner");
  });

  it("is idempotent and syncs a changed password", async () => {
    const first = await ensureEnvSuperadmin(db, {
      email: "admin@example.test",
      password: "first-password",
      hashPassword,
    });
    expect(first.enabled).toBe(true);
    if (!first.enabled) return;

    const second = await ensureEnvSuperadmin(db, {
      email: "admin@example.test",
      password: "second-password",
      hashPassword,
    });
    expect(second).toMatchObject({
      enabled: true,
      userId: first.userId,
      createdUser: false,
      adminGranted: false,
      companiesGranted: 0,
    });

    const account = await db
      .select()
      .from(authAccounts)
      .where(eq(authAccounts.userId, first.userId))
      .then((rows) => rows[0]!);
    expect(account.password).toBe("scrypt-test-hash:second-password");

    const admins = await db
      .select()
      .from(instanceUserRoles)
      .where(eq(instanceUserRoles.userId, first.userId));
    expect(admins).toHaveLength(1);
  });
});
