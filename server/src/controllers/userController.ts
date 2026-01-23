import { Response } from "express";
import { AuthRequest } from "../middlewares/auth";
import { getUserWithRelations, updateProfile } from "../services/userService";
import { profileSchema } from "../validators/profile";

export const getMe = async (req: AuthRequest, res: Response) => {
  const user = await getUserWithRelations(req.user!.id);
  return res.json(user);
};

export const updateMeProfile = async (req: AuthRequest, res: Response) => {
  const payload = profileSchema.parse(req.body);
  const profile = await updateProfile(req.user!.id, payload);
  return res.json(profile);
};
