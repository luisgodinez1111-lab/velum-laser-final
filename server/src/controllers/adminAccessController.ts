import { Response } from "express";
import bcrypt from "bcryptjs";
import type { Role } from "@prisma/client";
import { prisma } from "../db/prisma";
import { AuthRequest } from "../middlewares/auth";
import { createAuditLog } from "../services/auditService";
import { generateTotpSecret, verifyTotpCode, getTotpUri } from "../utils/totp";
import {
  PERMISSIONS_CATALOG,
  readAccessStore,
  getEffectivePermissions,
  setUserPermissions,
  defaultPermissionsByRole,
} from "../services/adminAccessService";
import { stripe } from "../services/stripeService";
import { sendDeleteUserOtpEmail, sendAdminInvitationEmail } from "../services/emailService";
import { onNewMember, invalidateAdminIdCache } from "../services/notificationService";
import { logger } from "../utils/logger";
import { revokeAllRefreshTokens, hashPassword, validatePasswordStrength, generateTempPassword } from "../utils/auth";
import { generateOtp } from "../utils/crypto";
import { clean, validEmail } from "../utils/strings";
import { parsePagination } from "../utils/pagination";
import { resolveClinicId } from "../utils/resolveClinicId";

const MAX_OTP_ATTEMPTS = 5;
const roleAllowed = new Set(["admin", "staff", "member"]);

async function pruneExpiredOtps(): Promise<void> {
  await prisma.deleteOtp.deleteMany({ where: { expiresAt: { lt: new Date() } } });
}

/** GET /api/v1/me/totp/setup — genera secreto temporal (no lo guarda aún) */
export const getTotpSetup = async (req: AuthRequest, res: Response) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ message: "No autorizado" });
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true, totpEnabled: true } });
  if (!user) return res.status(404).json({ message: "Usuario no encontrado" });
  if (user.totpEnabled) return res.status(409).json({ message: "2FA ya está habilitado" });
  const secret = generateTotpSecret();
  const uri = getTotpUri(secret, user.email);
  // Almacena secreto temporal para verificación — se activa solo tras confirmar
  await prisma.user.update({ where: { id: userId }, data: { totpSecret: secret } });
  return res.json({ secret, uri });
};

/** POST /api/v1/me/totp/enable — activa 2FA tras verificar el primer código */
export const enableTotp = async (req: AuthRequest, res: Response) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ message: "No autorizado" });
  const code = String(req.body?.code ?? "").trim();
  if (!code) return res.status(400).json({ message: "Código requerido" });
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { totpSecret: true, totpEnabled: true } });
  if (!user?.totpSecret) return res.status(400).json({ message: "Inicia el setup primero con GET /totp/setup" });
  if (user.totpEnabled) return res.status(409).json({ message: "2FA ya está habilitado" });
  if (!verifyTotpCode(user.totpSecret, code)) return res.status(400).json({ message: "Código incorrecto" });
  await prisma.user.update({ where: { id: userId }, data: { totpEnabled: true } });
  await createAuditLog({ userId, actorUserId: userId, action: "auth.totp_enabled", resourceType: "user", resourceId: userId, ip: req.ip, metadata: {} });
  return res.json({ message: "2FA activado correctamente" });
};

/** DELETE /api/v1/me/totp — desactiva 2FA (requiere código válido) */
export const disableTotp = async (req: AuthRequest, res: Response) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ message: "No autorizado" });
  const code = String(req.body?.code ?? "").trim();
  if (!code) return res.status(400).json({ message: "Código requerido para desactivar 2FA" });
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { totpSecret: true, totpEnabled: true } });
  if (!user?.totpEnabled || !user.totpSecret) return res.status(400).json({ message: "2FA no está habilitado" });
  if (!verifyTotpCode(user.totpSecret, code)) return res.status(400).json({ message: "Código incorrecto" });
  await prisma.user.update({ where: { id: userId }, data: { totpEnabled: false, totpSecret: null } });
  await createAuditLog({ userId, actorUserId: userId, action: "auth.totp_disabled", resourceType: "user", resourceId: userId, ip: req.ip, metadata: {} });
  return res.json({ message: "2FA desactivado" });
};

export const listAdminAccessUsers = async (req: AuthRequest, res: Response) => {
  try {
    const { page, limit, skip } = parsePagination(req.query as Record<string, unknown>, { maxLimit: 200, defaultLimit: 100 });

    const [total, users] = await Promise.all([
      prisma.user.count({ where: { deletedAt: null } }),
      prisma.user.findMany({
        where: { deletedAt: null },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
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
      }),
    ]);

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
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
    });
  } catch (error: unknown) {
    logger.error({ err: error }, "listAdminAccessUsers");
    return res.status(500).json({ message: "Error interno del servidor" });
  }
};

export const createAdminAccessUser = async (req: AuthRequest, res: Response) => {
  try {

    const body = req.body as Record<string, unknown>;
    const email = clean(body?.email).toLowerCase();
    const role = clean(body?.role) || "staff";
    const incomingPerms = body?.permissions;

    if (!validEmail(email)) return res.status(400).json({ message: "Correo inválido" });
    if (!roleAllowed.has(role)) return res.status(400).json({ message: "Rol inválido" });

    // For admin/staff: auto-generate temp password and send email
    // For member: require password from form
    const isAdminOrStaff = role === "admin" || role === "staff";
    let password: string;
    let mustChangePassword = false;

    if (isAdminOrStaff) {
      password = generateTempPassword();
      mustChangePassword = true;
    } else {
      password = clean(body?.password);
      const strengthError = validatePasswordStrength(password);
      if (strengthError) return res.status(400).json({ message: strengthError });
    }

    const actor = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: { clinicId: true, email: true, profile: { select: { firstName: true, lastName: true } } },
    });
    const clinicId = await resolveClinicId(actor?.clinicId);
    if (!clinicId) return res.status(400).json({ message: "No se pudo resolver clinicId" });

    const exists = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (exists) return res.status(409).json({ message: "Ya existe un usuario con ese correo" });

    const passwordHash = await hashPassword(password);

    const created = await prisma.user.create({
      data: {
        email,
        passwordHash,
        role: role as Role,
        clinicId,
        emailVerifiedAt: new Date(),
        mustChangePassword,
      },
      select: { id: true, email: true, role: true, createdAt: true },
    });

    if (isAdminOrStaff) {
      const perms = Array.isArray(incomingPerms) && incomingPerms.length > 0
        ? incomingPerms
        : defaultPermissionsByRole(role);
      await setUserPermissions(created.id, perms);

      const actorName = actor
        ? [actor.profile?.firstName, actor.profile?.lastName].filter(Boolean).join(" ") || actor.email
        : "El administrador";

      sendAdminInvitationEmail(email, {
        invitedBy: actorName,
        role,
        tempPassword: password,
      }).catch((err: unknown) => {
        logger.warn({ err, email }, "[admin] No se pudo enviar correo de invitación");
      });
    }

    if (role === "member") {
      onNewMember({
        userId: created.id,
        userEmail: created.email,
        userName: created.email,
      }).catch((err: unknown) => logger.warn({ err }, "[admin-access] new_member notification failed"));
    }

    await createAuditLog({
      userId: req.user!.id,
      targetUserId: created.id,
      action: "admin.user.create",
      resourceType: "user",
      resourceId: created.id,
      ip: req.ip,
      metadata: { email, role, inviteEmailSent: isAdminOrStaff }
    });

    return res.status(201).json({
      message: isAdminOrStaff
        ? `Usuario creado. Se envió correo con credenciales a ${email}.`
        : "Usuario creado",
      user: created,
      inviteEmailSent: isAdminOrStaff,
    });
  } catch (error: unknown) {
    logger.error({ err: error }, "createAdminAccessUser");
    return res.status(500).json({ message: "Error interno del servidor" });
  }
};

export const updateAdminAccessUser = async (req: AuthRequest, res: Response) => {
  try {

    const userId = clean(req.params.userId);
    const updateBody = req.body as Record<string, unknown>;
    const nextRoleRaw = clean(updateBody?.role);
    const incomingPerms = updateBody?.permissions;

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
      data: { role: nextRole, passwordChangedAt: new Date() },
      select: { id: true, email: true, role: true, createdAt: true },
    });

    // Invalidate all existing sessions so the new role takes effect immediately
    if (nextRoleRaw && nextRole !== current.role) {
      await revokeAllRefreshTokens(userId).catch((err: unknown) =>
        logger.warn({ err }, "[admin-access] Failed to revoke refresh tokens on role change")
      );
    }

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
  } catch (error: unknown) {
    logger.error({ err: error }, "updateAdminAccessUser");
    return res.status(500).json({ message: "Error interno del servidor" });
  }
};

export const resetAdminAccessPassword = async (req: AuthRequest, res: Response) => {
  try {
    const userId = clean(req.params.userId);
    const newPassword = clean((req.body as Record<string, unknown>)?.newPassword);

    const strengthError = validatePasswordStrength(newPassword);
    if (strengthError) return res.status(400).json({ message: strengthError });

    const found = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!found) return res.status(404).json({ message: "Usuario no encontrado" });

    const passwordHash = await hashPassword(newPassword);
    await prisma.user.update({ where: { id: userId }, data: { passwordHash, passwordChangedAt: new Date(), mustChangePassword: true } });

    // Revoke all sessions so the new password takes effect immediately
    await revokeAllRefreshTokens(userId).catch((err: unknown) =>
      logger.warn({ err }, "[admin-access] Failed to revoke refresh tokens on password reset")
    );

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
  } catch (error: unknown) {
    logger.error({ err: error }, "resetAdminAccessPassword");
    return res.status(500).json({ message: "Error interno del servidor" });
  }
};

// ── Deactivate user (cancel Stripe + block login) ──────────────────────────
export const deactivateUser = async (req: AuthRequest, res: Response) => {
  try {

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
      } catch (stripeErr: unknown) {
        if ((stripeErr as { code?: string })?.code !== "resource_missing") {
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
    invalidateAdminIdCache(); // deactivated user may have been admin/staff

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
  } catch (error: unknown) {
    logger.error({ err: error }, "deactivateUser");
    return res.status(500).json({ message: "Error interno del servidor" });
  }
};

// ── Activate user (re-enable login) ────────────────────────────────────────
export const activateUser = async (req: AuthRequest, res: Response) => {
  try {

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
    invalidateAdminIdCache(); // reactivated user may be admin/staff

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
  } catch (error: unknown) {
    logger.error({ err: error }, "activateUser");
    return res.status(500).json({ message: "Error interno del servidor" });
  }
};

// ── OTP request for user deletion (sent via email to the acting admin) ─────
export const requestDeleteUserOtp = async (req: AuthRequest, res: Response) => {
  try {

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
    } catch (emailErr: unknown) {
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
  } catch (error: unknown) {
    logger.error({ err: error }, "[adminAccess] requestDeleteUserOtp");
    return res.status(500).json({ message: "Error interno del servidor" });
  }
};

// ── Delete user with OTP verification ──────────────────────────────────────
export const deleteUser = async (req: AuthRequest, res: Response) => {
  try {

    const actorId = req.user!.id;
    const targetUserId = clean(req.params.userId);
    const otpInput = clean((req.body as Record<string, unknown>)?.otp);

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
      } catch (stripeErr: unknown) {
        if ((stripeErr as { code?: string })?.code !== "resource_missing") {
          // Log but don't block deletion
        }
      }
    }

    // Cancel Stripe subscriptions from RECURRING custom charges (avoid ghost subscriptions)
    const recurringCharges = await prisma.customCharge.findMany({
      where: { userId: targetUserId, type: "RECURRING", stripeSubscriptionId: { not: null } },
      select: { id: true, stripeSubscriptionId: true },
      take: 500,
    });
    for (const rc of recurringCharges) {
      if (rc.stripeSubscriptionId) {
        try {
          await stripe.subscriptions.cancel(rc.stripeSubscriptionId);
        } catch (stripeErr: unknown) {
          if ((stripeErr as { code?: string })?.code !== "resource_missing") {
            logger.warn({ subscriptionId: rc.stripeSubscriptionId }, "[delete-user] Failed to cancel recurring custom charge subscription");
          }
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

    // Soft delete: mark user as deleted instead of hard-deleting
    await prisma.user.update({
      where: { id: targetUserId },
      data: {
        deletedAt: new Date(),
        deletedBy: actorId,
        isActive: false,
      },
    });

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
  } catch (error: unknown) {
    logger.error({ err: error }, "[adminAccess] deleteUser");
    return res.status(500).json({ message: "Error interno del servidor" });
  }
};
