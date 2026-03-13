import { Resend } from "resend";

// ──────────────────────────────────────────────────────────────────────
// 4 clientes Resend dedicados, uno por propósito
// ──────────────────────────────────────────────────────────────────────
const resendVerification = new Resend(process.env.RESEND_KEY_VERIFICATION ?? "");
const resendReset        = new Resend(process.env.RESEND_KEY_RESET        ?? "");
const resendReminders    = new Resend(process.env.RESEND_KEY_REMINDERS    ?? "");
const resendDocuments    = new Resend(process.env.RESEND_KEY_DOCUMENTS    ?? "");

const FROM = `Velum Laser <${process.env.RESEND_FROM_EMAIL ?? "noreply@velumlaser.com"}>`;

// ──────────────────────────────────────────────────────────────────────
// Utilidad de layout base
// ──────────────────────────────────────────────────────────────────────
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

  await resendVerification.emails.send({
    from: FROM,
    to,
    subject: "Tu código de verificación — Velum Laser",
    html
  });
};

// ──────────────────────────────────────────────────────────────────────
// 2. Recuperación de contraseña (API key 2)
// ──────────────────────────────────────────────────────────────────────
export const sendPasswordResetEmail = async (to: string, otp: string): Promise<void> => {
  const html = baseHtml(`
    <p style="${headingStyle}">Restablecer contraseña</p>
    <p style="${bodyStyle}">
      Recibimos una solicitud para restablecer la contraseña de tu cuenta Velum Laser.<br>
      Ingresa el siguiente código para continuar:
    </p>
    <div style="text-align:center;margin:28px 0;">
      <span style="${otpBoxStyle}">${otp}</span>
    </div>
    <p style="${bodyStyle}">
      Este código es válido por <strong>2 horas</strong>. Solo funciona una vez.
    </p>
    <p style="${noteStyle}">
      Si no solicitaste este cambio, ignora este correo. Tu contraseña actual no se verá afectada.<br>
      Por seguridad, nunca compartas este código con nadie, incluyendo el personal de Velum Laser.
    </p>
  `);

  await resendReset.emails.send({
    from: FROM,
    to,
    subject: "Código para restablecer contraseña — Velum Laser",
    html
  });
};

// ──────────────────────────────────────────────────────────────────────
// 3. Recordatorio de cita (API key 3)
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
      Hola <strong>${params.name}</strong>, te recordamos que tienes una cita próxima en Velum Laser.
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8f6f3;border-radius:12px;padding:20px;margin:20px 0;">
      <tr>
        <td style="padding:6px 0;">
          <p style="margin:0;font-size:12px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#9b8d80;">Fecha</p>
          <p style="margin:2px 0 0;font-size:16px;font-weight:600;color:#1a1614;">${params.date}</p>
        </td>
      </tr>
      <tr>
        <td style="padding:6px 0;">
          <p style="margin:0;font-size:12px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#9b8d80;">Hora</p>
          <p style="margin:2px 0 0;font-size:16px;font-weight:600;color:#1a1614;">${params.time}</p>
        </td>
      </tr>
      ${params.treatment ? `
      <tr>
        <td style="padding:6px 0;">
          <p style="margin:0;font-size:12px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#9b8d80;">Tratamiento</p>
          <p style="margin:2px 0 0;font-size:16px;font-weight:600;color:#1a1614;">${params.treatment}</p>
        </td>
      </tr>` : ""}
    </table>
    <p style="${noteStyle}">
      Para cancelar o reprogramar tu cita, hazlo con al menos 24 horas de anticipación desde tu perfil en velumlaser.com.
    </p>
  `);

  await resendReminders.emails.send({
    from: FROM,
    to,
    subject: `Recordatorio: tu cita es el ${params.date} — Velum Laser`,
    html
  });
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
      Hola <strong>${params.name}</strong>, confirmamos que el siguiente documento ha sido firmado digitalmente:
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0faf4;border:1px solid #b7e4c7;border-radius:12px;padding:20px;margin:20px 0;">
      <tr>
        <td>
          <p style="margin:0;font-size:12px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#2d6a4f;">Documento</p>
          <p style="margin:4px 0 0;font-size:15px;font-weight:600;color:#1a1614;">${params.documentType}</p>
        </td>
      </tr>
      <tr>
        <td style="padding-top:12px;">
          <p style="margin:0;font-size:12px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#2d6a4f;">Fecha y hora de firma</p>
          <p style="margin:4px 0 0;font-size:15px;font-weight:600;color:#1a1614;">${params.signedAt}</p>
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

  await resendDocuments.emails.send({
    from: FROM,
    to,
    subject: "Documento firmado — Velum Laser",
    html
  });
};
