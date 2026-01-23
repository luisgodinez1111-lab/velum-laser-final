import { Router } from "express";
import { requireAuth } from "../middlewares/auth";
import { createUpload, downloadDocument, listDocuments, signDocument } from "../controllers/documentController";
import multer from "multer";
import { env } from "../utils/env";

export const documentRoutes = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.uploadMaxSize }
});

documentRoutes.get("/documents", requireAuth, listDocuments);
documentRoutes.post("/documents/upload", requireAuth, upload.single("file"), createUpload);
documentRoutes.get("/documents/:id", requireAuth, downloadDocument);
documentRoutes.post("/documents/:id/sign", requireAuth, signDocument);
