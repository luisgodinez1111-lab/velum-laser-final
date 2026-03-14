import { Router } from "express";
import { requireAuth, requireRole } from "../middlewares/auth";
import {
  getAdminWhatsappConfig,
  postAdminWhatsappTest,
  putAdminWhatsappConfig
} from "../controllers/adminWhatsappConfigController";

export const adminWhatsappConfigRoutes = Router();

adminWhatsappConfigRoutes.get(
  "/api/v1/admin/integrations/whatsapp",
  requireAuth,
  requireRole(["admin", "system"]),
  getAdminWhatsappConfig
);

adminWhatsappConfigRoutes.put(
  "/api/v1/admin/integrations/whatsapp",
  requireAuth,
  requireRole(["admin", "system"]),
  putAdminWhatsappConfig
);

adminWhatsappConfigRoutes.post(
  "/api/v1/admin/integrations/whatsapp/test",
  requireAuth,
  requireRole(["admin", "system"]),
  postAdminWhatsappTest
);
