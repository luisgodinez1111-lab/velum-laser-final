import { NextFunction, Request, Response } from "express";
import { verifyToken } from "../utils/auth";
import { env } from "../utils/env";

export type AuthRequest = Request & { user?: { id: string; role: string } };

const getToken = (req: Request) => req.cookies?.[env.cookieName] ?? req.headers.authorization?.replace("Bearer ", "");

export const requireAuth = (req: AuthRequest, res: Response, next: NextFunction) => {
  const token = getToken(req);
  if (!token) {
    return res.status(401).json({ message: "No autorizado" });
  }

  try {
    const payload = verifyToken(token);
    req.user = { id: payload.sub, role: payload.role };
    return next();
  } catch {
    return res.status(401).json({ message: "Token inválido" });
  }
};

export const optionalAuth = (req: AuthRequest, _res: Response, next: NextFunction) => {
  const token = getToken(req);

  if (!token) {
    return next();
  }

  try {
    const payload = verifyToken(token);
    req.user = { id: payload.sub, role: payload.role };
  } catch {
    req.user = undefined;
  }

  return next();
};

export const requireRole = (roles: string[]) => (req: AuthRequest, res: Response, next: NextFunction) => {
  if (!req.user) {
    return res.status(401).json({ message: "No autorizado" });
  }
  if (!roles.includes(req.user.role)) {
    return res.status(403).json({ message: "Acceso denegado" });
  }
  return next();
};
