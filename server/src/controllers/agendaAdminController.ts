import { Response } from "express";
import { AuthRequest } from "../middlewares/auth";
import { createAuditLog } from "../services/auditService";
import {
  AgendaValidationError,
  createAgendaBlock,
  deleteAgendaBlock,
  getAgendaConfig,
  getAgendaDailyReport,
  getAgendaDaySnapshot,
  updateAgendaConfig
} from "../services/agendaService";
import { agendaBlockCreateSchema, agendaConfigUpdateSchema, agendaDateParamSchema } from "../validators/agenda";

// Helper local — evita importar desde agendaTimezoneUtils (función equivalente ya existe aquí)
const respondIfAgendaError = (error: unknown, res: Response) => {
  if (error instanceof AgendaValidationError) {
    res.status(error.statusCode).json({ message: error.message });
    return true;
  }
  return false;
};

export const getAdminAgendaConfig = async (_req: AuthRequest, res: Response) => {
  const config = await getAgendaConfig();
  return res.json(config);
};

export const putAdminAgendaConfig = async (req: AuthRequest, res: Response) => {
  const payload = agendaConfigUpdateSchema.parse(req.body) as Parameters<typeof updateAgendaConfig>[0];
  const config = await updateAgendaConfig(payload);

  await createAuditLog({
    userId: req.user!.id,
    targetUserId: req.user!.id,
    action: "agenda.config.update",
    resourceType: "agenda",
    resourceId: config.policy.id,
    ip: req.ip,
    metadata: payload
  });

  return res.json(config);
};

export const getAdminAgendaDay = async (req: AuthRequest, res: Response) => {
  const params = agendaDateParamSchema.parse(req.params);
  const snapshot = await getAgendaDaySnapshot(params.dateKey);
  return res.json(snapshot);
};

export const postAdminAgendaBlock = async (req: AuthRequest, res: Response) => {
  const payload = agendaBlockCreateSchema.parse(req.body);

  let block;
  try {
    block = await createAgendaBlock({
      ...(payload as { dateKey: string; startMinute: number; endMinute: number; cabinId?: string | null; reason?: string }),
      actorUserId: req.user!.id
    });
  } catch (error) {
    if (respondIfAgendaError(error, res)) {
      return;
    }
    throw error;
  }

  await createAuditLog({
    userId: req.user!.id,
    targetUserId: req.user!.id,
    action: "agenda.block.create",
    resourceType: "agenda_block",
    resourceId: block.id,
    ip: req.ip,
    metadata: payload
  });

  return res.status(201).json(block);
};

export const deleteAdminAgendaBlock = async (req: AuthRequest, res: Response) => {
  let block;
  try {
    block = await deleteAgendaBlock(req.params.blockId);
  } catch (error) {
    if (respondIfAgendaError(error, res)) {
      return;
    }
    throw error;
  }

  await createAuditLog({
    userId: req.user!.id,
    targetUserId: req.user!.id,
    action: "agenda.block.delete",
    resourceType: "agenda_block",
    resourceId: block.id,
    ip: req.ip,
    metadata: {
      dateKey: block.dateKey,
      startMinute: block.startMinute,
      endMinute: block.endMinute,
      cabinId: block.cabinId
    }
  });

  return res.status(204).send();
};

export const getAdminAgendaReport = async (req: AuthRequest, res: Response) => {
  const params = agendaDateParamSchema.parse(req.params);
  const report = await getAgendaDailyReport(params.dateKey);
  return res.json(report);
};
