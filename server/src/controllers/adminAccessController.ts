import { Response } from "express";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import type { Role } from "@prisma/client";
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
import { sendWhatsappOtpCode, getEffectiveWhatsappMetaConfig, normalizePhone } from "../services/whatsappMetaService";
import { stripe } from "../services/stripeService";
import { sendDeleteUserOtpEmail } from "../services/emailService";
import { logger } from "../utils/logger";

const MAX_OTP_ATTEMPTS = 5;

function generateOtp(): string {
  return String(100000 + crypto.randomInt(900000));
}

async function pruneExpiredOtps(): Promise<void> {
  await prisma.deleteOtp.deleteMany({ where: { expiresAt: { lt: new Date() } } });
}

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
        isActive: true,
        deactivatedAt: true,
        createdAt: true,
        emailVerifiedAt: true,
        memberships: { select: { stripeSubscriptionId: true, status: true } },
      },
    });

    const store = await readAccessStore();

    const rows = users.map((u) => ({
      id: u.id,
      email: u.email,
      role: u.role,
      isActive: u.isActive,
      deactivatedAt: u.deactivatedAt,
      kind: u.role === "member" ? "paciente" : "administrativo",
      createdAt: u.createdAt,
      emailVerifiedAt: u.emailVerifiedAt,
      membershipStatus: u.memberships[0]?.status ?? null,
      permissions: getEffectivePermissions(store, u.id, u.role),
    }));

    return res.json({
      users: rows,
      permissionsCatalog: PERMISSIONS_CATALOG,
    });
  } catch (error: any) {
    logger.error({ err: error }, "listAdminAccessUsers");
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
        role: role as Role,
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
    logger.error({ err: error }, "createAdminAccessUser");
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
      nextRole = nextRoleRaw as Role;
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
    logger.error({ err: error }, "updateAdminAccessUser");
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
    await prisma.user.update({ where: { id: userId }, data: { passwordHash, passwordChangedAt: new Date() } });

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
    logger.error({ err: error }, "resetAdminAccessPassword");
    return res.status(500).json({ message: "Error al actualizar contraseña", detail: error?.message ?? "unknown" });
  }
};

// ── Deactivate user (cancel Stripe + block login) ──────────────────────────
export const deactivateUser = async (req: AuthRequest, res: Response) => {
  try {
    if (!isAdminUser(req)) return res.status(403).json({ message: "No autorizado" });

    const actorId = req.user!.id;
    const targetUserId = clean(req.params.userId);

    if (actorId === targetUserId) {
      return res.status(400).json({ message: "No puedes desactivar tu propia cuenta" });
    }

    const target = await prisma.user.findUnique({
      where: { id: targetUserId },
      select: { id: true, email: true, role: true, isActive: true, memberships: { select: { stripeSubscriptionId: true, status: true } } },
    });
    if (!target) return res.status(404).json({ message: "Usuario no encontrado" });
    if (!target.isActive) return res.status(409).json({ message: "El usuario ya está desactivado" });

    // Cancel Stripe subscription if active
    const sub = target.memberships[0];
    let stripeCanceled = false;
    if (sub?.stripeSubscriptionId && sub.status === "active") {
      try {
        await stripe.subscriptions.cancel(sub.stripeSubscriptionId);
        stripeCanceled = true;
      } catch (stripeErr: any) {
        if (stripeErr?.code !== "resource_missing") {
          logger.warn({ err: stripeErr }, "Stripe cancel on deactivate");
        }
      }
    }

    // Update membership status in DB
    if (sub?.stripeSubscriptionId) {
      await prisma.membership.updateMany({
        where: { userId: targetUserId },
        data: { status: "canceled" },
      });
    }

    // Mark user as inactive
    await prisma.user.update({
      where: { id: targetUserId },
      data: { isActive: false, deactivatedAt: new Date() },
    });

    await createAuditLog({
      userId: actorId,
      actorUserId: actorId,
      targetUserId,
      action: "admin.user.deactivate",
      resourceType: "user",
      resourceId: targetUserId,
      ip: req.ip,
      metadata: { targetEmail: target.email, stripeCanceled },
    });

    return res.json({
      message: `Usuario ${target.email} desactivado${stripeCanceled ? " y suscripción de Stripe cancelada" : ""}`,
      stripeCanceled,
    });
  } catch (error: any) {
    logger.error({ err: error }, "deactivateUser");
    return res.status(500).json({ message: "Error al desactivar usuario", detail: error?.message ?? "unknown" });
  }
};

// ── Activate user (re-enable login) ────────────────────────────────────────
export const activateUser = async (req: AuthRequest, res: Response) => {
  try {
    if (!isAdminUser(req)) return res.status(403).json({ message: "No autorizado" });

    const actorId = req.user!.id;
    const targetUserId = clean(req.params.userId);

    const target = await prisma.user.findUnique({
      where: { id: targetUserId },
      select: { id: true, email: true, isActive: true },
    });
    if (!target) return res.status(404).json({ message: "Usuario no encontrado" });
    if (target.isActive) return res.status(409).json({ message: "El usuario ya está activo" });

    await prisma.user.update({
      where: { id: targetUserId },
      data: { isActive: true, deactivatedAt: null },
    });

    await createAuditLog({
      userId: actorId,
      actorUserId: actorId,
      targetUserId,
      action: "admin.user.activate",
      resourceType: "user",
      resourceId: targetUserId,
      ip: req.ip,
      metadata: { targetEmail: target.email },
    });

    return res.json({ message: `Usuario ${target.email} activado. Deberá iniciar sesión nuevamente.` });
  } catch (error: any) {
    logger.error({ err: error }, "activateUser");
    return res.status(500).json({ message: "Error al activar usuario", detail: error?.message ?? "unknown" });
  }
};

// ── OTP request for user deletion (sent via email to the acting admin) ─────
export const requestDeleteUserOtp = async (req: AuthRequest, res: Response) => {
  try {
    if (!isAdminUser(req)) return res.status(403).json({ message: "No autorizado" });

    const actorId = req.user!.id;
    const targetUserId = clean(req.params.userId);

    if (actorId === targetUserId) {
      return res.status(400).json({ message: "No puedes eliminar tu propia cuenta" });
    }

    const [target, actor] = await Promise.all([
      prisma.user.findUnique({ where: { id: targetUserId }, select: { id: true, email: true, role: true } }),
      prisma.user.findUnique({ where: { id: actorId }, select: { id: true, email: true } }),
    ]);

    if (!target) return res.status(404).json({ message: "Usuario no encontrado" });
    if (!actor)  return res.status(404).json({ message: "Admin no encontrado" });

    const otp = generateOtp();
    const otpHash = await bcrypt.hash(otp, 10);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 min

    await pruneExpiredOtps();

    // Upsert: one pending OTP per actor at a time, resets attempt counter
    await prisma.deleteOtp.upsert({
      where: { actorUserId: actorId },
      create: { actorUserId: actorId, targetUserId, otpHash, expiresAt },
      update: { targetUserId, otpHash, expiresAt, attempts: 0 },
    });

    try {
      await sendDeleteUserOtpEmail(actor.email, {
        adminEmail: actor.email,
        targetEmail: target.email,
        otp,
      });
    } catch (emailErr: any) {
      await prisma.deleteOtp.delete({ where: { actorUserId: actorId } }).catch(() => {});
      return res.status(502).json({ message: "No se pudo enviar el correo de autorización. Verifica la configuración de Resend." });
    }

    const [localPart, domain] = actor.email.split("@");
    const maskedEmail = `${localPart.slice(0, 2)}***@${domain}`;

    return res.json({
      message: `Código de autorización enviado a ${maskedEmail}. Válido por 10 minutos.`,
      targetEmail: target.email,
      targetRole: target.role,
      expiresInMinutes: 10,
    });
  } catch (error: any) {
    return res.status(500).json({ message: "Error al enviar código de autorización", detail: error?.message ?? "unknown" });
  }
};

// ── Delete user with OTP verification ──────────────────────────────────────
export const deleteUser = async (req: AuthRequest, res: Response) => {
  try {
    if (!isAdminUser(req)) return res.status(403).json({ message: "No autorizado" });

    const actorId = req.user!.id;
    const targetUserId = clean(req.params.userId);
    const otpInput = clean((req.body as any)?.otp);

    if (actorId === targetUserId) {
      return res.status(400).json({ message: "No puedes eliminar tu propia cuenta" });
    }
    if (!otpInput) return res.status(400).json({ message: "El código OTP es obligatorio" });

    await pruneExpiredOtps();

    const entry = await prisma.deleteOtp.findUnique({ where: { actorUserId: actorId } });
    if (!entry) {
      return res.status(400).json({ message: "No hay un código OTP activo. Solicita uno nuevo." });
    }
    if (entry.expiresAt < new Date()) {
      await prisma.deleteOtp.delete({ where: { actorUserId: actorId } }).catch(() => {});
      return res.status(400).json({ message: "El código OTP ha expirado. Solicita uno nuevo." });
    }
    if (entry.targetUserId !== targetUserId) {
      return res.status(400).json({ message: "El OTP no corresponde al usuario seleccionado." });
    }

    // Brute-force protection: max 5 attempts
    if (entry.attempts >= MAX_OTP_ATTEMPTS) {
      await prisma.deleteOtp.delete({ where: { actorUserId: actorId } }).catch(() => {});
      return res.status(429).json({ message: "Demasiados intentos incorrectos. Solicita un nuevo código OTP." });
    }

    const valid = await bcrypt.compare(otpInput, entry.otpHash);
    if (!valid) {
      await prisma.deleteOtp.update({
        where: { actorUserId: actorId },
        data: { attempts: { increment: 1 } },
      });
      const remaining = MAX_OTP_ATTEMPTS - (entry.attempts + 1);
      return res.status(400).json({
        message: remaining > 0
          ? `Código OTP incorrecto. Intentos restantes: ${remaining}`
          : "Código OTP incorrecto. Has agotado todos los intentos. Solicita uno nuevo.",
      });
    }

    // OTP valid — consume it immediately
    await prisma.deleteOtp.delete({ where: { actorUserId: actorId } }).catch(() => {});

    const target = await prisma.user.findUnique({
      where: { id: targetUserId },
      select: { id: true, email: true, role: true },
    });
    if (!target) return res.status(404).json({ message: "Usuario no encontrado" });

    // Cancel Stripe subscription before deleting
    const membership = await prisma.membership.findUnique({
      where: { userId: targetUserId },
      select: { stripeSubscriptionId: true },
    });
    if (membership?.stripeSubscriptionId) {
      try {
        await stripe.subscriptions.cancel(membership.stripeSubscriptionId);
      } catch (stripeErr: any) {
        if (stripeErr?.code !== "resource_missing") {
          // Log but don't block deletion
        }
      }
    }

    // Reassign Restrict FK relations before deleting
    await prisma.appointment.updateMany({
      where: { createdByUserId: targetUserId },
      data: { createdByUserId: actorId },
    });
    await prisma.sessionTreatment.updateMany({
      where: { staffUserId: targetUserId },
      data: { staffUserId: actorId },
    });

    await prisma.user.delete({ where: { id: targetUserId } });

    await createAuditLog({
      userId: actorId,
      actorUserId: actorId,
      action: "admin.user.delete",
      resourceType: "user",
      resourceId: targetUserId,
      ip: req.ip,
      metadata: {
        deletedEmail: target.email,
        deletedRole: target.role,
        deletedBy: actorId,
      },
    });

    return res.json({ message: `Usuario ${target.email} eliminado correctamente` });
  } catch (error: any) {
    return res.status(500).json({ message: "Error al eliminar usuario", detail: error?.message ?? "unknown" });
  }
};
