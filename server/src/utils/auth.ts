import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { env } from "./env";

export const hashPassword = async (password: string) => bcrypt.hash(password, 12);
export const verifyPassword = async (password: string, hash: string) => bcrypt.compare(password, hash);

export const signToken = (payload: object) =>
  jwt.sign(payload, env.jwtSecret, { expiresIn: env.jwtExpiresIn as jwt.SignOptions["expiresIn"] });

export const verifyToken = (token: string) => jwt.verify(token, env.jwtSecret) as {
  sub: string;
  role: string;
};
