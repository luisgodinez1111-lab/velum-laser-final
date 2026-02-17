import { Response } from "express";
import { prisma } from "../db/prisma";
import { AuthRequest } from "../middlewares/auth";
import { createAuditLog } from "../services/auditService";

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const cleanPhototype = (value: unknown): number | undefined => {
  if (typeof value !== "number") return undefined;
  if (!Number.isInteger(value)) return undefined;
  if (value < 1 || value > 6) return undefined;
  return value;
};

export const getMyMedicalIntake = async (req: AuthRequest, res: Response) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ message: "No autorizado" });

  const intake = await prisma.medicalIntake.upsert({
    where: { userId },
    update: {},
    create: { userId, status: "draft" }
  });

return res.json(intake);
};

export const updateMyMedicalIntake = async (req: AuthRequest, res: Response) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ message: "No autorizado" });

const body = isObject(req.body) ? req.body : {};
  const submit = body.submit === true;

const updateData: Record<string, unknown> = {};
  if ("personalJson" in body) updateData.personalJson = body.personalJson ?? null;
  if ("historyJson" in body) updateData.historyJson = body.historyJson ?? null;
  if ("signatureKey" in body) updateData.signatureKey = typeof body.signatureKey === "string" ? body.signatureKey : null;
  if ("consentAccepted" in body) updateData.consentAccepted = Boolean(body.consentAccepted);

  const phototype = cleanPhototype(body.phototype);
  if (phototype !== undefined) updateData.phototype = phototype;

if (submit) {
    updateData.status = "submitted";
    updateData.submittedAt = new Date();
    updateData.rejectedAt = null;
    updateData.rejectionReason = null;
  }
const intake = await prisma.medicalIntake.upsert({
    where: { userId },
    update: updateData as any,
    create: {
      userId,
      status: submit ? "submitted" : "draft",
      submittedAt: submit ? new Date() : null,
personalJson: (updateData.personalJson as any) ?? null,
      historyJson: (updateData.historyJson as any) ?? null,
      phototype: (updateData.phototype as number | undefined) ?? null,
      consentAccepted: (updateData.consentAccepted as boolean | undefined) ?? false,
      signatureKey: (updateData.signatureKey as string | null | undefined) ?? null
    } as any
  });
await createAuditLog({
    userId,
    action: submit ? "medical_intake.submit" : "medical_intake.update",
    resourceType: "medical_intake",
    resourceId: intake.id,
    ip: req.ip,
    metadata: { submit }
  });
return res.json(intake);
};

export const approveMedicalIntake = async (req: AuthRequest, res: Response) => {
  const actorUserId = req.user?.id;
  if (!actorUserId) return res.status(401).json({ message: "No autorizado" });

const { userId } = req.params;
  if (!userId) return res.status(400).json({ message: "userId requerido" });

  const current = await prisma.medicalIntake.findUnique({ where: { userId } });
  if (!current) return res.status(404).json({ message: "Expediente no encontrado" });
const intake = await prisma.medicalIntake.update({
    where: { userId },
    data: {
      status: "approved",
      approvedAt: new Date(),
      approvedByUserId: actorUserId,
      rejectedAt: null,
      rejectionReason: null
    }
  });


await createAuditLog({
    actorUserId,
    targetUserId: userId,
    userId: actorUserId,
    action: "medical_intake.approve",
    resourceType: "medical_intake",
    resourceId: intake.id,
    ip: req.ip
  });

  return res.json(intake);
};
