import type { Db } from "@paperclipai/db";
import { authUsers, companies } from "@paperclipai/db";
import { eq } from "drizzle-orm";

type WelcomeEmailInput = {
  email: string;
  name?: string | null;
  companyName?: string | null;
  role?: string | null;
};

type PatraConfig = {
  url: string;
  user: string;
  password: string;
  templateId: number;
  landingUrl: string;
};

function readPatraConfig(): PatraConfig | null {
  const user = process.env.PATRA_API_USER?.trim();
  const password = process.env.PATRA_API_PASSWORD;
  const templateId = Number(process.env.PATRA_WELCOME_TEMPLATE_ID);
  if (!user || !password || !Number.isFinite(templateId) || templateId <= 0) return null;
  const url = (process.env.PATRA_API_URL?.trim() || "https://omnipost.appzenowebservices.com").replace(/\/+$/, "");
  const landingUrl = (process.env.PAPERCLIP_PUBLIC_URL?.trim() || url).replace(/\/+$/, "");
  return { url, user, password, templateId, landingUrl };
}

export function isWelcomeEmailConfigured(): boolean {
  return readPatraConfig() !== null;
}

/**
 * Sends the "you now have access" email through Patra's transactional API.
 * Best-effort: returns false and logs instead of throwing, so granting access
 * never fails because the mail service is down.
 */
export async function sendWelcomeEmail(
  input: WelcomeEmailInput,
  logger: { warn: (obj: unknown, msg: string) => void; info: (obj: unknown, msg: string) => void },
): Promise<boolean> {
  const config = readPatraConfig();
  if (!config) return false;
  if (!input.email.trim()) return false;

  const auth = Buffer.from(`${config.user}:${config.password}`).toString("base64");
  try {
    const response = await fetch(`${config.url}/api/tx`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        subscriber_mode: "external",
        subscriber_emails: [input.email.trim()],
        template_id: config.templateId,
        content_type: "html",
        data: {
          name: input.name?.trim() || input.email.split("@")[0],
          email: input.email.trim(),
          company_name: input.companyName?.trim() || "your workspace",
          role: input.role ?? "member",
          login_url: `${config.landingUrl}/`,
        },
      }),
    });
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      logger.warn(
        { status: response.status, body: body.slice(0, 300) },
        "Welcome email failed via Patra",
      );
      return false;
    }
    logger.info({ email: input.email }, "Welcome email sent via Patra");
    return true;
  } catch (err) {
    logger.warn({ err }, "Welcome email request to Patra failed");
    return false;
  }
}

/**
 * Loads the recipient + company and sends the welcome email. Fire-and-forget
 * callers should still handle the returned promise.
 */
export async function sendCompanyAccessWelcomeEmail(
  db: Db,
  input: { userId: string; companyId: string },
  logger: { warn: (obj: unknown, msg: string) => void; info: (obj: unknown, msg: string) => void },
): Promise<boolean> {
  if (!isWelcomeEmailConfigured()) return false;
  const [user, company] = await Promise.all([
    db
      .select({ email: authUsers.email, name: authUsers.name })
      .from(authUsers)
      .where(eq(authUsers.id, input.userId))
      .then((rows) => rows[0] ?? null),
    db
      .select({ name: companies.name })
      .from(companies)
      .where(eq(companies.id, input.companyId))
      .then((rows) => rows[0] ?? null),
  ]);
  if (!user?.email) return false;
  return sendWelcomeEmail(
    {
      email: user.email,
      name: user.name,
      companyName: company?.name ?? null,
    },
    logger,
  );
}
