import { Router } from "express";
import { requireAuth, requireRole } from "../middlewares/auth";
import {
  listAdminAccessUsers,
  createAdminAccessUser,
  updateAdminAccessUser,
  resetAdminAccessPassword,
  deactivateUser,
  activateUser,
  requestDeleteUserOtp,
  deleteUser,
  getTotpSetup,
  enableTotp,
  disableTotp,
} from "../controllers/adminAccessController";

export const adminAccessRoutes = Router();

// Rutas TOTP — self-service, cualquier usuario autenticado
adminAccessRoutes.get("/api/v1/me/totp/setup", requireAuth, getTotpSetup);
adminAccessRoutes.post("/api/v1/me/totp/enable", requireAuth, enableTotp);
adminAccessRoutes.delete("/api/v1/me/totp", requireAuth, disableTotp);

adminAccessRoutes.get("/api/v1/admin/access/users", requireAuth, requireRole(["admin", "system"]), listAdminAccessUsers);
adminAccessRoutes.post("/api/v1/admin/access/users", requireAuth, requireRole(["admin", "system"]), createAdminAccessUser);
adminAccessRoutes.patch("/api/v1/admin/access/users/:userId", requireAuth, requireRole(["admin", "system"]), updateAdminAccessUser);
adminAccessRoutes.post("/api/v1/admin/access/users/:userId/reset-password", requireAuth, requireRole(["admin", "system"]), resetAdminAccessPassword);
adminAccessRoutes.patch("/api/v1/admin/access/users/:userId/deactivate", requireAuth, requireRole(["admin", "system"]), deactivateUser);
adminAccessRoutes.patch("/api/v1/admin/access/users/:userId/activate", requireAuth, requireRole(["admin", "system"]), activateUser);
adminAccessRoutes.post("/api/v1/admin/access/users/:userId/request-delete-otp", requireAuth, requireRole(["admin", "system"]), requestDeleteUserOtp);
adminAccessRoutes.delete("/api/v1/admin/access/users/:userId", requireAuth, requireRole(["admin", "system"]), deleteUser);
