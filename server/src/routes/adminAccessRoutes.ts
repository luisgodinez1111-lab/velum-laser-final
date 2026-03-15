import { Router } from "express";
import { requireAuth, requireRole } from "../middlewares/auth";
import {
  listAdminAccessUsers,
  createAdminAccessUser,
  updateAdminAccessUser,
  resetAdminAccessPassword,
} from "../controllers/adminAccessController";

export const adminAccessRoutes = Router();

adminAccessRoutes.get("/api/v1/admin/access/users", requireAuth, requireRole(["admin", "system"]), listAdminAccessUsers);
adminAccessRoutes.post("/api/v1/admin/access/users", requireAuth, requireRole(["admin", "system"]), createAdminAccessUser);
adminAccessRoutes.patch("/api/v1/admin/access/users/:userId", requireAuth, requireRole(["admin", "system"]), updateAdminAccessUser);
adminAccessRoutes.post("/api/v1/admin/access/users/:userId/reset-password", requireAuth, requireRole(["admin", "system"]), resetAdminAccessPassword);
