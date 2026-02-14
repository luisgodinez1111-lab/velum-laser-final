import { Response } from "express";
import { AuthRequest } from "../middlewares/auth";
import * as notificationService from "../services/notificationService";

// Member: get my notifications
export const getMyNotifications = async (req: AuthRequest, res: Response) => {
  const limit = Number(req.query.limit) || 20;
  const notifications = await notificationService.getUserNotifications(req.user!.id, limit);
  res.json(notifications);
};

// Member: get unread count
export const getUnreadCount = async (req: AuthRequest, res: Response) => {
  const count = await notificationService.getUnreadCount(req.user!.id);
  res.json({ count });
};

// Member: mark one notification as read
export const markNotificationRead = async (req: AuthRequest, res: Response) => {
  await notificationService.markAsRead(req.params.id, req.user!.id);
  res.json({ success: true });
};

// Member: mark all as read
export const markAllRead = async (req: AuthRequest, res: Response) => {
  await notificationService.markAllAsRead(req.user!.id);
  res.json({ success: true });
};
