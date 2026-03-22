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
import { prisma } from "../db/prisma";

export const notificationRoutes = Router();

// ── SSE stream — MUST be before /:id routes ───────────────────────────────────
// ?since=ISO_DATE  →  catch-up: server replays missed notifications since that timestamp
notificationRoutes.get("/api/v1/notifications/stream", requireAuth, async (req, res: Response) => {
  const userId = (req as AuthRequest).user.sub;

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no"); // disable nginx buffering
  res.flushHeaders();

  // Catch-up: replay notifications missed since last connection (max 50)
  const sinceRaw = req.query.since ? String(req.query.since) : null;
  if (sinceRaw) {
    const since = new Date(sinceRaw);
    if (!isNaN(since.getTime())) {
      try {
        const missed = await prisma.notification.findMany({
          where: { userId, createdAt: { gt: since } },
          orderBy: { createdAt: "asc" },
          take: 50,
        });
        for (const n of missed) {
          res.write(`data: ${JSON.stringify(n)}\n\n`);
        }
      } catch { /* non-fatal — continue with live stream */ }
    }
  }

  // Initial ping to confirm connection (after catch-up)
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
