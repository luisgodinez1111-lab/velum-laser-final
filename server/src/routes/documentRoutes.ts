import { Router } from "express";
import { requireAuth } from "../middlewares/auth";
import { createUpload, downloadDocument, listDocuments, signDocument } from "../controllers/documentController";
import multer, { FileFilterCallback } from "multer";
import { Request } from "express";
import { env } from "../utils/env";

export const documentRoutes = Router();

const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
]);

const fileFilter = (_req: Request, file: Express.Multer.File, cb: FileFilterCallback) => {
  if (ALLOWED_MIME_TYPES.has(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error(`Tipo de archivo no permitido: ${file.mimetype}. Solo se aceptan PDF e imágenes.`));
  }
};

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.uploadMaxSize },
  fileFilter,
});

documentRoutes.get("/documents", requireAuth, listDocuments);
documentRoutes.post("/documents/upload", requireAuth, upload.single("file"), createUpload);
documentRoutes.get("/documents/:id", requireAuth, downloadDocument);
documentRoutes.post("/documents/:id/sign", requireAuth, signDocument);
