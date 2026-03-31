import { Router } from "express";
import { getMe, updateMeProfile } from "../controllers/userController";
import { requireAuth } from "../middlewares/auth";

export const userRoutes = Router();

userRoutes.get("/users/me", requireAuth, getMe);
userRoutes.put("/users/me/profile", requireAuth, updateMeProfile);
