import { Response } from "express";
import { AuthRequest } from "../middlewares/auth";
import { createAuditLog } from "../services/auditService";
import { logger } from "../utils/logger";
import { safeIp } from "../utils/request";
import { decryptSignature as decryptSignatureData } from "../utils/phiCrypto";
import { withTenantContext } from "../db/withTenantContext";

// Max base64 signature size: 2 MB decoded ≈ 2.73 MB base64
const MAX_SIGNATURE_B64_LEN = 3_000_000;

export const adminUpdatePatientIntake = async (req: AuthRequest, res: Response) => {
  try {
    const { userId } = req.params;
    const intake = req.body ?? {};

    // Solo leemos consentAccepted y status de `current`; evitamos traer
    // signatureImageData (PHI) y los JSON del expediente.
    const current = await withTenantContext(async (tx) => tx.medicalIntake.findUnique({
      where: { userId },
      select: { id: true, consentAccepted: true, status: true }
    }));
    if (!current) return res.status(404).json({ message: 'Expediente no encontrado' });

    // Guard: signature image data must not exceed 2 MB decoded
    if (intake.signatureImageData && typeof intake.signatureImageData === "string" &&
        intake.signatureImageData.length > MAX_SIGNATURE_B64_LEN) {
      return res.status(413).json({ message: 'La imagen de firma es demasiado grande (máx. 2 MB)' });
    }

    const consentAccepted = intake.consentAccepted ?? current.consentAccepted;
    const status          = (intake.consentAccepted && intake.phototype) ? 'submitted' : (intake.status ?? current.status);

    const updated = await withTenantContext(async (tx) => tx.medicalIntake.update({
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
    }));

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
