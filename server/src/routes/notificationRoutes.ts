import { Router } from "express";
import { requireAuth } from "../middlewares/auth";
import {
  getNotifications,
  getUnreadCount,
  readNotification,
  readAllNotifications,
} from "../controllers/notificationController";

export const notificationRoutes = Router();

notificationRoutes.get("/api/v1/notifications", requireAuth, getNotifications);
notificationRoutes.get("/api/v1/notifications/unread-count", requireAuth, getUnreadCount);
notificationRoutes.post("/api/v1/notifications/read-all", requireAuth, readAllNotifications);
notificationRoutes.post("/api/v1/notifications/:id/read", requireAuth, readNotification);
