import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import {
  authAccounts,
  authUsers,
  companies,
  companyMemberships,
  instanceUserRoles,
} from "@paperclipai/db";
import { ensureHumanRoleDefaultGrants } from "./principal-access-compatibility.js";

export const ENV_SUPERADMIN_MIN_PASSWORD_LENGTH = 8;

export type EnvSuperadminInput = {
  email: string | undefined;
  password: string | undefined;
  hashPassword: (password: string) => Promise<string>;
};

export type EnvSuperadminResult =
  | { enabled: false; reason: "not-configured" | "invalid"; message: string }
  | {
      enabled: true;
      userId: string;
      createdUser: boolean;
      adminGranted: boolean;
      companiesGranted: number;
    };

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

/**
 * Env-defined super-admin (SaaS operator login).
 *
 * When PAPERCLIP_SUPERADMIN_EMAIL/PASSWORD are set, the .env credentials are
 * the source of truth: the account is created on first boot when missing,
 * its credential password is re-synced on every boot (a .env password change
 * applies on restart without kicking existing sessions), and it holds
 * instance_admin plus owner membership in every company — mirroring what the
 * board-claim flow grants. Fully idempotent; unset both vars to disable.
 * Never logs or returns the password.
 */
export async function ensureEnvSuperadmin(
  db: Db,
  input: EnvSuperadminInput,
): Promise<EnvSuperadminResult> {
  const email = input.email?.trim().toLowerCase();
  const password = input.password;
  if (!email && !password) {
    return { enabled: false, reason: "not-configured", message: "super-admin env vars unset" };
  }
  if (!email || !isValidEmail(email)) {
    return {
      enabled: false,
      reason: "invalid",
      message: "PAPERCLIP_SUPERADMIN_EMAIL must be a valid email address",
    };
  }
  if (!password || password.length < ENV_SUPERADMIN_MIN_PASSWORD_LENGTH) {
    return {
      enabled: false,
      reason: "invalid",
      message: `PAPERCLIP_SUPERADMIN_PASSWORD must be at least ${ENV_SUPERADMIN_MIN_PASSWORD_LENGTH} characters`,
    };
  }

  const now = new Date();
  let user = await db
    .select({ id: authUsers.id })
    .from(authUsers)
    .where(eq(authUsers.email, email))
    .then((rows) => rows[0] ?? null);
  let createdUser = false;
  if (!user) {
    const id = randomUUID();
    await db.insert(authUsers).values({
      id,
      name: "Super Admin",
      email,
      emailVerified: true,
      createdAt: now,
      updatedAt: now,
    });
    user = { id };
    createdUser = true;
  }
  const userId = user.id;

  // Sync the credential password from env (source of truth). Existing
  // sessions are left alone — the new password applies to the next login.
  const passwordHash = await input.hashPassword(password);
  const existingAccount = await db
    .select({ id: authAccounts.id })
    .from(authAccounts)
    .where(and(eq(authAccounts.userId, userId), eq(authAccounts.providerId, "credential")))
    .then((rows) => rows[0] ?? null);
  if (!existingAccount) {
    await db.insert(authAccounts).values({
      id: randomUUID(),
      accountId: userId,
      providerId: "credential",
      userId,
      password: passwordHash,
      createdAt: now,
      updatedAt: now,
    });
  } else {
    await db
      .update(authAccounts)
      .set({ password: passwordHash, updatedAt: now })
      .where(eq(authAccounts.id, existingAccount.id));
  }

  let adminGranted = false;
  let companiesGranted = 0;
  await db.transaction(async (tx) => {
    const existingAdmin = await tx
      .select({ id: instanceUserRoles.id })
      .from(instanceUserRoles)
      .where(and(eq(instanceUserRoles.userId, userId), eq(instanceUserRoles.role, "instance_admin")))
      .then((rows) => rows[0] ?? null);
    if (!existingAdmin) {
      await tx.insert(instanceUserRoles).values({ userId, role: "instance_admin" });
      adminGranted = true;
    }

    const allCompanies = await tx.select({ id: companies.id }).from(companies);
    for (const company of allCompanies) {
      const existing = await tx
        .select({ id: companyMemberships.id, status: companyMemberships.status })
        .from(companyMemberships)
        .where(
          and(
            eq(companyMemberships.companyId, company.id),
            eq(companyMemberships.principalType, "user"),
            eq(companyMemberships.principalId, userId),
          ),
        )
        .then((rows) => rows[0] ?? null);
      if (!existing) {
        await tx.insert(companyMemberships).values({
          companyId: company.id,
          principalType: "user",
          principalId: userId,
          status: "active",
          membershipRole: "owner",
        });
        companiesGranted += 1;
        continue;
      }
      if (existing.status !== "active") {
        await tx
          .update(companyMemberships)
          .set({ status: "active", membershipRole: "owner", updatedAt: new Date() })
          .where(eq(companyMemberships.id, existing.id));
        companiesGranted += 1;
      }
    }
  });

  const grantedCompanyIds = await db
    .select({ companyId: companyMemberships.companyId })
    .from(companyMemberships)
    .where(
      and(
        eq(companyMemberships.principalType, "user"),
        eq(companyMemberships.principalId, userId),
        eq(companyMemberships.status, "active"),
      ),
    );
  for (const row of grantedCompanyIds) {
    await ensureHumanRoleDefaultGrants(db, {
      companyId: row.companyId,
      principalId: userId,
      membershipRole: "owner",
      grantedByUserId: userId,
    });
  }

  return { enabled: true, userId, createdUser, adminGranted, companiesGranted };
}
