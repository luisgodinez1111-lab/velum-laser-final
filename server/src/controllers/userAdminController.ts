import { Response } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "../db/prisma";
import { AuthRequest } from "../middlewares/auth";
import { roleUpdateSchema } from "../validators/admin";
import { createAuditLog } from "../services/auditService";
import { readStripePlanCatalog, type StripePlanMapping } from "../services/stripePlanCatalogService";
import { sendPatientWelcomeEmail } from "../services/emailService";
import { onNewMember, invalidateAdminIdCache } from "../services/notificationService";
import { logger } from "../utils/logger";
import { hashPassword, generateTempPassword, revokeAllRefreshTokens } from "../utils/auth";
import { safeIp, queryParams } from "../utils/request";
import { clean, validEmail } from "../utils/strings";
import { parsePagination } from "../utils/pagination";
import { resolveClinicId } from "../utils/resolveClinicId";
import { escapeCsvField } from "../services/csvExportService";

// Construye Maps de catálogo para lookup O(1) en lugar de find() O(n×m)
const buildCatalogMaps = (catalog: StripePlanMapping[]) => ({
  byCode:    new Map(catalog.map((p) => [p.planCode, p])),
  byPriceId: new Map(catalog.map((p) => [p.stripePriceId, p])),
});

export const listUsers = async (req: AuthRequest, res: Response) => {
  const cursor  = clean(req.query.cursor);  // ID del último elemento visto
  const { page, limit, skip } = parsePagination(queryParams(req));
  const search  = String(req.query.search ?? "").trim();
  const roleFilter   = String(req.query.role   ?? "").trim();
  const statusFilter = String(req.query.status ?? "").trim();

  const where: Prisma.UserWhereInput = { deletedAt: null };
  if (search) {
    where.OR = [
      { email: { contains: search, mode: "insensitive" } },
      { profile: { firstName: { contains: search, mode: "insensitive" } } },
      { profile: { lastName:  { contains: search, mode: "insensitive" } } },
    ];
  }
  if (roleFilter && ["member", "staff", "admin", "system"].includes(roleFilter)) {
    where.role = roleFilter as Prisma.EnumRoleFilter;
  }
  if (statusFilter === "active") {
    where.memberships = { some: { status: "active" } };
  } else if (statusFilter === "inactive") {
    where.isActive = false;
  }

  // Cursor-based si se provee cursor (eficiente en tablas grandes), offset si no (compatibilidad)
  const [total, users, catalog] = await Promise.all([
    prisma.user.count({ where }),
    cursor
      ? prisma.user.findMany({
          where,
          include: { profile: true, memberships: true, documents: true, medicalIntake: { select: { status: true, submittedAt: true, approvedAt: true, rejectedAt: true, rejectionReason: true, phototype: true, consentAccepted: true, createdAt: true } } },
          orderBy: { createdAt: "desc" },
          cursor: { id: cursor },
          skip: 1,
          take: limit,
        })
      : prisma.user.findMany({
          where,
          include: { profile: true, memberships: true, documents: true, medicalIntake: { select: { status: true, submittedAt: true, approvedAt: true, rejectedAt: true, rejectionReason: true, phototype: true, consentAccepted: true, createdAt: true } } },
          orderBy: { createdAt: "desc" },
          skip,
          take: limit,
        }),
    readStripePlanCatalog().catch(() => []),
  ]);

  const { byCode, byPriceId } = buildCatalogMaps(catalog);
  const enriched = users.map((u) => {
    const ms = u.memberships[0];
    if (!ms) return u;
    const planCode = (ms.planId ?? "").toLowerCase();
    const catalogEntry = byCode.get(planCode) ?? byPriceId.get(ms.planId ?? "") ?? null;
    return {
      ...u,
      memberships: [{ ...ms, catalogEntry }],
    };
  });

  // nextCursor: ID del último elemento retornado; null si no hay más páginas
  const nextCursor = users.length === limit ? (users[users.length - 1]?.id ?? null) : null;

  return res.json({
    data: enriched,
    pagination: {
      page: cursor ? null : page,
      limit,
      total,
      pages: Math.ceil(total / limit),
    },
    nextCursor,
  });
};

export const getUserById = async (req: AuthRequest, res: Response) => {
  const { userId } = req.params;
  const [user, catalog] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      include: { profile: true, memberships: true, documents: true, medicalIntake: { select: { status: true, submittedAt: true, approvedAt: true, rejectedAt: true, rejectionReason: true, phototype: true, consentAccepted: true, createdAt: true } } },
    }),
    readStripePlanCatalog().catch(() => []),
  ]);
  if (!user) return res.status(404).json({ message: "Usuario no encontrado" });

  const ms = user.memberships[0];
  if (ms) {
    const { byCode, byPriceId } = buildCatalogMaps(catalog);
    const catalogEntry = byCode.get((ms.planId ?? "").toLowerCase()) ?? byPriceId.get(ms.planId ?? "") ?? null;
    return res.json({ ...user, memberships: [{ ...ms, catalogEntry }] });
  }
  return res.json(user);
};

export const getMemberHistory = async (req: AuthRequest, res: Response) => {
  const userId = req.params.userId;

  const [sessions, appointments, payments] = await Promise.all([
    prisma.sessionTreatment.findMany({
      where: { userId },
      include: {
        appointment: { select: { id: true, startAt: true, status: true } },
        staffUser: { select: { id: true, email: true, profile: { select: { firstName: true, lastName: true } } } },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    prisma.appointment.findMany({
      where: { userId },
      include: { treatment: { select: { name: true } } },
      orderBy: { startAt: "desc" },
      take: 50,
    }),
    prisma.payment.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
  ]);

  return res.json({ sessions, appointments, payments });
};

export const updateUserRole = async (req: AuthRequest, res: Response) => {
  const payload = roleUpdateSchema.parse(req.body);

  const targetUser = await prisma.user.findUnique({
    where: { id: req.params.userId },
    select: { id: true, email: true, role: true }
  });

  if (!targetUser) {
    return res.status(404).json({ message: "Usuario no encontrado" });
  }

  if (req.user?.id === targetUser.id && payload.role !== targetUser.role) {
    return res.status(409).json({ message: "No puedes cambiar tu propio rol" });
  }

  const actorRole = req.user?.role;
  const isSystemActor = actorRole === "system";

  if (!isSystemActor && (payload.role === "system" || targetUser.role === "system")) {
    return res.status(403).json({ message: "Solo system puede asignar o modificar rol system" });
  }

  if (payload.role === targetUser.role) {
    return res.json(targetUser);
  }

  const updated = await prisma.user.update({
    where: { id: targetUser.id },
    data: { role: payload.role, passwordChangedAt: new Date() },
    select: { id: true, email: true, role: true }
  });

  // Revoke all sessions so the new role is enforced immediately
  await revokeAllRefreshTokens(targetUser.id).catch((err: unknown) =>
    logger.warn({ err }, "[admin] Failed to revoke refresh tokens on role change")
  );
  // Invalidate admin ID cache so next notifyAdmins picks up the role change
  invalidateAdminIdCache();

  await createAuditLog({
    userId: req.user?.id,
    actorUserId: req.user?.id,
    targetUserId: targetUser.id,
    action: "user.role.update",
    resourceType: "user",
    resourceId: targetUser.id,
    ip: req.ip,
    metadata: { fromRole: targetUser.role, toRole: payload.role }
  });

  return res.json(updated);
};

export const createPatient = async (req: AuthRequest, res: Response) => {
  try {
    const email = clean(req.body?.email).toLowerCase();
    const firstName = clean(req.body?.firstName);
    const lastName  = clean(req.body?.lastName);
    const phone     = clean(req.body?.phone);
    const birthDate = clean(req.body?.birthDate); // YYYY-MM-DD
    const intake    = req.body?.intake ?? {};
    const planCode  = clean(req.body?.planCode);
    const activateMembership = Boolean(req.body?.activateMembership);
    const sendCredentials    = req.body?.sendCredentials !== false; // default true

    if (!validEmail(email)) return res.status(400).json({ message: "Correo inválido" });
    if (!firstName)         return res.status(400).json({ message: "Nombre requerido" });

    const exists = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (exists) return res.status(409).json({ message: "Ya existe un usuario con ese correo" });

    const actor = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: { clinicId: true, email: true, profile: { select: { firstName: true, lastName: true } } }
    });
    const clinicId = await resolveClinicId(actor?.clinicId);
    if (!clinicId) return res.status(400).json({ message: "No se pudo resolver clinicId" });

    const tempPassword = generateTempPassword();
    const passwordHash = await hashPassword(tempPassword);

    // Calcular intakeData antes de la transacción — depende solo de req.body
    const intakeData: Record<string, unknown> = {
      personalJson: intake.personalJson ?? {
        fullName: `${firstName} ${lastName}`.trim(),
        phone,
        birthDate
      },
      historyJson:     intake.historyJson     ?? undefined,
      phototype:       intake.phototype       ?? undefined,
      consentAccepted: intake.consentAccepted ?? false,
      signatureKey:    intake.signatureKey    ?? undefined,
    };
    const intakeStatus = intake.consentAccepted && intake.phototype ? 'submitted' : 'draft';
    intakeData.status = intakeStatus;
    if (intakeStatus === 'submitted') intakeData.submittedAt = new Date();

    // Crear user + profile + membership + medicalIntake + documents en una sola transacción atómica.
    // Si medicalIntake.update o membership.updateMany fallan, todo se revierte y el paciente no queda
    // en estado inconsistente (usuario sin expediente o sin plan).
    const created = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email,
          passwordHash,
          role: 'member',
          clinicId,
          emailVerifiedAt: new Date(),
          mustChangePassword: true,
          profile: {
            create: {
              firstName: firstName || undefined,
              lastName:  lastName  || undefined,
              phone:     phone     || undefined,
              ...(birthDate ? { birthDate: new Date(birthDate) } : {})
            }
          },
          memberships: { create: {} },
          medicalIntake: { create: { status: 'draft' } },
          documents: {
            create: [
              { type: 'informed_consent', version: '1.0' },
              { type: 'privacy_notice',   version: '1.0' },
              { type: 'medical_history',  version: '1.0' }
            ]
          }
        },
        select: { id: true, email: true, role: true, createdAt: true }
      });

      // Actualizar expediente con datos del intake — misma transacción
      await tx.medicalIntake.update({
        where: { userId: user.id },
        data: intakeData
      });

      // Activar membresía si se solicitó — misma transacción
      if (activateMembership && planCode) {
        await tx.membership.updateMany({
          where: { userId: user.id },
          data: { status: 'active', planCode, planId: planCode, source: 'admin' }
        });
      }

      return user;
    });

    // Send credentials email
    let inviteEmailSent = false;
    if (sendCredentials) {
      const actorName = actor
        ? [actor.profile?.firstName, actor.profile?.lastName].filter(Boolean).join(' ') || actor.email
        : 'El equipo Velum';
      const planLabel = planCode
        ? planCode.charAt(0).toUpperCase() + planCode.slice(1)
        : undefined;
      try {
        await sendPatientWelcomeEmail(email, {
          name: `${firstName} ${lastName}`.trim() || email,
          tempPassword,
          planName: activateMembership && planLabel ? `Plan ${planLabel}` : undefined,
          createdBy: actorName
        });
        inviteEmailSent = true;
      } catch (emailErr: unknown) {
        // Email failure should not block patient creation — log for ops visibility
        logger.warn({ err: emailErr, email }, "[admin] sendPatientWelcomeEmail failed");
      }
    }

    onNewMember({
      userId: created.id,
      userEmail: email,
      userName: `${firstName} ${lastName}`.trim() || email,
    }).catch((err: unknown) => logger.warn({ err }, "[admin] new_member notification failed"));

    await createAuditLog({
      userId: req.user!.id,
      targetUserId: created.id,
      action: 'admin.patient.create',
      resourceType: 'user',
      resourceId: created.id,
      ip: safeIp(req),
      metadata: { email, planCode, activateMembership, inviteEmailSent }
    });

    return res.status(201).json({
      message: `Paciente creado${inviteEmailSent ? '. Credenciales enviadas por correo.' : '.'}`,
      patient: created,
      inviteEmailSent,
      ...(sendCredentials ? {} : { tempPassword })
    });
  } catch (error: unknown) {
    logger.error({ err: error }, "[admin] createPatient error");
    return res.status(500).json({ message: "Error interno del servidor" });
  }
};

export const exportUsers = async (req: AuthRequest, res: Response) => {
  const BATCH = 500;
  const bom = "\uFEFF";
  const header = "Nombre,Email,Teléfono,Plan,Estado membresía,Registrada\n";

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="velum-pacientes-${new Date().toISOString().slice(0, 10)}.csv"`);
  res.write(bom + header);

  let cursor: string | undefined;
  let hasMore = true;

  while (hasMore) {
    const batch = await prisma.user.findMany({
      where: { role: "member", deletedAt: null },
      select: { id: true, email: true, createdAt: true, profile: { select: { firstName: true, lastName: true, phone: true } }, memberships: { select: { planId: true, status: true }, take: 1 } },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: BATCH,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    });

    for (const u of batch) {
      const ms = u.memberships[0];
      const name = [u.profile?.firstName, u.profile?.lastName].filter(Boolean).join(" ") || "";
      const phone = u.profile?.phone ?? "";
      const plan = ms?.planId ?? "";
      const status = ms?.status ?? "inactive";
      const created = u.createdAt.toISOString().slice(0, 10);
      const row = [name, u.email, phone, plan, status, created].map(escapeCsvField).join(",");
      res.write(row + "\n");
    }

    if (batch.length < BATCH) {
      hasMore = false;
    } else {
      cursor = batch[batch.length - 1].id;
    }
  }

  return res.end();
};
