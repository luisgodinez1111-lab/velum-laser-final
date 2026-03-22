import { Prisma } from "@prisma/client";
import { prisma } from "../db/prisma";
import { logger } from "../utils/logger";
import { sendNotificationEmail, sendAdminNotificationEmail } from "./notificationEmailService";

export type NotificationType =
  | "custom_charge_created"
  | "custom_charge_accepted"
  | "custom_charge_paid"
  | "appointment_deposit_paid"
  | "membership_activated"
  | "membership_renewed"
  | "new_member";

export interface CreateNotificationParams {
  userId: string;
  type: NotificationType;
  title: string;
  body?: string;
  data?: Record<string, unknown> | null;
}

// ── Create a single in-app notification ──────────────────────────────
export const createNotification = async (params: CreateNotificationParams) => {
  try {
    return await prisma.notification.create({
      data: {
        userId: params.userId,
        type: params.type,
        title: params.title,
        body: params.body,
        data: (params.data ?? {}) as Prisma.InputJsonValue,
      },
    });
  } catch (err) {
    logger.error({ err, params }, "[notifications] Failed to create notification");
    return null;
  }
};

// ── Broadcast in-app notification to all admin/staff users ───────────
export const notifyAdmins = async (
  type: NotificationType,
  title: string,
  body?: string,
  data?: Record<string, unknown>
) => {
  try {
    const admins = await prisma.user.findMany({
      where: { role: { in: ["admin", "staff", "system"] }, isActive: true },
      select: { id: true },
    });
    if (admins.length === 0) return;
    await prisma.notification.createMany({
      data: admins.map((a) => ({
        userId: a.id,
        type,
        title,
        body,
        data: (data ?? {}) as Prisma.InputJsonValue,
      })),
    });
  } catch (err) {
    logger.error({ err }, "[notifications] Failed to notify admins");
  }
};

// ── List notifications for a user (newest first, paginated) ──────────
export const listNotifications = async (userId: string, limit = 30, skip = 0) => {
  const [items, total, unread] = await Promise.all([
    prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: limit,
      skip,
    }),
    prisma.notification.count({ where: { userId } }),
    prisma.notification.count({ where: { userId, read: false } }),
  ]);
  return { items, total, unread };
};

// ── Count unread (fast, for badge) ───────────────────────────────────
export const countUnread = async (userId: string) =>
  prisma.notification.count({ where: { userId, read: false } });

// ── Mark one as read ─────────────────────────────────────────────────
export const markRead = async (id: string, userId: string) => {
  const n = await prisma.notification.findFirst({ where: { id, userId } });
  if (!n) return null;
  if (n.read) return n;
  return prisma.notification.update({
    where: { id },
    data: { read: true, readAt: new Date() },
  });
};

// ── Mark all as read ─────────────────────────────────────────────────
export const markAllRead = async (userId: string) =>
  prisma.notification.updateMany({
    where: { userId, read: false },
    data: { read: true, readAt: new Date() },
  });

// ─────────────────────────────────────────────────────────────────────
// High-level event helpers (in-app + email)
// ─────────────────────────────────────────────────────────────────────

/** Admin creates a custom charge → notify the target user (in-app + email) */
export const onCustomChargeCreated = async (params: {
  userId: string;
  userEmail: string;
  userName: string;
  chargeId: string;
  chargeTitle: string;
  amountFormatted: string;
}) => {
  await createNotification({
    userId: params.userId,
    type: "custom_charge_created",
    title: "Nuevo cobro personalizado pendiente",
    body: `${params.chargeTitle} · ${params.amountFormatted}`,
    data: { chargeId: params.chargeId },
  });

  sendNotificationEmail(params.userEmail, {
    name: params.userName,
    subject: "Tienes un nuevo cobro personalizado — Velum Laser",
    title: "Nuevo cobro personalizado",
    body: `El equipo de Velum Laser ha generado un cobro de <strong>${params.amountFormatted}</strong> por concepto de <strong>${params.chargeTitle}</strong>.`,
    ctaLabel: "Ver cobro y autorizar",
    ctaUrl: `${process.env.STRIPE_CHECKOUT_BASE_URL ?? ""}/#/custom-charge/${params.chargeId}`,
  }).catch((err) => logger.error({ err }, "[notifications] email custom_charge_created failed"));
};

/** User verifies OTP (accepts charge) → notify admins (in-app only) */
export const onCustomChargeAccepted = async (params: {
  chargeId: string;
  chargeTitle: string;
  amountFormatted: string;
  clientName: string;
}) => {
  await notifyAdmins(
    "custom_charge_accepted",
    `Cliente aceptó cobro: ${params.chargeTitle}`,
    `${params.clientName} autorizó el cobro de ${params.amountFormatted}. Pendiente de pago en Stripe.`,
    { chargeId: params.chargeId }
  );
};

/** Stripe checkout paid → notify user + admins (in-app + email) */
export const onCustomChargePaid = async (params: {
  userId: string;
  userEmail: string;
  userName: string;
  chargeId: string;
  chargeTitle: string;
  amountFormatted: string;
}) => {
  // User in-app
  await createNotification({
    userId: params.userId,
    type: "custom_charge_paid",
    title: "Pago confirmado",
    body: `Tu pago de ${params.amountFormatted} por "${params.chargeTitle}" fue procesado exitosamente.`,
    data: { chargeId: params.chargeId },
  });

  // User email
  sendNotificationEmail(params.userEmail, {
    name: params.userName,
    subject: "Confirmación de pago — Velum Laser",
    title: "¡Pago confirmado!",
    body: `Tu pago de <strong>${params.amountFormatted}</strong> por concepto de <strong>${params.chargeTitle}</strong> fue procesado exitosamente. El equipo de Velum Laser ya recibió la confirmación.`,
    ctaLabel: "Ir a mi cuenta",
    ctaUrl: `${process.env.STRIPE_CHECKOUT_BASE_URL ?? ""}/#/`,
  }).catch((err) => logger.error({ err }, "[notifications] email custom_charge_paid (user) failed"));

  // Admin in-app + email
  await notifyAdmins(
    "custom_charge_paid",
    `Pago recibido: ${params.chargeTitle}`,
    `${params.userName} pagó ${params.amountFormatted}.`,
    { chargeId: params.chargeId, userId: params.userId }
  );

  sendAdminNotificationEmail({
    subject: `Pago recibido: ${params.chargeTitle}`,
    title: "Nuevo pago recibido",
    body: `<strong>${params.userName}</strong> (${params.userEmail}) ha pagado el cobro personalizado <strong>${params.chargeTitle}</strong> por <strong>${params.amountFormatted}</strong>.`,
  }).catch((err) => logger.error({ err }, "[notifications] email custom_charge_paid (admin) failed"));
};

/** Appointment deposit paid → notify admins (in-app + email) */
export const onAppointmentDepositPaid = async (params: {
  userId: string;
  userEmail: string;
  userName: string;
  startAt: string;
}) => {
  const dateLabel = new Date(params.startAt).toLocaleString("es-MX", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Chihuahua",
  });

  await notifyAdmins(
    "appointment_deposit_paid",
    `Nuevo depósito de cita: ${params.userName}`,
    `Cita agendada para ${dateLabel}.`,
    { userId: params.userId }
  );

  sendAdminNotificationEmail({
    subject: `Nuevo depósito de cita — ${params.userName}`,
    title: "Depósito de cita recibido",
    body: `<strong>${params.userName}</strong> (${params.userEmail}) pagó su depósito para una cita el <strong>${dateLabel}</strong>.`,
  }).catch((err) => logger.error({ err }, "[notifications] email appointment_deposit_paid (admin) failed"));
};

/** New member registered (public or created by admin) → notify admins */
export const onNewMember = async (params: {
  userId: string;
  userEmail: string;
  userName: string;
}) => {
  await notifyAdmins(
    "new_member",
    `Nuevo paciente: ${params.userName}`,
    `${params.userEmail} se registró en la plataforma.`,
    { userId: params.userId }
  );

  sendAdminNotificationEmail({
    subject: `Nuevo paciente registrado: ${params.userName}`,
    title: "Nuevo paciente registrado",
    body: `<strong>${params.userName}</strong> (${params.userEmail}) acaba de registrarse en la plataforma de Velum Laser.`,
  }).catch((err) => logger.error({ err }, "[notifications] email new_member (admin) failed"));
};

/** Membership activated (checkout or invoice) → notify user + admins */
export const onMembershipActivated = async (params: {
  userId: string;
  userEmail: string;
  userName: string;
  planCode?: string | null;
  isRenewal?: boolean;
}) => {
  const type: NotificationType = params.isRenewal ? "membership_renewed" : "membership_activated";
  const userTitle = params.isRenewal ? "Tu membresía se renovó" : "¡Tu membresía está activa!";
  const adminTitle = params.isRenewal
    ? `Membresía renovada: ${params.userName}`
    : `Nueva membresía activada: ${params.userName}`;

  // User in-app
  await createNotification({
    userId: params.userId,
    type,
    title: userTitle,
    body: params.planCode ? `Plan: ${params.planCode}` : undefined,
    data: { planCode: params.planCode },
  });

  // User email (only on activation, not renewal — renewal is already handled by Stripe invoices)
  if (!params.isRenewal) {
    sendNotificationEmail(params.userEmail, {
      name: params.userName,
      subject: "Tu membresía en Velum Laser está activa",
      title: "¡Bienvenida a Velum Laser!",
      body: `Tu membresía${params.planCode ? ` <strong>${params.planCode}</strong>` : ""} ha sido activada exitosamente. Ya puedes disfrutar de todos tus beneficios.`,
      ctaLabel: "Ver mi membresía",
      ctaUrl: `${process.env.STRIPE_CHECKOUT_BASE_URL ?? ""}/#/memberships`,
    }).catch((err) => logger.error({ err }, "[notifications] email membership_activated (user) failed"));
  }

  // Admin in-app + email
  await notifyAdmins(type, adminTitle, `${params.userEmail}${params.planCode ? ` · Plan: ${params.planCode}` : ""}`, {
    userId: params.userId,
    planCode: params.planCode,
  });

  sendAdminNotificationEmail({
    subject: adminTitle,
    title: adminTitle,
    body: `<strong>${params.userName}</strong> (${params.userEmail}) ${params.isRenewal ? "renovó" : "activó"} su membresía${params.planCode ? ` con el plan <strong>${params.planCode}</strong>` : ""}.`,
  }).catch((err) => logger.error({ err }, "[notifications] email membership_activated (admin) failed"));
};
