import { Router } from "express";
import multer from "multer";
import { requireAuth, requireRole } from "../middlewares/auth";
import {
  uploadFile,
  getMyFiles,
  getEntityFiles,
  downloadFile,
  deleteFile,
} from "../controllers/fileUploadController";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB max
  fileFilter: (_req, file, cb) => {
    const allowed = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Tipo de archivo no permitido. Solo JPEG, PNG, WebP y PDF."));
    }
  },
});

export const fileUploadRoutes = Router();

// Any authenticated user can upload and view their own files
fileUploadRoutes.post("/files/upload", requireAuth, upload.single("file"), uploadFile);
fileUploadRoutes.get("/me/files", requireAuth, getMyFiles);
fileUploadRoutes.get("/files/:id/download", requireAuth, downloadFile);
fileUploadRoutes.delete("/files/:id", requireAuth, deleteFile);

// Staff/Admin: view files by entity
fileUploadRoutes.get("/admin/files/:entityType/:entityId", requireAuth, requireRole(["staff", "admin"]), getEntityFiles);
