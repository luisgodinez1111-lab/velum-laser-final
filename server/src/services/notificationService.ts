import { prisma } from "../db/prisma";

export const getUserNotifications = async (userId: string, limit = 20) => {
  return prisma.notification.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: limit
  });
};

export const getUnreadCount = async (userId: string) => {
  return prisma.notification.count({
    where: { userId, readAt: null, type: "in_app" }
  });
};

export const markAsRead = async (id: string, userId: string) => {
  return prisma.notification.updateMany({
    where: { id, userId },
    data: { readAt: new Date(), status: "read" }
  });
};

export const markAllAsRead = async (userId: string) => {
  return prisma.notification.updateMany({
    where: { userId, readAt: null },
    data: { readAt: new Date(), status: "read" }
  });
};

export const createNotification = async (data: {
  userId: string;
  type?: "in_app" | "email" | "whatsapp";
  title: string;
  body: string;
  metadata?: Record<string, unknown>;
}) => {
  return prisma.notification.create({
    data: {
      userId: data.userId,
      type: data.type ?? "in_app",
      status: data.type === "in_app" ? "sent" : "pending",
      title: data.title,
      body: data.body,
      metadata: data.metadata,
      sentAt: data.type === "in_app" ? new Date() : undefined
    }
  });
};

// Utility: fire-and-forget notification (used internally by other services)
export const notify = async (
  userId: string,
  title: string,
  body: string,
  metadata?: Record<string, unknown>
) => {
  try {
    await createNotification({ userId, type: "in_app", title, body, metadata });
  } catch {
    // Notifications are non-critical, don't fail main flows
  }
};
