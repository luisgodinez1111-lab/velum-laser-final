import { Router } from "express";
import { requireAuth } from "../middlewares/auth";
import { createUpload, downloadDocument, listDocuments } from "../controllers/documentController";

export const documentRoutes = Router();

documentRoutes.get("/documents", requireAuth, listDocuments);
documentRoutes.post("/documents/upload", requireAuth, createUpload);
documentRoutes.get("/documents/:id", requireAuth, downloadDocument);
