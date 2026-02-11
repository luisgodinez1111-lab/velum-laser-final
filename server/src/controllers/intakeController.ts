import { Response } from "express";
import path from "path";
import { AuthRequest } from "../middlewares/auth";
import { saveIntakeSchema, signIntakeSchema, reviewIntakeSchema } from "../validators/intake";
import * as intakeService from "../services/intakeService";
import { saveFile } from "../services/storageService";
import { createAuditLog } from "../services/auditService";
import { IntakeStatus } from "@prisma/client";

export const getMyIntake = async (req: AuthRequest, res: Response) => {
  const intake = await intakeService.getLatestIntake(req.user!.id);
  return res.json(intake);
};

export const saveMyIntake = async (req: AuthRequest, res: Response) => {
  const payload = saveIntakeSchema.parse(req.body);
  const intake = await intakeService.saveIntakeDraft(req.user!.id, payload);
  await createAuditLog({
    userId: req.user!.id,
    action: "intake.save_draft",
    metadata: { intakeId: intake.id, ip: req.ip }
  });
  return res.json(intake);
};

export const submitMyIntake = async (req: AuthRequest, res: Response) => {
  const intake = await intakeService.submitIntake(req.user!.id);
  if (!intake) {
    return res.status(404).json({ message: "No se encontró expediente en borrador" });
  }
  await createAuditLog({
    userId: req.user!.id,
    action: "intake.submit",
    metadata: { intakeId: intake.id, ip: req.ip }
  });
  return res.json(intake);
};

export const signMyIntake = async (req: AuthRequest, res: Response) => {
  const payload = signIntakeSchema.parse(req.body);
  const signatureKey = path.join(req.user!.id, `intake-signature-${Date.now()}.png`);
  const signatureBuffer = Buffer.from(
    payload.signature.replace(/^data:image\/png;base64,/, ""),
    "base64"
  );
  await saveFile({ key: signatureKey, buffer: signatureBuffer });

  const intake = await intakeService.signIntake(req.user!.id, signatureKey);
  if (!intake) {
    return res.status(404).json({ message: "No se encontró expediente para firmar" });
  }
  await createAuditLog({
    userId: req.user!.id,
    action: "intake.sign",
    metadata: { intakeId: intake.id, ip: req.ip }
  });
  return res.json(intake);
};

export const listIntakesAdmin = async (req: AuthRequest, res: Response) => {
  const status = req.query.status as IntakeStatus | undefined;
  const intakes = await intakeService.listIntakes(status);
  return res.json(intakes);
};

export const getIntakeAdmin = async (req: AuthRequest, res: Response) => {
  const intake = await intakeService.getIntakeById(req.params.id);
  if (!intake) {
    return res.status(404).json({ message: "Expediente no encontrado" });
  }
  return res.json(intake);
};

export const reviewIntakeAdmin = async (req: AuthRequest, res: Response) => {
  const payload = reviewIntakeSchema.parse(req.body);
  const existing = await intakeService.getIntakeById(req.params.id);
  if (!existing) {
    return res.status(404).json({ message: "Expediente no encontrado" });
  }
  if (existing.status !== "submitted") {
    return res.status(400).json({ message: "Solo se pueden revisar expedientes enviados" });
  }

  const intake = await intakeService.reviewIntake(
    req.params.id,
    req.user!.id,
    payload.decision,
    payload.notes
  );

  await createAuditLog({
    userId: req.user!.id,
    action: `intake.${payload.decision}`,
    metadata: {
      intakeId: intake.id,
      targetUserId: existing.userId,
      decision: payload.decision,
      notes: payload.notes,
      ip: req.ip
    }
  });
  return res.json(intake);
};
