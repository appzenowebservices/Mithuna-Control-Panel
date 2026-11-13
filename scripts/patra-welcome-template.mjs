/**
 * Creates/updates the transactional welcome template used by
 * server/src/services/welcome-email.ts.
 *
 * Usage (env must point at Patra):
 *   PATRA_API_URL=https://omnipost.appzenowebservices.com \
 *   PATRA_API_USER=... PATRA_API_PASSWORD=... \
 *   PAPERCLIP_PUBLIC_URL=https://agent-panel.appzenowebservices.com \
 *   node scripts/patra-welcome-template.mjs
 *
 * Prints the template id — set it as PATRA_WELCOME_TEMPLATE_ID.
 */
const TEMPLATE_NAME = "Mithuna — workspace access";
const url = (process.env.PATRA_API_URL || "https://omnipost.appzenowebservices.com").replace(/\/+$/, "");
const user = process.env.PATRA_API_USER?.trim();
const password = process.env.PATRA_API_PASSWORD;
const landing = (process.env.PAPERCLIP_PUBLIC_URL || "https://agent-panel.appzenowebservices.com").replace(/\/+$/, "");

if (!user || !password) {
  console.error("PATRA_API_USER and PATRA_API_PASSWORD are required");
  process.exit(1);
}

const auth = `Basic ${Buffer.from(`${user}:${password}`).toString("base64")}`;

async function api(path, init = {}) {
  const response = await fetch(`${url}${path}`, {
    ...init,
    headers: {
      Authorization: auth,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const text = await response.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = text;
  }
  if (!response.ok) {
    throw new Error(`${init.method ?? "GET"} ${path} → ${response.status}: ${text.slice(0, 300)}`);
  }
  return payload;
}

const body = `<!doctype html>
<html lang="en">
  <body style="margin:0;padding:0;background:#f7f2e7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#2e2a24;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f7f2e7;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fffdf8;border:1px solid #e4dccb;border-radius:16px;overflow:hidden;">
            <tr>
              <td style="padding:28px 32px 0 32px;">
                <div style="font-size:12px;font-weight:800;letter-spacing:0.18em;text-transform:uppercase;color:#b5451f;">Mithuna</div>
                <h1 style="margin:18px 0 0 0;font-size:26px;line-height:1.25;font-weight:800;color:#2e2a24;">
                  You&rsquo;re in, {{ .Tx.Data.name }}.
                </h1>
                <p style="margin:12px 0 0 0;font-size:15px;line-height:1.7;color:#6b6357;">
                  Your account now has access to <strong style="color:#2e2a24;">{{ .Tx.Data.company_name }}</strong> on Mithuna — the control plane where your AI agent team plans, executes, and reports back.
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:24px 32px 0 32px;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f7f2e7;border:1px solid #e4dccb;border-radius:12px;">
                  <tr>
                    <td style="padding:16px 18px;">
                      <div style="font-size:10px;font-weight:800;letter-spacing:0.16em;text-transform:uppercase;color:#6b6357;">Workspace</div>
                      <div style="margin-top:4px;font-size:16px;font-weight:700;color:#2e2a24;">{{ .Tx.Data.company_name }}</div>
                      <div style="margin-top:2px;font-size:12px;color:#6b6357;">Role: {{ .Tx.Data.role }} · {{ .Tx.Data.email }}</div>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td align="center" style="padding:28px 32px 8px 32px;">
                <a href="{{ .Tx.Data.login_url }}" style="display:inline-block;background:#b5451f;color:#fffdf8;text-decoration:none;font-size:15px;font-weight:700;padding:13px 28px;border-radius:10px;">
                  Open your workspace
                </a>
                <p style="margin:14px 0 0 0;font-size:12px;color:#6b6357;">
                  Sign in with this email address (Google or email/password).
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 32px 28px 32px;">
                <p style="margin:0;font-size:13px;line-height:1.7;color:#6b6357;">
                  Mithuna is invite-only: your workspace was created for you by the instance team. If you weren&rsquo;t expecting this, reply to this email and we&rsquo;ll sort it out.
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 32px;background:#f7f2e7;border-top:1px solid #e4dccb;">
                <p style="margin:0;font-size:11px;color:#6b6357;">© ${new Date().getFullYear()} Mithuna · Agent control plane</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

const subject = "You're in — {{ .Tx.Data.company_name }} on Mithuna";

const templates = await api("/api/templates");
const existing = (templates?.data ?? []).find((template) => template.name === TEMPLATE_NAME);

const payload = {
  name: TEMPLATE_NAME,
  type: "tx",
  subject,
  body,
};

if (existing) {
  await api(`/api/templates/${existing.id}`, { method: "PUT", body: JSON.stringify(payload) });
  console.log(`updated template id=${existing.id}`);
} else {
  const created = await api("/api/templates", { method: "POST", body: JSON.stringify(payload) });
  const createdTemplate = Array.isArray(created?.data) ? created.data[0] : created?.data;
  console.log(`created template id=${createdTemplate?.id}`);
  console.log(`Set PATRA_WELCOME_TEMPLATE_ID=${createdTemplate?.id}`);
}
console.log(`Landing URL in template: ${landing}/`);
