import { NextFunction, Request, Response } from "express";
import { verifyToken } from "../utils/auth";
import { env } from "../utils/env";
import { prisma } from "../db/prisma";

export type AuthRequest = Request & { user?: { id: string; role: string } };

const getToken = (req: Request) => req.cookies?.[env.cookieName] ?? req.headers.authorization?.replace("Bearer ", "");

export const requireAuth = async (req: AuthRequest, res: Response, next: NextFunction) => {
  const token = getToken(req);
  if (!token) {
    return res.status(401).json({ message: "No autorizado" });
  }

  try {
    const payload = verifyToken(token);

    // Invalidate tokens issued before the last password change
    if (payload.iat !== undefined) {
      const user = await prisma.user.findUnique({
        where: { id: payload.sub },
        select: { passwordChangedAt: true, isActive: true }
      });
      if (!user || user.isActive === false) {
        return res.status(401).json({ message: "No autorizado" });
      }
      if (user.passwordChangedAt) {
        const changedAtSec = Math.floor(user.passwordChangedAt.getTime() / 1000);
        if (payload.iat < changedAtSec) {
          return res.status(401).json({ message: "Sesión expirada. Inicia sesión de nuevo." });
        }
      }
    }

    req.user = { id: payload.sub, role: payload.role };
    return next();
  } catch {
    return res.status(401).json({ message: "Token inválido" });
  }
};

export const optionalAuth = async (req: AuthRequest, _res: Response, next: NextFunction) => {
  const token = getToken(req);

  if (!token) {
    return next();
  }

  try {
    const payload = verifyToken(token);

    if (payload.iat !== undefined) {
      const user = await prisma.user.findUnique({
        where: { id: payload.sub },
        select: { passwordChangedAt: true, isActive: true }
      });
      if (!user || user.isActive === false) {
        req.user = undefined;
        return next();
      }
      if (user.passwordChangedAt) {
        const changedAtSec = Math.floor(user.passwordChangedAt.getTime() / 1000);
        if (payload.iat < changedAtSec) {
          req.user = undefined;
          return next();
        }
      }
    }

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
