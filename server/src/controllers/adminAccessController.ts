import { Response } from "express";
import bcrypt from "bcryptjs";
import crypto from "crypto";
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

// ── In-memory OTP store for user-deletion confirmation ─────────────────────
// Key: actorUserId  Value: { otp, targetUserId, expiresAt }
// TTL: 10 minutes — single-process safe, no DB migration required
type DeleteOtpEntry = { otp: string; targetUserId: string; expiresAt: Date };
const deleteOtpStore = new Map<string, DeleteOtpEntry>();

function generateOtp(): string {
  return String(100000 + (crypto.randomInt(900000)));
}

function pruneExpiredOtps(): void {
  const now = new Date();
  for (const [key, entry] of deleteOtpStore.entries()) {
    if (entry.expiresAt < now) deleteOtpStore.delete(key);
  }
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
          console.error("Stripe cancel on deactivate:", stripeErr?.message);
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
    console.error("deactivateUser error:", error);
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
    console.error("activateUser error:", error);
    return res.status(500).json({ message: "Error al activar usuario", detail: error?.message ?? "unknown" });
  }
};

// ── OTP request for user deletion ──────────────────────────────────────────
export const requestDeleteUserOtp = async (req: AuthRequest, res: Response) => {
  try {
    if (!isAdminUser(req)) return res.status(403).json({ message: "No autorizado" });

    const actorId = req.user!.id;
    const targetUserId = clean(req.params.userId);

    if (actorId === targetUserId) {
      return res.status(400).json({ message: "No puedes eliminar tu propia cuenta" });
    }

    const target = await prisma.user.findUnique({
      where: { id: targetUserId },
      select: { id: true, email: true, role: true },
    });
    if (!target) return res.status(404).json({ message: "Usuario no encontrado" });

    // Fetch actor profile to get phone for WhatsApp OTP
    const actorProfile = await prisma.profile.findUnique({
      where: { userId: actorId },
      select: { phone: true },
    });

    const otp = generateOtp();
    pruneExpiredOtps();

    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 min
    deleteOtpStore.set(actorId, { otp, targetUserId, expiresAt });

    const cfg = await getEffectiveWhatsappMetaConfig();
    const phone = actorProfile?.phone ? normalizePhone(actorProfile.phone) : "";

    if (phone) {
      await sendWhatsappOtpCode(phone, otp, cfg);
    } else if (cfg.allowConsole) {
      console.log(`[DELETE_USER_OTP] actor=${actorId} target=${targetUserId} otp=${otp}`);
    } else {
      deleteOtpStore.delete(actorId);
      return res.status(400).json({
        message: "No tienes un teléfono registrado en tu perfil para recibir el código OTP. Regístralo en tu perfil e intenta de nuevo.",
      });
    }

    return res.json({
      message: phone
        ? `Código OTP enviado al número ${phone.slice(0, 4)}****${phone.slice(-4)} via WhatsApp`
        : "Código OTP generado (modo desarrollo — revisa consola del servidor)",
      targetEmail: target.email,
      targetRole: target.role,
      expiresInMinutes: 10,
    });
  } catch (error: any) {
    console.error("requestDeleteUserOtp error:", error);
    return res.status(500).json({ message: "Error al enviar OTP", detail: error?.message ?? "unknown" });
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

    // Verify OTP
    pruneExpiredOtps();
    const entry = deleteOtpStore.get(actorId);
    if (!entry) {
      return res.status(400).json({ message: "No hay un código OTP activo. Solicita uno nuevo." });
    }
    if (entry.expiresAt < new Date()) {
      deleteOtpStore.delete(actorId);
      return res.status(400).json({ message: "El código OTP ha expirado. Solicita uno nuevo." });
    }
    if (entry.targetUserId !== targetUserId) {
      return res.status(400).json({ message: "El OTP no corresponde al usuario seleccionado." });
    }
    if (entry.otp !== otpInput) {
      return res.status(400).json({ message: "Código OTP incorrecto" });
    }

    // Confirm target still exists
    const target = await prisma.user.findUnique({
      where: { id: targetUserId },
      select: { id: true, email: true, role: true },
    });
    if (!target) {
      deleteOtpStore.delete(actorId);
      return res.status(404).json({ message: "Usuario no encontrado" });
    }

    // Cancel Stripe subscription BEFORE deleting (avoids orphaned active subscriptions)
    const membership = await prisma.membership.findUnique({
      where: { userId: targetUserId },
      select: { stripeSubscriptionId: true },
    });
    if (membership?.stripeSubscriptionId) {
      try {
        await stripe.subscriptions.cancel(membership.stripeSubscriptionId);
      } catch (stripeErr: any) {
        // If already canceled or not found in Stripe, continue with DB deletion
        if (stripeErr?.code !== "resource_missing") {
          console.error("Stripe cancel error on user delete:", stripeErr?.message);
        }
      }
    }

    // Reassign Restrict FK relations to the acting admin before deleting
    // (Appointment.createdByUserId and SessionTreatment.staffUserId have onDelete: Restrict)
    await prisma.appointment.updateMany({
      where: { createdByUserId: targetUserId },
      data: { createdByUserId: actorId },
    });
    await prisma.sessionTreatment.updateMany({
      where: { staffUserId: targetUserId },
      data: { staffUserId: actorId },
    });

    // Delete the user (cascades: Membership, Document, MedicalIntake, Appointment as member,
    // Payment, EmailVerificationToken, PasswordResetToken, Profile, etc.)
    await prisma.user.delete({ where: { id: targetUserId } });

    deleteOtpStore.delete(actorId);

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
    console.error("deleteUser error:", error);
    return res.status(500).json({ message: "Error al eliminar usuario", detail: error?.message ?? "unknown" });
  }
};
