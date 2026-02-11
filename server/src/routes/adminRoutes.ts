import { Router } from "express";
import { requireAuth, requireRole } from "../middlewares/auth";
import { listAuditLogs, listDocumentsAdmin, listMemberships, listUsers, reports, updateMembershipStatus } from "../controllers/adminController";

export const adminRoutes = Router();

const adminGuard = [requireAuth, requireRole(["staff", "admin"])] as const;

adminRoutes.get("/admin/users", ...adminGuard, listUsers);
adminRoutes.get("/admin/memberships", ...adminGuard, listMemberships);
adminRoutes.get("/admin/documents", ...adminGuard, listDocumentsAdmin);
adminRoutes.get("/admin/reports", ...adminGuard, reports);
adminRoutes.get("/admin/audit-logs", ...adminGuard, listAuditLogs);
adminRoutes.patch("/admin/users/:userId/membership", ...adminGuard, updateMembershipStatus);
