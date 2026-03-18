import { Response } from "express";
import { AuthRequest } from "../middlewares/auth";
import {
  listNotifications,
  countUnread,
  markRead,
  markAllRead,
} from "../services/notificationService";

// ── GET /api/v1/notifications ─────────────────────────────────────────
export const getNotifications = async (req: AuthRequest, res: Response) => {
  if (!req.user?.id) return res.status(401).json({ message: "No autorizado" });
  const limit = Math.min(Number(req.query.limit) || 30, 100);
  const skip = Number(req.query.skip) || 0;
  const result = await listNotifications(req.user.id, limit, skip);
  return res.json(result);
};

// ── GET /api/v1/notifications/unread-count ────────────────────────────
export const getUnreadCount = async (req: AuthRequest, res: Response) => {
  if (!req.user?.id) return res.status(401).json({ message: "No autorizado" });
  const count = await countUnread(req.user.id);
  return res.json({ count });
};

// ── POST /api/v1/notifications/:id/read ──────────────────────────────
export const readNotification = async (req: AuthRequest, res: Response) => {
  if (!req.user?.id) return res.status(401).json({ message: "No autorizado" });
  const { id } = req.params;
  const result = await markRead(id, req.user.id);
  if (!result) return res.status(404).json({ message: "Notificación no encontrada" });
  return res.json({ notification: result });
};

// ── POST /api/v1/notifications/read-all ──────────────────────────────
export const readAllNotifications = async (req: AuthRequest, res: Response) => {
  if (!req.user?.id) return res.status(401).json({ message: "No autorizado" });
  await markAllRead(req.user.id);
  return res.json({ message: "Todas las notificaciones marcadas como leídas" });
};
