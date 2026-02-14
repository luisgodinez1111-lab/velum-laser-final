import type { Request, Response } from "express";
import { fileUploadService } from "../services/fileUploadService.js";
import { fileUploadMetaSchema } from "../validators/fileUpload.js";
import { createAuditLog } from "../services/auditService.js";
import { createReadStream } from "fs";

export const uploadFile = async (req: Request, res: Response) => {
  const file = req.file;
  if (!file) return res.status(400).json({ message: "No se envió archivo" });

  const parsed = fileUploadMetaSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ errors: parsed.error.flatten().fieldErrors });

  const upload = await fileUploadService.upload({
    userId: req.user!.id,
    category: parsed.data.category as any,
    fileName: file.originalname,
    mimeType: file.mimetype,
    size: file.size,
    buffer: file.buffer,
    entityType: parsed.data.entityType,
    entityId: parsed.data.entityId,
  });

  await createAuditLog({ userId: req.user!.id, action: "file.upload", metadata: {
    fileId: upload.id,
    category: parsed.data.category,
    fileName: file.originalname,
  } });

  res.status(201).json(upload);
};

export const getMyFiles = async (req: Request, res: Response) => {
  const files = await fileUploadService.getByUser(req.user!.id);
  res.json(files);
};

export const getEntityFiles = async (req: Request, res: Response) => {
  const { entityType, entityId } = req.params;
  const files = await fileUploadService.getByEntity(entityType, entityId);
  res.json(files);
};

export const downloadFile = async (req: Request, res: Response) => {
  const file = await fileUploadService.getById(req.params.id);
  if (!file) return res.status(404).json({ message: "Archivo no encontrado" });

  const filePath = fileUploadService.getFilePath(file.storageKey);
  res.setHeader("Content-Type", file.mimeType);
  res.setHeader("Content-Disposition", `inline; filename="${file.fileName}"`);
  createReadStream(filePath).pipe(res);
};

export const deleteFile = async (req: Request, res: Response) => {
  const file = await fileUploadService.getById(req.params.id);
  if (!file) return res.status(404).json({ message: "Archivo no encontrado" });

  // Only owner or staff/admin can delete
  if (file.userId !== req.user!.id && !["staff", "admin"].includes(req.user!.role)) {
    return res.status(403).json({ message: "No autorizado" });
  }

  await fileUploadService.deleteFile(req.params.id);
  await createAuditLog({ userId: req.user!.id, action: "file.delete", metadata: { fileId: req.params.id } });
  res.json({ success: true });
};
