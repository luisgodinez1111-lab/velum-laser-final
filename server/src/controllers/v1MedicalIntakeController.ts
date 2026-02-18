import { Prisma } from "@prisma/client";
import { Response } from "express";
import { prisma } from "../db/prisma";
import { AuthRequest } from "../middlewares/auth";
import { createAuditLog } from "../services/auditService";
import { medicalIntakeApproveSchema, medicalIntakeUpdateSchema } from "../validators/medicalIntake";

const ensureIntake = async (userId: string) => {
  return prisma.medicalIntake.upsert({
    where: { userId },
    update: {},
    create: { userId, status: "draft" }
  });
};

export const getMyMedicalIntake = async (req: AuthRequest, res: Response) => {
  const intake = await ensureIntake(req.user!.id);
  return res.json(intake);
};

export const updateMyMedicalIntake = async (req: AuthRequest, res: Response) => {
  const payload = medicalIntakeUpdateSchema.parse(req.body);
  const current = await ensureIntake(req.user!.id);

  const nextPhototype = payload.phototype ?? current.phototype;
  const nextConsent = payload.consentAccepted ?? current.consentAccepted;
  const requestedStatus = payload.status ?? current.status;

  if (requestedStatus === "submitted") {
    if (!nextConsent) {
      return res.status(400).json({ message: "No se puede enviar sin consentimiento" });
    }

    if (!nextPhototype) {
      return res.status(400).json({ message: "No se puede enviar sin fototipo" });
    }
  }

  const updated = await prisma.medicalIntake.update({
    where: { id: current.id },
    data: {
      personalJson: payload.personalJson as Prisma.InputJsonValue | undefined,
      historyJson: payload.historyJson as Prisma.InputJsonValue | undefined,
      phototype: payload.phototype ?? undefined,
      consentAccepted: payload.consentAccepted ?? undefined,
      signatureKey: payload.signatureKey ?? undefined,
      status: requestedStatus,
      submittedAt: requestedStatus === "submitted" ? new Date() : current.submittedAt,
      rejectedAt: requestedStatus === "submitted" ? null : current.rejectedAt,
      rejectionReason: requestedStatus === "submitted" ? null : current.rejectionReason
    }
  });

  await createAuditLog({
    userId: req.user!.id,
    action: "medical_intake.update",
    resourceType: "medical_intake",
    resourceId: updated.id,
    ip: req.ip,
    metadata: { status: updated.status }
  });

  return res.json(updated);
};

export const approveMedicalIntake = async (req: AuthRequest, res: Response) => {
  const payload = medicalIntakeApproveSchema.parse(req.body);

  const intake = await prisma.medicalIntake.findUnique({
    where: { userId: req.params.userId }
  });

  if (!intake) {
    return res.status(404).json({ message: "Expediente no encontrado" });
  }

  if (!payload.approved && !payload.rejectionReason) {
    return res.status(400).json({ message: "Debes indicar motivo de rechazo" });
  }

  const updated = await prisma.medicalIntake.update({
    where: { id: intake.id },
    data: payload.approved
      ? {
          status: "approved",
          approvedAt: new Date(),
          approvedByUserId: req.user!.id,
          rejectedAt: null,
          rejectionReason: null
        }
      : {
          status: "rejected",
          rejectedAt: new Date(),
          rejectionReason: payload.rejectionReason,
          approvedAt: null,
          approvedByUserId: null
        }
  });

  await createAuditLog({
    userId: req.user!.id,
    targetUserId: req.params.userId,
    action: payload.approved ? "medical_intake.approve" : "medical_intake.reject",
    resourceType: "medical_intake",
    resourceId: intake.id,
    ip: req.ip,
    metadata: {
      approved: payload.approved,
      rejectionReason: payload.rejectionReason
    }
  });

  return res.json(updated);
};
