import { Response } from "express";
import bcrypt from "bcryptjs";
import { prisma } from "../db/prisma";
import { AuthRequest } from "../middlewares/auth";
import { createAuditLog } from "../services/auditService";
import {
  PERMISSIONS_CATALOG,
  readAccessStore,
  getEffectivePermissions,
  setUserPermissions,
  defaultPermissionsByRole,
} from "../services/adminAccessService";

const isAdminUser = (req: AuthRequest) => {
  const role = req.user?.role ?? "";
  return role === "admin" || role === "system";
};

const clean = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const validEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
const roleAllowed = new Set(["admin", "staff", "member"]);

export const listAdminAccessUsers = async (req: AuthRequest, res: Response) => {
  try {
    if (!isAdminUser(req)) return res.status(403).json({ message: "No autorizado" });

    const users = await prisma.user.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        email: true,
        role: true,
        createdAt: true,
        emailVerifiedAt: true,
      },
    });

    const store = await readAccessStore();

    const rows = users.map((u) => ({
      id: u.id,
      email: u.email,
      role: u.role,
      kind: u.role === "member" ? "paciente" : "administrativo",
      createdAt: u.createdAt,
      emailVerifiedAt: u.emailVerifiedAt,
      permissions: getEffectivePermissions(store, u.id, u.role),
    }));

    return res.json({
      users: rows,
      permissionsCatalog: PERMISSIONS_CATALOG,
    });
  } catch (error: any) {
    console.error("listAdminAccessUsers error:", error);
    return res.status(500).json({ message: "Error al listar usuarios", detail: error?.message ?? "unknown" });
  }
};

export const createAdminAccessUser = async (req: AuthRequest, res: Response) => {
  try {
    if (!isAdminUser(req)) return res.status(403).json({ message: "No autorizado" });

    const email = clean((req.body as any)?.email).toLowerCase();
    const password = clean((req.body as any)?.password);
    const role = clean((req.body as any)?.role) || "staff";
    const incomingPerms = (req.body as any)?.permissions;

    if (!validEmail(email)) return res.status(400).json({ message: "Correo inválido" });
    if (password.length < 8) return res.status(400).json({ message: "La contraseña debe tener al menos 8 caracteres" });
    if (!roleAllowed.has(role)) return res.status(400).json({ message: "Rol inválido" });

    const actor = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: { clinicId: true },
    });
    const seed = await prisma.user.findFirst({ select: { clinicId: true } });
    const clinicId = actor?.clinicId || seed?.clinicId;

    if (!clinicId) return res.status(400).json({ message: "No se pudo resolver clinicId" });

    const exists = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (exists) return res.status(409).json({ message: "Ya existe un usuario con ese correo" });

    const passwordHash = await bcrypt.hash(password, 10);

    const created = await prisma.user.create({
      data: {
        email,
        passwordHash,
        role: role as any,
        clinicId,
        emailVerifiedAt: new Date(),
      },
      select: { id: true, email: true, role: true, createdAt: true },
    });

    if (role === "admin" || role === "staff") {
      const perms = Array.isArray(incomingPerms) && incomingPerms.length > 0
        ? incomingPerms
        : defaultPermissionsByRole(role);
      await setUserPermissions(created.id, perms);
    }

    return res.status(201).json({
      message: "Usuario creado",
      user: created,
    });
  } catch (error: any) {
    console.error("createAdminAccessUser error:", error);
    return res.status(500).json({ message: "Error al crear usuario", detail: error?.message ?? "unknown" });
  }
};

export const updateAdminAccessUser = async (req: AuthRequest, res: Response) => {
  try {
    if (!isAdminUser(req)) return res.status(403).json({ message: "No autorizado" });

    const userId = clean(req.params.userId);
    const nextRoleRaw = clean((req.body as any)?.role);
    const incomingPerms = (req.body as any)?.permissions;

    const current = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true, email: true },
    });
    if (!current) return res.status(404).json({ message: "Usuario no encontrado" });

    let nextRole = current.role;
    if (nextRoleRaw) {
      if (!roleAllowed.has(nextRoleRaw)) return res.status(400).json({ message: "Rol inválido" });
      nextRole = nextRoleRaw as any;
    }

    const updated = await prisma.user.update({
      where: { id: userId },
      data: { role: nextRole },
      select: { id: true, email: true, role: true, createdAt: true },
    });

    if (nextRole === "admin" || nextRole === "staff") {
      if (Array.isArray(incomingPerms)) {
        await setUserPermissions(userId, incomingPerms);
      } else if (nextRoleRaw) {
        await setUserPermissions(userId, defaultPermissionsByRole(nextRole));
      }
    }

    await createAuditLog({
      userId: req.user!.id,
      targetUserId: userId,
      action: "admin.user.update",
      resourceType: "user",
      resourceId: userId,
      ip: req.ip,
      metadata: { newRole: nextRole, permissionsUpdated: Array.isArray(incomingPerms) }
    });

    return res.json({
      message: "Usuario actualizado",
      user: updated,
    });
  } catch (error: any) {
    console.error("updateAdminAccessUser error:", error);
    return res.status(500).json({ message: "Error al actualizar usuario", detail: error?.message ?? "unknown" });
  }
};

export const resetAdminAccessPassword = async (req: AuthRequest, res: Response) => {
  try {
    if (!isAdminUser(req)) return res.status(403).json({ message: "No autorizado" });

    const userId = clean(req.params.userId);
    const newPassword = clean((req.body as any)?.newPassword);

    if (newPassword.length < 8) {
      return res.status(400).json({ message: "La contraseña debe tener al menos 8 caracteres" });
    }

    const found = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!found) return res.status(404).json({ message: "Usuario no encontrado" });

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({ where: { id: userId }, data: { passwordHash } });

    await createAuditLog({
      userId: req.user!.id,
      targetUserId: userId,
      action: "admin.user.password_reset",
      resourceType: "user",
      resourceId: userId,
      ip: req.ip,
      metadata: { resetBy: req.user!.id }
    });

    return res.json({ message: "Contraseña actualizada" });
  } catch (error: any) {
    console.error("resetAdminAccessPassword error:", error);
    return res.status(500).json({ message: "Error al actualizar contraseña", detail: error?.message ?? "unknown" });
  }
};
