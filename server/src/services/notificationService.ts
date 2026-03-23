import type { Response } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "../db/prisma";
import { logger } from "../utils/logger";
import { env } from "../utils/env";
import { sendNotificationEmail, sendAdminNotificationEmail } from "./notificationEmailService";
import { sendAppointmentBookingEmail, sendAppointmentCancellationEmail } from "./emailService";
import { generateAppointmentConfirmToken } from "../utils/appointmentToken";

export type NotificationType =
  | "custom_charge_created"
  | "custom_charge_accepted"
  | "custom_charge_paid"
  | "appointment_booked"
  | "appointment_confirmed"
  | "appointment_cancelled"
  | "appointment_deposit_paid"
  | "membership_activated"
  | "membership_renewed"
  | "membership_past_due"
  | "membership_renewing_soon"
  | "new_member"
  | "intake_approved"
  | "intake_rejected"
  | "intake_submitted";

export interface CreateNotificationParams {
  userId: string;
  type: NotificationType;
  title: string;
  body?: string;
  data?: Record<string, unknown> | null;
}

// ── SSE broadcaster ───────────────────────────────────────────────────────────
// In-memory map: userId → Set of active SSE response streams
// NOTE: single-process only. For multi-instance deployments add Redis pub/sub.
const sseClients = new Map<string, Set<Response>>();
const MAX_SSE_PER_USER = 3; // prevent memory exhaustion from many open tabs
const SSE_MAX_SESSION_MS = 4 * 60 * 60 * 1000; // 4 h max lifetime — force reconnect

export const registerSseClient = (userId: string, res: Response): void => {
  if (!sseClients.has(userId)) sseClients.set(userId, new Set());
  const clients = sseClients.get(userId)!;

  // Evict oldest connection when limit is exceeded
  if (clients.size >= MAX_SSE_PER_USER) {
    const oldest = clients.values().next().value as Response | undefined;
    if (oldest) {
      try { oldest.end(); } catch { /* already closed */ }
      clients.delete(oldest);
    }
  }
  clients.add(res);

  // Force reconnect after max session lifetime to prevent zombie connections
  const maxSessionTimer = setTimeout(() => {
    try { res.end(); } catch { /* already closed */ }
    unregisterSseClient(userId, res);
  }, SSE_MAX_SESSION_MS);
  if (maxSessionTimer.unref) maxSessionTimer.unref();
};

export const unregisterSseClient = (userId: string, res: Response): void => {
  const clients = sseClients.get(userId);
  if (!clients) return;
  clients.delete(res);
  if (clients.size === 0) sseClients.delete(userId);
};

/** Returns the total number of active SSE connections across all users. */
export const getSseConnectionCount = (): number => {
  let total = 0;
  for (const clients of sseClients.values()) total += clients.size;
  return total;
};

const broadcastToUser = (userId: string, payload: unknown): void => {
  const clients = sseClients.get(userId);
  if (!clients || clients.size === 0) return;
  const data = `data: ${JSON.stringify(payload)}\n\n`;
  for (const res of clients) {
    try { res.write(data); } catch { clients.delete(res); }
  }
};

// ── Create a single in-app notification ──────────────────────────────
export const createNotification = async (params: CreateNotificationParams) => {
  try {
    const created = await prisma.notification.create({
      data: {
        userId: params.userId,
        type: params.type,
        title: params.title,
        body: params.body,
        data: (params.data ?? {}) as Prisma.InputJsonValue,
      },
    });
    // Push to connected SSE clients in real time
    broadcastToUser(params.userId, created);
    return created;
  } catch (err) {
    logger.error({ err, params }, "[notifications] Failed to create notification");
    return null;
  }
};

// ── Admin ID cache — avoids a DB query on every notification event ───
let adminIdCache: string[] | null = null;
let adminIdCacheAt = 0;
const ADMIN_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

const getAdminIds = async (): Promise<string[]> => {
  if (adminIdCache && Date.now() - adminIdCacheAt < ADMIN_CACHE_TTL_MS) {
    return adminIdCache;
  }
  const admins = await prisma.user.findMany({
    where: { role: { in: ["admin", "staff", "system"] }, isActive: true },
    select: { id: true },
  });
  adminIdCache = admins.map((a) => a.id);
  adminIdCacheAt = Date.now();
  return adminIdCache;
};

/** Call when an admin user is created, deactivated, or role-changed. */
export const invalidateAdminIdCache = (): void => { adminIdCache = null; };

// ── Broadcast in-app notification to all admin/staff users ───────────
export const notifyAdmins = async (
  type: NotificationType,
  title: string,
  body?: string,
  data?: Record<string, unknown>
) => {
  try {
    const adminIds = await getAdminIds();
    const admins = adminIds.map((id) => ({ id }));
    if (admins.length === 0) return;
    const rows = admins.map((a) => ({
      userId: a.id,
      type,
      title,
      body,
      data: (data ?? {}) as Prisma.InputJsonValue,
    }));
    await prisma.notification.createMany({ data: rows });
    // Push via SSE to each admin that has an active stream
    for (const row of rows) {
      broadcastToUser(row.userId, row);
    }
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
    ctaUrl: `${env.stripeCheckoutBaseUrl}/#/custom-charge/${params.chargeId}`,
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
    ctaUrl: `${env.stripeCheckoutBaseUrl}/#/`,
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

/** Appointment created → notify patient (in-app + email) + notify admins with 1-click confirm */
export const onAppointmentBooked = async (params: {
  appointmentId: string;
  userId: string;
  userEmail: string;
  userName: string;
  date: string;
  time: string;
  treatment?: string;
  cabin?: string;
}) => {
  await createNotification({
    userId: params.userId,
    type: "appointment_booked",
    title: "Cita agendada",
    body: `${params.date} a las ${params.time}${params.treatment ? ` · ${params.treatment}` : ""}`,
  });

  sendAppointmentBookingEmail(params.userEmail, {
    name: params.userName,
    date: params.date,
    time: params.time,
    treatment: params.treatment,
    cabin: params.cabin,
  }).catch((err) => logger.error({ err }, "[notifications] email appointment_booked failed"));

  // Notify admins (in-app + email with 1-click confirm link)
  await notifyAdmins(
    "appointment_booked",
    `Nueva cita: ${params.userName}`,
    `${params.date} a las ${params.time}${params.treatment ? ` · ${params.treatment}` : ""}`,
    { userId: params.userId, appointmentId: params.appointmentId }
  );

  const confirmToken = generateAppointmentConfirmToken(params.appointmentId);
  const confirmUrl = `${process.env.APP_URL ?? ""}/#/admin?section=agenda`;
  const directConfirmUrl = `${process.env.API_URL ?? ""}/api/v1/appointments/confirm?token=${confirmToken}`;

  sendAdminNotificationEmail({
    subject: `Nueva cita: ${params.userName} — ${params.date}`,
    title: "Nueva cita agendada",
    body: `<strong>${params.userName}</strong> (${params.userEmail}) agendó una cita para el <strong>${params.date}</strong> a las <strong>${params.time}</strong>${params.treatment ? ` · ${params.treatment}` : ""}${params.cabin ? ` · Cabina ${params.cabin}` : ""}.<br><br><a href="${directConfirmUrl}" style="display:inline-block;background:#1a1614;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold;">Confirmar cita (1 clic)</a>&nbsp;&nbsp;<a href="${confirmUrl}" style="color:#544538;">Ver en agenda</a>`,
  }).catch((err) => logger.error({ err }, "[notifications] email appointment_booked (admin) failed"));
};

/** Staff confirms appointment → notify patient (in-app only) */
export const onAppointmentConfirmed = async (params: {
  userId: string;
  date: string;
  time: string;
  treatment?: string;
}) => {
  await createNotification({
    userId: params.userId,
    type: "appointment_confirmed",
    title: "Tu cita fue confirmada",
    body: `${params.date} a las ${params.time}${params.treatment ? ` · ${params.treatment}` : ""}`,
  });
};

/** Clinic cancels patient's appointment → notify patient (in-app + email) */
export const onAppointmentCancelledByClinic = async (params: {
  userId: string;
  userEmail: string;
  userName: string;
  date: string;
  time: string;
  treatment?: string;
  reason?: string;
}) => {
  await createNotification({
    userId: params.userId,
    type: "appointment_cancelled",
    title: "Tu cita fue cancelada",
    body: `${params.date} a las ${params.time}${params.treatment ? ` · ${params.treatment}` : ""}`,
  });

  sendAppointmentCancellationEmail(params.userEmail, {
    name: params.userName,
    date: params.date,
    time: params.time,
    treatment: params.treatment,
    reason: params.reason,
  }).catch((err) => logger.error({ err }, "[notifications] email appointment_cancelled failed"));
};

/** Patient cancels their own appointment → notify admins (in-app + email) */
export const onAppointmentCancelledByPatient = async (params: {
  userName: string;
  userEmail: string;
  date: string;
  time: string;
  treatment?: string;
  reason?: string;
}) => {
  await notifyAdmins(
    "appointment_cancelled",
    `Cita cancelada por paciente: ${params.userName}`,
    `${params.date} a las ${params.time}${params.treatment ? ` · ${params.treatment}` : ""}${params.reason ? ` — "${params.reason}"` : ""}`,
  );

  sendAdminNotificationEmail({
    subject: `Cita cancelada por ${params.userName}`,
    title: "Paciente canceló su cita",
    body: `<strong>${params.userName}</strong> (${params.userEmail}) canceló su cita del <strong>${params.date}</strong> a las <strong>${params.time}</strong>${params.treatment ? ` · ${params.treatment}` : ""}${params.reason ? `.<br>Motivo: ${params.reason}` : "."}`,
  }).catch((err) => logger.error({ err }, "[notifications] email appointment_cancelled_by_patient failed"));
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

/** Invoice payment failed → notify user + admins (in-app + email) */
export const onMembershipPaymentFailed = async (params: {
  userId: string;
  userEmail: string;
  userName: string;
  amountFormatted: string;
  planCode?: string | null;
}) => {
  // User in-app
  await createNotification({
    userId: params.userId,
    type: "membership_past_due",
    title: "Pago de membresía fallido",
    body: `No pudimos procesar tu pago de ${params.amountFormatted}. Por favor actualiza tu método de pago.`,
    data: { planCode: params.planCode },
  });

  // User email
  sendNotificationEmail(params.userEmail, {
    name: params.userName,
    subject: "Problema con tu pago — Velum Laser",
    title: "Pago de membresía no procesado",
    body: `Hola <strong>${params.userName}</strong>, no pudimos procesar tu pago de <strong>${params.amountFormatted}</strong>${params.planCode ? ` del plan <strong>${params.planCode}</strong>` : ""}. Para continuar disfrutando de tus beneficios, por favor actualiza tu método de pago en Stripe.`,
    ctaLabel: "Actualizar método de pago",
    ctaUrl: `${env.stripeCheckoutBaseUrl}/#/memberships`,
  }).catch((err) => logger.error({ err }, "[notifications] email membership_past_due (user) failed"));

  // Admins in-app + email
  await notifyAdmins(
    "membership_past_due",
    `Pago fallido: ${params.userName}`,
    `No se procesó el cobro de ${params.amountFormatted}${params.planCode ? ` (${params.planCode})` : ""}.`,
    { userId: params.userId, planCode: params.planCode }
  );

  sendAdminNotificationEmail({
    subject: `Pago fallido de membresía: ${params.userName}`,
    title: "Pago de membresía fallido",
    body: `<strong>${params.userName}</strong> (${params.userEmail}) tuvo un cobro fallido de <strong>${params.amountFormatted}</strong>${params.planCode ? ` en el plan <strong>${params.planCode}</strong>` : ""}. Su membresía pasó a estado "Pago vencido".`,
  }).catch((err) => logger.error({ err }, "[notifications] email membership_past_due (admin) failed"));
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
      ctaUrl: `${env.stripeCheckoutBaseUrl}/#/memberships`,
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

export const onIntakeApproved = async (params: {
  userId: string;
  userEmail: string;
  userName: string;
}) => {
  const baseUrl = env.stripeCheckoutBaseUrl;

  await createNotification({
    userId: params.userId,
    type: "intake_approved",
    title: "Tu expediente fue aprobado",
    body: "Ya puedes agendar tu primera cita.",
    data: {},
  });

  sendNotificationEmail(params.userEmail, {
    name: params.userName,
    subject: "Tu expediente médico fue aprobado — Velum Laser",
    title: "Expediente aprobado",
    body: "Hola <strong>" + params.userName + "</strong>, tu expediente médico fue revisado y aprobado por nuestro equipo clínico. Ya puedes agendar tu primera cita.",
    ctaLabel: "Agendar cita",
    ctaUrl: `${baseUrl}/#/agenda`,
  }).catch((err) => logger.error({ err }, "[notifications] email intake_approved failed"));
};

export const onIntakeRejected = async (params: {
  userId: string;
  userEmail: string;
  userName: string;
  rejectionReason?: string | null;
}) => {
  const baseUrl = env.stripeCheckoutBaseUrl;

  await createNotification({
    userId: params.userId,
    type: "intake_rejected",
    title: "Tu expediente requiere correcciones",
    body: params.rejectionReason ?? "Por favor revisa y actualiza tu expediente.",
    data: { rejectionReason: params.rejectionReason },
  });

  sendNotificationEmail(params.userEmail, {
    name: params.userName,
    subject: "Tu expediente médico requiere correcciones — Velum Laser",
    title: "Expediente con observaciones",
    body: `Hola <strong>${params.userName}</strong>, tu expediente médico fue revisado y requiere algunas correcciones antes de continuar.${params.rejectionReason ? `<br><br><strong>Motivo:</strong> ${params.rejectionReason}` : ""}<br><br>Por favor actualiza tu expediente para continuar.`,
    ctaLabel: "Actualizar expediente",
    ctaUrl: `${baseUrl}/#/dashboard`,
  }).catch((err) => logger.error({ err }, "[notifications] email intake_rejected failed"));
};
