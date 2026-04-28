import { Response } from "express";
import path from "path";
import { AuthRequest } from "../middlewares/auth";
import { documentSignSchema, documentUploadSchema } from "../validators/documents";
import { generateStorageKey, getFilePath, saveFile } from "../services/storageService";
import { prisma } from "../db/prisma";
import { withTenantContext } from "../db/withTenantContext";
import { requireTenantId } from "../utils/tenantContext";
import { createAuditLog } from "../services/auditService";
import { sendDocumentSignedEmail } from "../services/emailService";
import { logger } from "../utils/logger";

const docTypeLabel: Record<string, string> = {
  consent: "Consentimiento informado",
  contract: "Contrato de membresía",
  medical_history: "Historial médico",
  other: "Documento"
};

const allowedTypes = ["application/pdf", "image/png", "image/jpeg"];

// Magic bytes (file signatures) to validate actual file content, not just the MIME header
const MAGIC_BYTES: Array<{ mime: string; offset: number; bytes: number[] }> = [
  { mime: "application/pdf", offset: 0, bytes: [0x25, 0x50, 0x44, 0x46] }, // %PDF
  { mime: "image/png",       offset: 0, bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] }, // PNG
  { mime: "image/jpeg",      offset: 0, bytes: [0xff, 0xd8, 0xff] }, // JPEG
];

function validateMagicBytes(buffer: Buffer, declaredMime: string): boolean {
  const entry = MAGIC_BYTES.find((m) => m.mime === declaredMime);
  if (!entry) return false;
  return entry.bytes.every((byte, i) => buffer[entry.offset + i] === byte);
}

export const listDocuments = async (req: AuthRequest, res: Response) => {
  const documents = await prisma.document.findMany({ where: { userId: req.user!.id } });
  return res.json(documents);
};

export const createUpload = async (req: AuthRequest, res: Response) => {
  const payload = documentUploadSchema.parse(req.body);
  const file = req.file as Express.Multer.File | undefined;
  if (!file) {
    return res.status(400).json({ message: "Archivo requerido" });
  }
  if (!allowedTypes.includes(file.mimetype)) {
    return res.status(400).json({ message: "Tipo de archivo no permitido" });
  }
  if (!validateMagicBytes(file.buffer, file.mimetype)) {
    return res.status(400).json({ message: "El contenido del archivo no coincide con su tipo declarado" });
  }
  const key = generateStorageKey(req.user!.id, file.mimetype);
  await saveFile({ key, buffer: file.buffer });
  const document = await prisma.document.create({
    data: {
      userId: req.user!.id,
      type: payload.type,
      version: payload.version,
      contentType: file.mimetype,
      size: file.size,
      storageKey: key,
      tenantId: requireTenantId(),
    }
  });
  await createAuditLog({
    userId: req.user!.id,
    action: "document.upload",
    resourceType: "document",
    resourceId: document.id,
    ip: req.ip,
    metadata: { type: document.type }
  });
  return res.json({ document });
};

export const downloadDocument = async (req: AuthRequest, res: Response) => {
  const document = await prisma.document.findFirst({
    where: req.user!.role === "member" ? { id: req.params.id, userId: req.user!.id } : { id: req.params.id }
  });
  if (!document) {
    return res.status(404).json({ message: "Documento no encontrado" });
  }
  if (!document.storageKey) {
    return res.status(404).json({ message: "Documento sin archivo" });
  }
  const filePath = await getFilePath(document.storageKey);
  res.setHeader("Content-Type", document.contentType ?? "application/octet-stream");
  res.setHeader("Content-Disposition", `attachment; filename="${path.basename(document.storageKey)}"`);
  return res.sendFile(filePath);
};

export const signDocument = async (req: AuthRequest, res: Response) => {
  const payload = documentSignSchema.parse(req.body);
  const document = await prisma.document.findFirst({
    where: { id: req.params.id, userId: req.user!.id }
  });
  if (!document) {
    return res.status(404).json({ message: "Documento no encontrado" });
  }
  const signatureKey = path.join(req.user!.id, `signature-${document.id}.png`);
  const signatureBuffer = Buffer.from(payload.signature.replace(/^data:image\/png;base64,/, ""), "base64");
  await saveFile({ key: signatureKey, buffer: signatureBuffer });
  const updated = await prisma.document.update({
    where: { id: document.id },
    data: {
      status: "signed",
      signedAt: new Date(),
      signatureKey
    }
  });
  await createAuditLog({
    userId: req.user!.id,
    action: "document.signed",
    resourceType: "document",
    resourceId: document.id,
    ip: req.ip,
    metadata: { type: document.type }
  });

  // Notificación de firma al usuario
  const userRecord = await withTenantContext(async (tx) => tx.user.findUnique({
    where: { id: req.user!.id },
    select: { email: true, profile: { select: { firstName: true, lastName: true } } }
  }));
  if (userRecord) {
    const name = [userRecord.profile?.firstName, userRecord.profile?.lastName].filter(Boolean).join(" ") || userRecord.email;
    const signedAt = new Date().toLocaleString("es-MX", { dateStyle: "long", timeStyle: "short" });
    sendDocumentSignedEmail(userRecord.email, {
      name,
      documentType: docTypeLabel[document.type] ?? document.type,
      signedAt
    }).catch((err) => logger.warn({ err, userId: req.user!.id, documentId: document.id }, "[document] sendDocumentSignedEmail failed"));
  }

  return res.json(updated);
};
