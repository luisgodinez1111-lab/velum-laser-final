import { Resend } from "resend";
import { logger } from "../utils/logger";

// Dedicated Resend client exclusively for in-app notifications
const resendNotifications = new Resend(process.env.RESEND_KEY_NOTIFICATIONS ?? "");

const FROM = `Velum Laser <${process.env.RESEND_FROM_EMAIL ?? "noreply@velumlaser.com"}>`;

async function withRetry<T>(fn: () => Promise<T>, attempts = 3, baseDelayMs = 500): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (i < attempts - 1) {
        await new Promise((r) => setTimeout(r, baseDelayMs * 2 ** i));
      }
    }
  }
  throw lastErr;
}

function baseHtml(content: string): string {
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Velum Laser</title>
</head>
<body style="margin:0;padding:0;background:#f8f6f3;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8f6f3;padding:40px 16px;">
    <tr>
      <td align="center">
        <table width="100%" style="max-width:520px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(84,69,56,0.10);">
          <tr>
            <td style="background:#1a1614;padding:28px 32px 24px;">
              <p style="margin:0;font-size:11px;font-weight:700;letter-spacing:0.18em;text-transform:uppercase;color:#c9b89a;">Velum Laser</p>
              <p style="margin:4px 0 0;font-size:10px;letter-spacing:0.1em;color:#7a6a58;">Tratamientos estéticos avanzados</p>
            </td>
          </tr>
          <tr>
            <td style="padding:32px;">
              ${content}
              <p style="margin:32px 0 0;font-size:11px;color:#b0a090;border-top:1px solid #ede8e2;padding-top:20px;">
                Este es un mensaje automático de Velum Laser. Si tienes dudas, contáctanos en <a href="mailto:velum.contacto@gmail.com" style="color:#8a7566;">velum.contacto@gmail.com</a>.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

const headingStyle = "margin:0 0 12px;font-size:22px;font-weight:700;color:#1a1614;line-height:1.3;";
const bodyStyle = "margin:0 0 16px;font-size:14px;color:#5a4d43;line-height:1.6;";
const btnStyle = "display:inline-block;background:#1a1614;color:#ffffff;text-decoration:none;padding:13px 28px;border-radius:10px;font-size:13px;font-weight:600;letter-spacing:0.05em;";

// ── Generic user-facing notification email ────────────────────────────
export const sendNotificationEmail = async (
  to: string,
  params: {
    name: string;
    subject: string;
    title: string;
    body: string;
    ctaLabel?: string;
    ctaUrl?: string;
  }
): Promise<void> => {
  const html = baseHtml(`
    <p style="${headingStyle}">${params.title}</p>
    <p style="${bodyStyle}">Hola <strong>${params.name}</strong>,</p>
    <p style="${bodyStyle}">${params.body}</p>
    ${params.ctaLabel && params.ctaUrl
      ? `<div style="text-align:center;margin:28px 0;">
           <a href="${params.ctaUrl}" style="${btnStyle}">${params.ctaLabel}</a>
         </div>`
      : ""}
  `);

  await withRetry(() =>
    resendNotifications.emails.send({ from: FROM, to, subject: params.subject, html })
  );
};

// ── Admin notification email ──────────────────────────────────────────
export const sendAdminNotificationEmail = async (params: {
  subject: string;
  title: string;
  body: string;
}): Promise<void> => {
  const adminEmail = process.env.ADMIN_NOTIFICATION_EMAIL;
  if (!adminEmail) {
    logger.warn("[notifications] ADMIN_NOTIFICATION_EMAIL not set — skipping admin email");
    return;
  }

  const html = baseHtml(`
    <p style="${headingStyle}">${params.title}</p>
    <p style="${bodyStyle}">${params.body}</p>
    <p style="margin:16px 0 0;font-size:12px;color:#9b8d80;background:#f8f6f3;padding:12px 16px;border-radius:8px;">
      Este aviso fue generado automáticamente por el sistema de Velum Laser.
    </p>
  `);

  await withRetry(() =>
    resendNotifications.emails.send({
      from: FROM,
      to: adminEmail,
      subject: `[Admin] ${params.subject}`,
      html,
    })
  );
};
