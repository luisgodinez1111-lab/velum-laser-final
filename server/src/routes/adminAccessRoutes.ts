import { Router } from "express";
import { requireAuth } from "../middlewares/auth";
import {
  listAdminAccessUsers,
  createAdminAccessUser,
  updateAdminAccessUser,
  resetAdminAccessPassword,
} from "../controllers/adminAccessController";

export const adminAccessRoutes = Router();

adminAccessRoutes.get("/api/v1/admin/access/users", requireAuth, listAdminAccessUsers);
adminAccessRoutes.post("/api/v1/admin/access/users", requireAuth, createAdminAccessUser);
adminAccessRoutes.patch("/api/v1/admin/access/users/:userId", requireAuth, updateAdminAccessUser);
adminAccessRoutes.post("/api/v1/admin/access/users/:userId/reset-password", requireAuth, resetAdminAccessPassword);
