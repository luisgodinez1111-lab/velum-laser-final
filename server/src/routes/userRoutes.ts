import { Router } from "express";
import { getMe, updateMeProfile } from "../controllers/userController";
import { requireAuth } from "../middlewares/auth";

export const userRoutes = Router();

userRoutes.get("/me", requireAuth, getMe);
userRoutes.put("/me/profile", requireAuth, updateMeProfile);
