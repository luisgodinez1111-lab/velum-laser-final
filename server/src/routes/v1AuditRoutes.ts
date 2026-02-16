import { Router } from "express";
import { listAuditLogsV1 } from "../controllers/v1AuditController";
import { requireAuth, requireRole } from "../middlewares/auth";

export const v1AuditRoutes = Router();

v1AuditRoutes.get("/api/v1/audit-logs", requireAuth, requireRole(["admin", "system"]), listAuditLogsV1);
