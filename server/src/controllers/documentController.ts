import { Response } from "express";
import path from "path";
import { AuthRequest } from "../middlewares/auth";
import { documentSignSchema, documentUploadSchema } from "../validators/documents";
import { generateStorageKey, getFilePath, saveFile } from "../services/storageService";
import { prisma } from "../db/prisma";
import { createAuditLog } from "../services/auditService";

const allowedTypes = ["application/pdf", "image/png", "image/jpeg"];

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
  const key = generateStorageKey(req.user!.id, file.mimetype);
  await saveFile({ key, buffer: file.buffer });
  const document = await prisma.document.create({
    data: {
      userId: req.user!.id,
      type: payload.type,
      version: payload.version,
      contentType: file.mimetype,
      size: file.size,
      storageKey: key
    }
  });
  await createAuditLog({
    userId: req.user!.id,
    action: "document.upload",
    metadata: { documentId: document.id, type: document.type, ip: req.ip }
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
    metadata: { documentId: document.id, type: document.type, ip: req.ip }
  });
  return res.json(updated);
};
