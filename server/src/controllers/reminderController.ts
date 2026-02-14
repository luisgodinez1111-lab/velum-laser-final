import type { Request, Response } from "express";
import { reminderService } from "../services/reminderService.js";
import { createAuditLog } from "../services/auditService.js";

export const triggerReminders = async (req: Request, res: Response) => {
  const hours = req.query.hours ? parseInt(req.query.hours as string) : 24;
  const result = await reminderService.sendUpcomingReminders(hours);
  await createAuditLog({ userId: req.user!.id, action: "reminders.triggered", metadata: { sent: result.sent } });
  res.json(result);
};

export const triggerNoShowFollowUp = async (req: Request, res: Response) => {
  const result = await reminderService.sendNoShowFollowUp();
  await createAuditLog({ userId: req.user!.id, action: "reminders.no_show_followup", metadata: { sent: result.sent } });
  res.json(result);
};
