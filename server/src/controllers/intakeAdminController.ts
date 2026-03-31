import { Response } from "express";
import { prisma } from "../db/prisma";
import { AuthRequest } from "../middlewares/auth";
import { createAuditLog } from "../services/auditService";
import { logger } from "../utils/logger";
import { safeIp } from "../utils/request";
import { decrypt } from "../utils/crypto";

// Max base64 signature size: 2 MB decoded ≈ 2.73 MB base64
const MAX_SIGNATURE_B64_LEN = 3_000_000;

const SIG_ENC_PREFIX = "enc1:";
const decryptSignatureData = (val: string | null | undefined): string | null => {
  if (!val) return null;
  if (val.startsWith(SIG_ENC_PREFIX)) {
    try { return decrypt(val.slice(SIG_ENC_PREFIX.length)); }
    catch { return null; }
  }
  return val; // texto plano legacy
};

export const adminUpdatePatientIntake = async (req: AuthRequest, res: Response) => {
  try {
    const { userId } = req.params;
    const intake = req.body ?? {};

    const current = await prisma.medicalIntake.findUnique({ where: { userId } });
    if (!current) return res.status(404).json({ message: 'Expediente no encontrado' });

    // Guard: signature image data must not exceed 2 MB decoded
    if (intake.signatureImageData && typeof intake.signatureImageData === "string" &&
        intake.signatureImageData.length > MAX_SIGNATURE_B64_LEN) {
      return res.status(413).json({ message: 'La imagen de firma es demasiado grande (máx. 2 MB)' });
    }

    const consentAccepted = intake.consentAccepted ?? current.consentAccepted;
    const phototype       = intake.phototype       ?? current.phototype;
    const status          = (intake.consentAccepted && intake.phototype) ? 'submitted' : (intake.status ?? current.status);

    const updated = await prisma.medicalIntake.update({
      where: { userId },
      data: {
        ...(intake.personalJson  ? { personalJson:  intake.personalJson  } : {}),
        ...(intake.historyJson   ? { historyJson:   intake.historyJson   } : {}),
        ...(intake.phototype     ? { phototype:     intake.phototype     } : {}),
        consentAccepted,
        ...(intake.signatureKey  ? { signatureKey:  intake.signatureKey  } : {}),
        status,
        ...(status === 'submitted' && current.status !== 'submitted' ? { submittedAt: new Date() } : {})
      }
    });

    await createAuditLog({
      userId: req.user!.id,
      targetUserId: userId,
      action: 'admin.patient.intake_update',
      resourceType: 'medical_intake',
      resourceId: current.id,
      ip: safeIp(req),
      metadata: { status }
    });

    return res.json({
      ...updated,
      signatureImageData: decryptSignatureData(updated.signatureImageData),
    });
  } catch (error: unknown) {
    logger.error({ err: error }, "[admin] adminUpdatePatientIntake error");
    return res.status(500).json({ message: "Error interno del servidor" });
  }
};
