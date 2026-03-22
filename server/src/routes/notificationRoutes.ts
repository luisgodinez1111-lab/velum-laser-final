import { Router } from "express";
import { requireAuth } from "../middlewares/auth";
import type { AuthRequest } from "../middlewares/auth";
import type { Response } from "express";
import {
  getNotifications,
  getUnreadCount,
  readNotification,
  readAllNotifications,
} from "../controllers/notificationController";
import { registerSseClient, unregisterSseClient } from "../services/notificationService";

export const notificationRoutes = Router();

// ── SSE stream — MUST be before /:id routes ───────────────────────────────────
notificationRoutes.get("/api/v1/notifications/stream", requireAuth, (req, res: Response) => {
  const userId = (req as AuthRequest).user.sub;

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no"); // disable nginx buffering
  res.flushHeaders();

  // Initial ping to confirm connection
  res.write(": connected\n\n");

  registerSseClient(userId, res);

  // Heartbeat every 25s to keep connection alive through proxies/load balancers
  const heartbeat = setInterval(() => {
    try { res.write(": heartbeat\n\n"); }
    catch { clearInterval(heartbeat); }
  }, 25_000);

  req.on("close", () => {
    clearInterval(heartbeat);
    unregisterSseClient(userId, res);
  });
});

notificationRoutes.get("/api/v1/notifications", requireAuth, getNotifications);
notificationRoutes.get("/api/v1/notifications/unread-count", requireAuth, getUnreadCount);
notificationRoutes.post("/api/v1/notifications/read-all", requireAuth, readAllNotifications);
notificationRoutes.post("/api/v1/notifications/:id/read", requireAuth, readNotification);
