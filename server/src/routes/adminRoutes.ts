import { Router } from "express";
import { requireAuth, requireRole } from "../middlewares/auth";
import { listDocumentsAdmin, listMemberships, listUsers, reports } from "../controllers/adminController";

export const adminRoutes = Router();

adminRoutes.use(requireAuth, requireRole(["staff", "admin"]));

adminRoutes.get("/admin/users", listUsers);
adminRoutes.get("/admin/memberships", listMemberships);
adminRoutes.get("/admin/documents", listDocumentsAdmin);
adminRoutes.get("/admin/reports", reports);
