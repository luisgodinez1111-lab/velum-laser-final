import { Router } from "express";
import { requireAuth, requireRole } from "../middlewares/auth";
import { listAuditLogs, listDocumentsAdmin, listMemberships, listUsers, reports, updateMembershipStatus } from "../controllers/adminController";

export const adminRoutes = Router();

adminRoutes.use("/admin", requireAuth, requireRole(["staff", "admin", "system"]));

adminRoutes.get("/admin/users", listUsers);
adminRoutes.get("/admin/memberships", listMemberships);
adminRoutes.get("/admin/documents", listDocumentsAdmin);
adminRoutes.get("/admin/reports", reports);
adminRoutes.get("/admin/audit-logs", listAuditLogs);
adminRoutes.patch("/admin/users/:userId/membership", updateMembershipStatus);
