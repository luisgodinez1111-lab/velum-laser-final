import { Router } from "express";
import { requireAuth } from "../middlewares/auth";
import {
  getMyNotifications,
  getUnreadCount,
  markNotificationRead,
  markAllRead
} from "../controllers/notificationController";

export const notificationRoutes = Router();

notificationRoutes.get("/me/notifications", requireAuth, getMyNotifications);
notificationRoutes.get("/me/notifications/unread-count", requireAuth, getUnreadCount);
notificationRoutes.patch("/me/notifications/:id/read", requireAuth, markNotificationRead);
notificationRoutes.post("/me/notifications/read-all", requireAuth, markAllRead);
