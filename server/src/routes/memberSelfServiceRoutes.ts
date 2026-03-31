import { Router } from "express";
import { requireAuth } from "../middlewares/auth";
import {
  changeMyPassword,
  getMyProfile,
  requestMyPasswordWhatsappCode,
  updateMyProfile,
  getMyData,
  deleteMyAccount,
} from "../controllers/memberSelfServiceController";

export const memberSelfServiceRoutes = Router();

memberSelfServiceRoutes.get("/api/v1/users/me/profile", requireAuth, getMyProfile);
memberSelfServiceRoutes.put("/api/v1/users/me/profile", requireAuth, updateMyProfile);
memberSelfServiceRoutes.post("/api/v1/users/me/password/request-whatsapp-code", requireAuth, requestMyPasswordWhatsappCode);
memberSelfServiceRoutes.post("/api/v1/users/me/password", requireAuth, changeMyPassword);

// GDPR
memberSelfServiceRoutes.get("/api/v1/users/me/my-data", requireAuth, getMyData);
memberSelfServiceRoutes.delete("/api/v1/users/me/account", requireAuth, deleteMyAccount);
