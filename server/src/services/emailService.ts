import { Resend } from "resend";
import { env } from "../utils/env";

// ──────────────────────────────────────────────────────────────────────
// 4 clientes Resend dedicados, uno por propósito
// ──────────────────────────────────────────────────────────────────────
const resendVerification = new Resend(env.resendKeyVerification);
const resendReset        = new Resend(env.resendKeyReset);
const resendReminders    = new Resend(env.resendKeyReminders);
const resendDocuments    = new Resend(env.resendKeyDocuments);
const resendAdminInvite  = new Resend(env.resendKeyAdminInvite);

const FROM = `Velum Laser <${env.resendFromEmail}>`;

// ── Retry helper — exponential backoff, max 3 attempts ─────────────────────
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

// ──────────────────────────────────────────────────────────────────────
// Utilidad de layout base
// ──────────────────────────────────────────────────────────────────────
// ── HTML escape — prevents injection in email templates ───────────────────────
function esc(str: string | undefined | null): string {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
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
          <!-- Header -->
          <tr>
            <td style="background:#1a1614;padding:28px 32px 24px;">
              <p style="margin:0;font-size:11px;font-weight:700;letter-spacing:0.18em;text-transform:uppercase;color:#c9b89a;">Velum Laser</p>
              <p style="margin:4px 0 0;font-size:10px;letter-spacing:0.1em;color:#7a6a58;">Tratamientos estéticos avanzados</p>
            </td>
          </tr>
          <!-- Content -->
          <tr>
            <td style="padding:32px;">
              ${content}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background:#f8f6f3;padding:20px 32px;border-top:1px solid #ede8e2;">
              <p style="margin:0;font-size:11px;color:#a89b8c;line-height:1.6;">
                Este mensaje fue generado automáticamente. Por favor no respondas a este correo.<br>
                © 2025 Velum Laser · Todos los derechos reservados.
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

// ──────────────────────────────────────────────────────────────────────
// Estilos reutilizables
// ──────────────────────────────────────────────────────────────────────
const btnStyle =
  "display:inline-block;background:#1a1614;color:#ffffff;padding:13px 28px;border-radius:8px;font-size:13px;font-weight:600;letter-spacing:0.06em;text-decoration:none;";
const otpBoxStyle =
  "display:inline-block;letter-spacing:0.32em;font-size:36px;font-weight:700;color:#1a1614;background:#f8f6f3;border:2px solid #e4dcd4;border-radius:12px;padding:16px 28px;font-family:'Courier New',monospace;";
const headingStyle = "margin:0 0 12px;font-size:22px;font-weight:700;color:#1a1614;line-height:1.3;";
const bodyStyle = "margin:0 0 20px;font-size:14px;color:#5a4e44;line-height:1.7;";
const noteStyle = "margin:20px 0 0;font-size:12px;color:#9b8d80;line-height:1.6;";

// ──────────────────────────────────────────────────────────────────────
// 1. Verificación de correo (API key 1)
// ──────────────────────────────────────────────────────────────────────
export const sendEmailVerificationEmail = async (to: string, otp: string): Promise<void> => {
  const html = baseHtml(`
    <p style="${headingStyle}">Confirma tu correo electrónico</p>
    <p style="${bodyStyle}">
      Bienvenida a Velum Laser. Para activar tu cuenta ingresa el siguiente código de verificación:
    </p>
    <div style="text-align:center;margin:28px 0;">
      <span style="${otpBoxStyle}">${otp}</span>
    </div>
    <p style="${bodyStyle}">
      Ingresa este código en la pantalla de verificación. Es válido por <strong>24 horas</strong>.
    </p>
    <p style="${noteStyle}">
      Si no creaste una cuenta en Velum Laser, ignora este mensaje y no se realizará ningún cambio en tu correo.
    </p>
  `);

  await withRetry(() => resendVerification.emails.send({
    from: FROM,
    to,
    subject: "Tu código de verificación — Velum Laser",
    html
  }));
};

// ──────────────────────────────────────────────────────────────────────
// 2. Recuperación de contraseña (API key 2)
// ──────────────────────────────────────────────────────────────────────
export const sendPasswordResetEmail = async (to: string, resetUrl: string): Promise<void> => {
  const html = baseHtml(`
    <p style="${headingStyle}">Restablecer contraseña</p>
    <p style="${bodyStyle}">
      Recibimos una solicitud para restablecer la contraseña de tu cuenta Velum Laser.<br>
      Haz clic en el botón de abajo para crear una nueva contraseña:
    </p>
    <div style="text-align:center;margin:32px 0;">
      <a href="${resetUrl}" style="${btnStyle}">Restablecer mi contraseña</a>
    </div>
    <p style="${bodyStyle}">
      Este enlace es válido por <strong>2 horas</strong> y solo funciona una vez.
    </p>
    <p style="${noteStyle}">
      Si no solicitaste este cambio, ignora este correo. Tu contraseña actual no se verá afectada.<br>
      Por seguridad, nunca compartas este enlace con nadie, incluyendo el personal de Velum Laser.
    </p>
  `);

  await withRetry(() => resendReset.emails.send({
    from: FROM,
    to,
    subject: "Restablece tu contraseña — Velum Laser",
    html
  }));
};

// ──────────────────────────────────────────────────────────────────────
// 3a. Recordatorio de cobro de membresía (API key 3)
// ──────────────────────────────────────────────────────────────────────
export const sendPaymentReminderEmail = async (
  to: string,
  params: {
    name: string;
    planName: string;
    amount: string;
    renewalDate: string;
    daysLeft: number;
  }
): Promise<void> => {
  const urgencyColor = params.daysLeft <= 1 ? "#c0392b" : "#b7860b";
  const urgencyBg    = params.daysLeft <= 1 ? "#fdf2f2" : "#fffbeb";
  const urgencyBorder= params.daysLeft <= 1 ? "#f5c6cb" : "#fde68a";
  const urgencyLabel = params.daysLeft <= 1 ? "¡Mañana se realiza el cobro!" : `Tu membresía se renueva en ${params.daysLeft} días`;

  const html = baseHtml(`
    <p style="${headingStyle}">Recordatorio de pago de membresía</p>
    <p style="${bodyStyle}">
      Hola <strong>${esc(params.name)}</strong>, te recordamos que tu membresía Velum Laser se renovará pronto.
    </p>
    <div style="background:${urgencyBg};border:1px solid ${urgencyBorder};border-radius:12px;padding:16px 20px;margin:20px 0;">
      <p style="margin:0;font-size:13px;font-weight:700;color:${urgencyColor};">${urgencyLabel}</p>
    </div>
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8f6f3;border-radius:12px;padding:20px;margin:20px 0;">
      <tr>
        <td style="padding:6px 0;">
          <p style="margin:0;font-size:12px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#9b8d80;">Plan</p>
          <p style="margin:2px 0 0;font-size:16px;font-weight:600;color:#1a1614;">${esc(params.planName)}</p>
        </td>
      </tr>
      <tr>
        <td style="padding:6px 0;">
          <p style="margin:0;font-size:12px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#9b8d80;">Monto a cobrar</p>
          <p style="margin:2px 0 0;font-size:16px;font-weight:600;color:#1a1614;">${esc(params.amount)}</p>
        </td>
      </tr>
      <tr>
        <td style="padding:6px 0;">
          <p style="margin:0;font-size:12px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#9b8d80;">Fecha de renovación</p>
          <p style="margin:2px 0 0;font-size:16px;font-weight:600;color:#1a1614;">${esc(params.renewalDate)}</p>
        </td>
      </tr>
    </table>
    <p style="${bodyStyle}">
      El cargo se realizará automáticamente al método de pago registrado. Si necesitas actualizar tu tarjeta o cancelar, puedes hacerlo desde tu portal de cliente.
    </p>
    <div style="text-align:center;margin:28px 0;">
      <a href="https://velumlaser.com/#/dashboard" style="${btnStyle}">Ir a mi cuenta</a>
    </div>
    <p style="${noteStyle}">
      Si tienes alguna pregunta sobre tu membresía, contáctanos directamente. No respondas a este correo automático.
    </p>
  `);

  await withRetry(() => resendReminders.emails.send({
    from: FROM,
    to,
    subject: `Recordatorio: tu membresía Velum se renueva el ${params.renewalDate}`,
    html,
  }));
};

// ──────────────────────────────────────────────────────────────────────
// 3b. Recordatorio de cita (API key 3)
// ──────────────────────────────────────────────────────────────────────
export const sendAppointmentReminderEmail = async (
  to: string,
  params: {
    name: string;
    date: string;
    time: string;
    treatment?: string;
    cabin?: string;
  }
): Promise<void> => {
  const html = baseHtml(`
    <p style="${headingStyle}">Recordatorio de cita</p>
    <p style="${bodyStyle}">
      Hola <strong>${esc(params.name)}</strong>, te recordamos que tienes una cita próxima en Velum Laser.
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8f6f3;border-radius:12px;padding:20px;margin:20px 0;">
      <tr>
        <td style="padding:6px 0;">
          <p style="margin:0;font-size:12px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#9b8d80;">Fecha</p>
          <p style="margin:2px 0 0;font-size:16px;font-weight:600;color:#1a1614;">${esc(params.date)}</p>
        </td>
      </tr>
      <tr>
        <td style="padding:6px 0;">
          <p style="margin:0;font-size:12px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#9b8d80;">Hora</p>
          <p style="margin:2px 0 0;font-size:16px;font-weight:600;color:#1a1614;">${esc(params.time)}</p>
        </td>
      </tr>
      ${params.treatment ? `
      <tr>
        <td style="padding:6px 0;">
          <p style="margin:0;font-size:12px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#9b8d80;">Tratamiento</p>
          <p style="margin:2px 0 0;font-size:16px;font-weight:600;color:#1a1614;">${esc(params.treatment)}</p>
        </td>
      </tr>` : ""}
    </table>
    <p style="${noteStyle}">
      Para cancelar o reprogramar tu cita, hazlo con al menos 24 horas de anticipación desde tu perfil en velumlaser.com.
    </p>
  `);

  await withRetry(() => resendReminders.emails.send({
    from: FROM,
    to,
    subject: `Recordatorio: tu cita es el ${params.date} — Velum Laser`,
    html
  }));
};

// ──────────────────────────────────────────────────────────────────────
// 3b. Confirmación de cita agendada (API key 3 — reminders)
// ──────────────────────────────────────────────────────────────────────
export const sendAppointmentBookingEmail = async (
  to: string,
  params: {
    name: string;
    date: string;
    time: string;
    treatment?: string;
    cabin?: string;
  }
): Promise<void> => {
  const html = baseHtml(`
    <p style="${headingStyle}">Tu cita está confirmada</p>
    <p style="${bodyStyle}">
      Hola <strong>${esc(params.name)}</strong>, tu cita en Velum Laser ha sido agendada exitosamente.
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8f6f3;border-radius:12px;padding:20px;margin:20px 0;">
      <tr>
        <td style="padding:6px 0;">
          <p style="margin:0;font-size:12px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#9b8d80;">Fecha</p>
          <p style="margin:2px 0 0;font-size:16px;font-weight:600;color:#1a1614;">${esc(params.date)}</p>
        </td>
      </tr>
      <tr>
        <td style="padding:6px 0;">
          <p style="margin:0;font-size:12px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#9b8d80;">Hora</p>
          <p style="margin:2px 0 0;font-size:16px;font-weight:600;color:#1a1614;">${esc(params.time)}</p>
        </td>
      </tr>
      ${params.treatment ? `
      <tr>
        <td style="padding:6px 0;">
          <p style="margin:0;font-size:12px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#9b8d80;">Tratamiento</p>
          <p style="margin:2px 0 0;font-size:16px;font-weight:600;color:#1a1614;">${esc(params.treatment)}</p>
        </td>
      </tr>` : ""}
      ${params.cabin ? `
      <tr>
        <td style="padding:6px 0;">
          <p style="margin:0;font-size:12px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#9b8d80;">Cabina</p>
          <p style="margin:2px 0 0;font-size:16px;font-weight:600;color:#1a1614;">${esc(params.cabin)}</p>
        </td>
      </tr>` : ""}
    </table>
    <p style="${noteStyle}">
      Puedes cancelar o reprogramar con al menos 24 horas de anticipación desde tu perfil en velumlaser.com.
    </p>
  `);

  await withRetry(() => resendReminders.emails.send({
    from: FROM,
    to,
    subject: `Tu cita en Velum Laser — ${params.date}`,
    html,
  }));
};

// ──────────────────────────────────────────────────────────────────────
// 3c. Cancelación de cita por la clínica (API key 3 — reminders)
// ──────────────────────────────────────────────────────────────────────
export const sendAppointmentCancellationEmail = async (
  to: string,
  params: {
    name: string;
    date: string;
    time: string;
    treatment?: string;
    reason?: string;
  }
): Promise<void> => {
  const html = baseHtml(`
    <p style="${headingStyle}">Tu cita ha sido cancelada</p>
    <p style="${bodyStyle}">
      Hola <strong>${esc(params.name)}</strong>, lamentamos informarte que tu cita en Velum Laser ha sido cancelada.
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8f6f3;border-radius:12px;padding:20px;margin:20px 0;">
      <tr>
        <td style="padding:6px 0;">
          <p style="margin:0;font-size:12px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#9b8d80;">Fecha</p>
          <p style="margin:2px 0 0;font-size:16px;font-weight:600;color:#1a1614;">${esc(params.date)}</p>
        </td>
      </tr>
      <tr>
        <td style="padding:6px 0;">
          <p style="margin:0;font-size:12px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#9b8d80;">Hora</p>
          <p style="margin:2px 0 0;font-size:16px;font-weight:600;color:#1a1614;">${esc(params.time)}</p>
        </td>
      </tr>
      ${params.treatment ? `
      <tr>
        <td style="padding:6px 0;">
          <p style="margin:0;font-size:12px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#9b8d80;">Tratamiento</p>
          <p style="margin:2px 0 0;font-size:16px;font-weight:600;color:#1a1614;">${esc(params.treatment)}</p>
        </td>
      </tr>` : ""}
      ${params.reason ? `
      <tr>
        <td style="padding:6px 0;">
          <p style="margin:0;font-size:12px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#9b8d80;">Motivo</p>
          <p style="margin:2px 0 0;font-size:14px;color:#5a4e44;">${esc(params.reason)}</p>
        </td>
      </tr>` : ""}
    </table>
    <p style="${bodyStyle}">
      Puedes agendar una nueva cita desde tu perfil en velumlaser.com. Si tienes dudas, contáctanos.
    </p>
  `);

  await withRetry(() => resendReminders.emails.send({
    from: FROM,
    to,
    subject: `Tu cita del ${params.date} fue cancelada — Velum Laser`,
    html,
  }));
};

// ──────────────────────────────────────────────────────────────────────
// 3d. OTP de autorización para eliminar paciente (API key 3 — reminders)
// ──────────────────────────────────────────────────────────────────────
export const sendDeleteUserOtpEmail = async (
  to: string,
  params: { adminEmail: string; targetEmail: string; otp: string }
): Promise<void> => {
  const html = baseHtml(`
    <p style="${headingStyle}">Autorización requerida — Eliminación de paciente</p>
    <p style="${bodyStyle}">
      Se ha solicitado la <strong>eliminación permanente</strong> del paciente
      <strong>${esc(params.targetEmail)}</strong> desde la cuenta administrativa
      <strong>${esc(params.adminEmail)}</strong>.
    </p>
    <p style="${bodyStyle}">
      Usa el siguiente código OTP para confirmar esta acción. Es válido por <strong>10 minutos</strong> y de un solo uso.
    </p>
    <div style="text-align:center;margin:28px 0;">
      <span style="${otpBoxStyle}">${params.otp}</span>
    </div>
    <p style="margin:0 0 20px;font-size:13px;color:#c0392b;font-weight:600;background:#fdf2f2;border:1px solid #f5c6cb;border-radius:8px;padding:12px 16px;">
      ⚠️ Esta acción eliminará de forma irreversible el perfil, expediente clínico, membresía, citas y pagos del paciente.
    </p>
    <p style="${noteStyle}">
      Si no solicitaste esta acción, ignora este correo. Nadie podrá eliminar al paciente sin este código.
    </p>
  `);

  await withRetry(() => resendReminders.emails.send({
    from: FROM,
    to,
    subject: `⚠️ Código de autorización: eliminar paciente — Velum Laser`,
    html
  }));
};

// ──────────────────────────────────────────────────────────────────────
// 3c. OTP de firma de consentimiento informado (API key 3)
// ──────────────────────────────────────────────────────────────────────
export const sendConsentOtpEmail = async (
  to: string,
  params: { name: string; otp: string }
): Promise<void> => {
  const html = baseHtml(`
    <p style="${headingStyle}">Firma de Consentimiento Informado</p>
    <p style="${bodyStyle}">
      Hola <strong>${esc(params.name)}</strong>, para completar la firma digital de tu
      <strong>Consentimiento Informado para Depilación Láser</strong>,
      ingresa el siguiente código de verificación:
    </p>
    <div style="text-align:center;margin:28px 0;">
      <span style="${otpBoxStyle}">${params.otp}</span>
    </div>
    <p style="${bodyStyle}">
      Este código es válido por <strong>1 hora</strong> y de un solo uso.
      Al ingresarlo confirmas que leíste y aceptas el consentimiento informado.
    </p>
    <p style="margin:0 0 20px;font-size:13px;color:#7a6050;background:#fdf8f4;border:1px solid #e8ddd3;border-radius:8px;padding:12px 16px;line-height:1.6;">
      Tu firma quedará registrada en tu expediente clínico junto con la fecha y hora exactas.
      Este consentimiento tiene plena validez legal conforme a la
      <strong>NOM-010-SSA4-2017</strong> y la <strong>Ley General de Salud</strong>.
    </p>
    <p style="${noteStyle}">
      Si no estás realizando este proceso, ignora este correo.
      Nadie de Velum Laser te pedirá este código por teléfono o WhatsApp.
    </p>
  `);

  await withRetry(() => resendReminders.emails.send({
    from: FROM,
    to,
    subject: "Código para firmar tu consentimiento informado — Velum Laser",
    html
  }));
};

// ──────────────────────────────────────────────────────────────────────
// 4. Notificación de firma de documento (API key 4)
// ──────────────────────────────────────────────────────────────────────
export const sendDocumentSignedEmail = async (
  to: string,
  params: {
    name: string;
    documentType: string;
    signedAt: string;
  }
): Promise<void> => {
  const html = baseHtml(`
    <p style="${headingStyle}">Documento firmado exitosamente</p>
    <p style="${bodyStyle}">
      Hola <strong>${esc(params.name)}</strong>, confirmamos que el siguiente documento ha sido firmado digitalmente:
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0faf4;border:1px solid #b7e4c7;border-radius:12px;padding:20px;margin:20px 0;">
      <tr>
        <td>
          <p style="margin:0;font-size:12px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#2d6a4f;">Documento</p>
          <p style="margin:4px 0 0;font-size:15px;font-weight:600;color:#1a1614;">${esc(params.documentType)}</p>
        </td>
      </tr>
      <tr>
        <td style="padding-top:12px;">
          <p style="margin:0;font-size:12px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#2d6a4f;">Fecha y hora de firma</p>
          <p style="margin:4px 0 0;font-size:15px;font-weight:600;color:#1a1614;">${esc(params.signedAt)}</p>
        </td>
      </tr>
    </table>
    <p style="${bodyStyle}">
      Este documento queda registrado en tu expediente clínico digital en Velum Laser.
      Puedes descargarlo desde tu perfil en cualquier momento.
    </p>
    <p style="${noteStyle}">
      Si no realizaste esta firma, contacta a nuestro equipo de inmediato.
    </p>
  `);

  await withRetry(() => resendDocuments.emails.send({
    from: FROM,
    to,
    subject: "Documento firmado — Velum Laser",
    html
  }));
};

// ──────────────────────────────────────────────────────────────────────
// 5. Invitación de administrador — credenciales de acceso inicial
// ──────────────────────────────────────────────────────────────────────
export const sendAdminInvitationEmail = async (
  to: string,
  params: {
    invitedBy: string;
    role: string;
    tempPassword: string;
  }
): Promise<void> => {
  const roleLabel = params.role === "admin" ? "Administrador" : "Staff";
  const html = baseHtml(`
    <p style="${headingStyle}">Bienvenido al panel de Velum Laser</p>
    <p style="${bodyStyle}">
      <strong>${esc(params.invitedBy)}</strong> te ha agregado al panel de administración de
      <strong>Velum Laser</strong> con el rol de <strong>${roleLabel}</strong>.
    </p>
    <p style="${bodyStyle}">
      Usa las siguientes credenciales para iniciar sesión. Al ingresar por primera vez,
      el sistema te pedirá establecer tu contraseña definitiva.
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8f6f3;border-radius:12px;padding:20px;margin:20px 0;">
      <tr>
        <td style="padding:8px 0;">
          <p style="margin:0;font-size:11px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:#9b8d80;">Correo electrónico</p>
          <p style="margin:4px 0 0;font-size:15px;font-weight:600;color:#1a1614;font-family:'Courier New',monospace;">${to}</p>
        </td>
      </tr>
      <tr>
        <td style="padding:8px 0;border-top:1px solid #ede8e2;">
          <p style="margin:0;font-size:11px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:#9b8d80;">Contraseña temporal</p>
          <p style="margin:4px 0 0;font-size:15px;font-weight:700;color:#1a1614;font-family:'Courier New',monospace;letter-spacing:0.12em;">${params.tempPassword}</p>
        </td>
      </tr>
    </table>
    <div style="text-align:center;margin:28px 0;">
      <a href="https://velumlaser.com/#/admin" style="${btnStyle}">Acceder al panel</a>
    </div>
    <p style="margin:0 0 20px;font-size:13px;color:#7a6050;background:#fdf8f4;border:1px solid #e8ddd3;border-radius:8px;padding:12px 16px;line-height:1.6;">
      <strong>Importante:</strong> Al iniciar sesión por primera vez deberás establecer tu propia contraseña.
      Esta contraseña temporal es de un solo uso. No la compartas con nadie.
    </p>
    <p style="${noteStyle}">
      Si no esperabas este mensaje, contáctanos en <strong>velum.contacto@gmail.com</strong>.
    </p>
  `);

  await withRetry(() => resendAdminInvite.emails.send({
    from: FROM,
    to,
    subject: `Acceso a Velum Admin — Tus credenciales de ingreso`,
    html
  }));
};

// ──────────────────────────────────────────────────────────────────────
// 6. Bienvenida a paciente — credenciales de acceso creadas por admin
// ──────────────────────────────────────────────────────────────────────
export const sendPatientWelcomeEmail = async (
  to: string,
  params: {
    name: string;
    tempPassword: string;
    planName?: string;
    createdBy: string;
  }
): Promise<void> => {
  const html = baseHtml(`
    <p style="${headingStyle}">Bienvenida a Velum Laser</p>
    <p style="${bodyStyle}">
      Hola <strong>${esc(params.name)}</strong>, el equipo de <strong>Velum Laser</strong>
      ha creado tu cuenta y tu expediente clínico digital.
      ${params.createdBy ? `Tu expediente fue preparado por <strong>${esc(params.createdBy)}</strong>.` : ''}
    </p>
    ${params.planName ? `
    <div style="background:#f0faf4;border:1px solid #b7e4c7;border-radius:12px;padding:16px 20px;margin:20px 0;">
      <p style="margin:0;font-size:11px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:#2d6a4f;">Plan activado</p>
      <p style="margin:4px 0 0;font-size:17px;font-weight:700;color:#1a1614;">${esc(params.planName)}</p>
    </div>` : ''}
    <p style="${bodyStyle}">Usa las siguientes credenciales para acceder a tu cuenta:</p>
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8f6f3;border-radius:12px;padding:20px;margin:20px 0;">
      <tr>
        <td style="padding:8px 0;">
          <p style="margin:0;font-size:11px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:#9b8d80;">Correo electrónico</p>
          <p style="margin:4px 0 0;font-size:15px;font-weight:600;color:#1a1614;font-family:'Courier New',monospace;">${to}</p>
        </td>
      </tr>
      <tr>
        <td style="padding:8px 0;border-top:1px solid #ede8e2;">
          <p style="margin:0;font-size:11px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:#9b8d80;">Contraseña temporal</p>
          <p style="margin:4px 0 0;font-size:15px;font-weight:700;color:#1a1614;font-family:'Courier New',monospace;letter-spacing:0.12em;">${params.tempPassword}</p>
        </td>
      </tr>
    </table>
    <div style="text-align:center;margin:28px 0;">
      <a href="https://velumlaser.com/#/agenda" style="${btnStyle}">Acceder a mi cuenta</a>
    </div>
    <p style="margin:0 0 20px;font-size:13px;color:#7a6050;background:#fdf8f4;border:1px solid #e8ddd3;border-radius:8px;padding:12px 16px;line-height:1.6;">
      <strong>Importante:</strong> Al iniciar sesión por primera vez se te pedirá establecer tu contraseña definitiva.
      Guarda este mensaje en un lugar seguro.
    </p>
    <p style="${noteStyle}">
      Si tienes dudas, contáctanos en <strong>velum.contacto@gmail.com</strong> o al <strong>+52 614 598 8130</strong>.
    </p>
  `);

  await withRetry(() => resendAdminInvite.emails.send({
    from: FROM,
    to,
    subject: `Bienvenida a Velum Laser — Tu cuenta está lista`,
    html
  }));
};

// ──────────────────────────────────────────────────────────────────────
// 6. Cobro personalizado con OTP de autorización (API key 3)
// ──────────────────────────────────────────────────────────────────────
export const sendCustomChargeOtpEmail = async (
  to: string,
  params: {
    name: string;
    otp: string;
    chargeId: string;
    title: string;
    description?: string;
    amountFormatted: string;
    type: "ONE_TIME" | "RECURRING";
    intervalLabel?: string;
    appBaseUrl: string;
  }
): Promise<void> => {
  const chargeUrl = `${params.appBaseUrl}/#/custom-charge/${params.chargeId}`;
  const typeLabel = params.type === "RECURRING"
    ? `Cobro recurrente${params.intervalLabel ? ` — ${params.intervalLabel}` : ""}`
    : "Pago único";

  const html = baseHtml(`
    <p style="${headingStyle}">Autorización de cobro personalizado</p>
    <p style="${bodyStyle}">
      Hola <strong>${esc(params.name)}</strong>, el equipo de Velum Laser ha preparado un cobro personalizado para ti.
      Revisa los detalles y autorízalo con tu código de verificación.
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8f6f3;border-radius:12px;padding:20px;margin:20px 0;">
      <tr>
        <td style="padding:6px 0;border-bottom:1px solid #ede8e2;">
          <p style="margin:0;font-size:11px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#9b8d80;">Concepto</p>
          <p style="margin:4px 0 0;font-size:16px;font-weight:600;color:#1a1614;">${esc(params.title)}</p>
          ${params.description ? `<p style="margin:4px 0 0;font-size:13px;color:#6b5e53;">${esc(params.description)}</p>` : ""}
        </td>
      </tr>
      <tr>
        <td style="padding:6px 0;border-bottom:1px solid #ede8e2;">
          <p style="margin:0;font-size:11px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#9b8d80;">Monto</p>
          <p style="margin:4px 0 0;font-size:22px;font-weight:700;color:#1a1614;">${esc(params.amountFormatted)}</p>
        </td>
      </tr>
      <tr>
        <td style="padding:6px 0;">
          <p style="margin:0;font-size:11px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#9b8d80;">Tipo</p>
          <p style="margin:4px 0 0;font-size:14px;color:#1a1614;">${typeLabel}</p>
        </td>
      </tr>
    </table>
    <p style="${bodyStyle}">
      Para autorizar este cobro, ingresa el siguiente código de verificación en la página de pago:
    </p>
    <div style="text-align:center;margin:28px 0;">
      <span style="${otpBoxStyle}">${params.otp}</span>
    </div>
    <div style="text-align:center;margin:24px 0;">
      <a href="${chargeUrl}" style="${btnStyle}">Ir a la página de pago</a>
    </div>
    <p style="${noteStyle}">
      Este código es válido por <strong>24 horas</strong> y es de un solo uso.<br>
      Si no esperabas este cobro, ignora este correo o contáctanos.
    </p>
  `);

  await withRetry(() => resendReminders.emails.send({
    from: FROM,
    to,
    subject: `Autoriza tu cobro personalizado — Velum Laser`,
    html
  }));
};
