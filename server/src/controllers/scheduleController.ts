import { Response } from "express";
import { AuthRequest } from "../middlewares/auth";
import { bulkScheduleSchema, blockDateSchema } from "../validators/schedule";
import * as scheduleService from "../services/scheduleService";
import { createAuditLog } from "../services/auditService";

export const getAvailability = async (req: AuthRequest, res: Response) => {
  const dateStr = req.query.date as string;
  if (!dateStr) {
    return res.status(400).json({ message: "Parámetro 'date' requerido (YYYY-MM-DD)" });
  }
  const date = new Date(dateStr + "T00:00:00");
  if (isNaN(date.getTime())) {
    return res.status(400).json({ message: "Formato de fecha inválido" });
  }
  const slots = await scheduleService.getAvailableSlots(date);
  return res.json({ date: dateStr, slots });
};

export const getScheduleConfig = async (_req: AuthRequest, res: Response) => {
  const configs = await scheduleService.getScheduleConfigs();
  return res.json(configs);
};

export const updateScheduleConfig = async (req: AuthRequest, res: Response) => {
  const items = bulkScheduleSchema.parse(req.body);
  const configs = await scheduleService.bulkUpsertSchedule(items);
  await createAuditLog({
    userId: req.user!.id,
    action: "schedule.update",
    metadata: { days: items.map((i) => i.dayOfWeek), ip: req.ip }
  });
  return res.json(configs);
};

export const listBlockedDates = async (_req: AuthRequest, res: Response) => {
  const blocks = await scheduleService.getBlockedDates();
  return res.json(blocks);
};

export const blockDate = async (req: AuthRequest, res: Response) => {
  const payload = blockDateSchema.parse(req.body);
  const blocked = await scheduleService.createBlockedDate(
    new Date(payload.date),
    payload.reason
  );
  await createAuditLog({
    userId: req.user!.id,
    action: "schedule.block",
    metadata: { blockedDateId: blocked.id, date: payload.date, ip: req.ip }
  });
  return res.json(blocked);
};

export const unblockDate = async (req: AuthRequest, res: Response) => {
  await scheduleService.deleteBlockedDate(req.params.id);
  await createAuditLog({
    userId: req.user!.id,
    action: "schedule.unblock",
    metadata: { blockedDateId: req.params.id, ip: req.ip }
  });
  return res.status(204).send();
};
