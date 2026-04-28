import { Prisma } from "@prisma/client";
import { prisma } from "../db/prisma";
import { withTenantContext } from "../db/withTenantContext";
import { logger } from "../utils/logger";
import { broadcastToUser } from "./sseService";
import { getTenantIdOr } from "../utils/tenantContext";
import { env } from "../utils/env";

// Re-exports del broadcaster SSE para compatibilidad con imports existentes
export { registerSseClient, unregisterSseClient, getSseConnectionCount } from "./sseService";

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
  | "intake_submitted"
  | "custom_charge_expired";

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
    const created = await prisma.notification.create({
      data: {
        userId: params.userId,
        type: params.type,
        title: params.title,
        body: params.body,
        data: (params.data ?? {}) as Prisma.InputJsonValue,
        tenantId: getTenantIdOr(env.defaultClinicId),
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
  const admins = await withTenantContext(async (tx) => tx.user.findMany({
    where: { role: { in: ["admin", "staff", "system"] }, isActive: true },
    select: { id: true },
  }));
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
    const tenantId = getTenantIdOr(env.defaultClinicId);
    const rows = admins.map((a) => ({
      userId: a.id,
      type,
      title,
      body,
      data: (data ?? {}) as Prisma.InputJsonValue,
      tenantId,
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

// ── Re-exports de event handlers para compatibilidad con imports existentes ──
// Los handlers reales están en notificationEventHandlers.ts
export {
  onCustomChargeCreated,
  onCustomChargeAccepted,
  onCustomChargePaid,
  onAppointmentDepositPaid,
  onAppointmentBooked,
  onAppointmentConfirmed,
  onAppointmentCancelledByClinic,
  onAppointmentCancelledByPatient,
  onNewMember,
  onMembershipPaymentFailed,
  onMembershipActivated,
  onIntakeApproved,
  onIntakeRejected,
} from "./notificationEventHandlers";
