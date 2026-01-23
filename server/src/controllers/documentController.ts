import { Response } from "express";
import { AuthRequest } from "../middlewares/auth";
import { documentUploadSchema } from "../validators/documents";
import { createDownloadUrl, createUploadUrl, generateStorageKey } from "../services/storageService";
import { prisma } from "../db/prisma";

const allowedTypes = ["application/pdf", "image/png", "image/jpeg"];

export const listDocuments = async (req: AuthRequest, res: Response) => {
  const documents = await prisma.document.findMany({ where: { userId: req.user!.id } });
  return res.json(documents);
};

export const createUpload = async (req: AuthRequest, res: Response) => {
  const payload = documentUploadSchema.parse(req.body);
  if (!allowedTypes.includes(payload.contentType)) {
    return res.status(400).json({ message: "Tipo de archivo no permitido" });
  }
  const key = generateStorageKey(req.user!.id, payload.contentType);
  const url = await createUploadUrl({ key, contentType: payload.contentType, size: payload.size });
  const document = await prisma.document.create({
    data: {
      userId: req.user!.id,
      type: payload.type,
      version: payload.version,
      contentType: payload.contentType,
      size: payload.size,
      storageKey: key
    }
  });
  return res.json({ url, document });
};

export const downloadDocument = async (req: AuthRequest, res: Response) => {
  const document = await prisma.document.findFirst({
    where: { id: req.params.id, userId: req.user!.id }
  });
  if (!document) {
    return res.status(404).json({ message: "Documento no encontrado" });
  }
  const url = await createDownloadUrl(document.storageKey);
  return res.json({ url });
};
