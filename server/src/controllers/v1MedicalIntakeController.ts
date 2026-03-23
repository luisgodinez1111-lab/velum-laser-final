import { Prisma } from "@prisma/client";
import { Response } from "express";
import { prisma } from "../db/prisma";
import { AuthRequest } from "../middlewares/auth";
import { createAuditLog } from "../services/auditService";
import { medicalIntakeApproveSchema, medicalIntakeUpdateSchema } from "../validators/medicalIntake";
import { onIntakeApproved, onIntakeRejected, notifyAdmins } from "../services/notificationService";
import { logger } from "../utils/logger";
import { safeIp } from "../utils/request";

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

  // Auto-generate a short signatureKey when image data arrives (avoid storing full PNG as key)
  const signatureKey = payload.signatureImageData
    ? `sig_${current.id}_${Date.now()}`
    : (payload.signatureKey ?? undefined);

  const updated = await prisma.medicalIntake.update({
    where: { id: current.id },
    data: {
      personalJson: payload.personalJson as Prisma.InputJsonValue | undefined,
      historyJson: payload.historyJson as Prisma.InputJsonValue | undefined,
      phototype: payload.phototype ?? undefined,
      consentAccepted: payload.consentAccepted ?? undefined,
      signatureKey,
      signatureImageData: payload.signatureImageData ?? undefined,
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
    ip: safeIp(req),
    metadata: { status: updated.status }
  });

  if (requestedStatus === "submitted") {
    const patient = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: { email: true, profile: { select: { firstName: true, lastName: true } } }
    });
    const name = [patient?.profile?.firstName, patient?.profile?.lastName].filter(Boolean).join(" ") || patient?.email || "Paciente";
    notifyAdmins("intake_submitted", "Expediente médico enviado", `${name} envió su expediente para revisión.`, { userId: req.user!.id })
      .catch((err) => logger.error({ err }, "[intake] admin notification failed"));
  }

  return res.json(updated);
};

export const getMedicalIntakeByUserId = async (req: AuthRequest, res: Response) => {
  const userId = String(req.params.userId ?? "").trim();
  if (!userId) return res.status(400).json({ message: "userId requerido" });
  const intake = await prisma.medicalIntake.findUnique({ where: { userId } });
  if (!intake) return res.status(404).json({ message: "Expediente no encontrado" });
  return res.json(intake);
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
    ip: safeIp(req),
    metadata: {
      approved: payload.approved,
      rejectionReason: payload.rejectionReason
    }
  });

  // Notify patient about the result
  const patient = await prisma.user.findUnique({
    where: { id: req.params.userId },
    select: { email: true, profile: { select: { firstName: true, lastName: true } } }
  });
  if (patient) {
    const name = [patient.profile?.firstName, patient.profile?.lastName].filter(Boolean).join(" ") || patient.email;
    const notifyFn = payload.approved
      ? onIntakeApproved({ userId: req.params.userId, userEmail: patient.email, userName: name })
      : onIntakeRejected({ userId: req.params.userId, userEmail: patient.email, userName: name, rejectionReason: payload.rejectionReason });
    notifyFn.catch((err) => logger.error({ err }, "[intake] notification failed"));
  }

  return res.json(updated);
};
