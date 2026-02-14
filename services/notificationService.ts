import { apiFetch } from "./apiClient";

export interface NotificationData {
  id: string;
  userId: string;
  type: "in_app" | "email" | "whatsapp";
  status: "pending" | "sent" | "failed" | "read";
  title: string;
  body: string;
  metadata?: Record<string, unknown>;
  readAt?: string;
  sentAt?: string;
  createdAt: string;
}

export const notificationService = {
  getMyNotifications: (limit = 20) =>
    apiFetch<NotificationData[]>(`/me/notifications?limit=${limit}`),

  getUnreadCount: () =>
    apiFetch<{ count: number }>("/me/notifications/unread-count"),

  markAsRead: (id: string) =>
    apiFetch<{ success: boolean }>(`/me/notifications/${id}/read`, {
      method: "PATCH"
    }),

  markAllAsRead: () =>
    apiFetch<{ success: boolean }>("/me/notifications/read-all", {
      method: "POST"
    })
};
