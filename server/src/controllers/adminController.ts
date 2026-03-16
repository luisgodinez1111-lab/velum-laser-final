import { Response } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "../db/prisma";
import { AuthRequest } from "../middlewares/auth";
import { membershipUpdateSchema } from "../validators/membership";
import { createAuditLog } from "../services/auditService";
import { readStripePlanCatalog } from "../services/stripePlanCatalogService";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { sendPatientWelcomeEmail } from "../services/emailService";

function generateTempPassword(): string {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower = 'abcdefghjkmnpqrstuvwxyz';
  const digits = '23456789';
  const special = '@#$!';
  const pool = upper + lower + digits + special;
  const arr = Array.from({ length: 12 }, () => pool[crypto.randomInt(pool.length)]);
  arr[0] = upper[crypto.randomInt(upper.length)];
  arr[1] = lower[crypto.randomInt(lower.length)];
  arr[2] = digits[crypto.randomInt(digits.length)];
  arr[3] = special[crypto.randomInt(special.length)];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr.join('');
}

const clean = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
const validEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

export const listUsers = async (req: AuthRequest, res: Response) => {
  const page    = Math.max(1, parseInt(String(req.query.page  ?? "1"), 10));
  const limit   = Math.min(100, Math.max(1, parseInt(String(req.query.limit ?? "50"), 10)));
  const search  = String(req.query.search ?? "").trim();
  const roleFilter   = String(req.query.role   ?? "").trim();
  const statusFilter = String(req.query.status ?? "").trim();

  const where: Prisma.UserWhereInput = {};
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

  const [total, users, catalog] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      include: { profile: true, memberships: true, documents: true, medicalIntake: true },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    readStripePlanCatalog().catch(() => []),
  ]);

  const enriched = users.map((u) => {
    const ms = u.memberships[0];
    if (!ms) return u;
    const planCode = (ms.planId ?? "").toLowerCase();
    const catalogEntry = catalog.find(
      (p) => p.planCode === planCode || p.stripePriceId === ms.planId
    );
    return {
      ...u,
      memberships: [{ ...ms, catalogEntry: catalogEntry ?? null }],
    };
  });

  return res.json({ data: enriched, total, page, limit, pages: Math.ceil(total / limit) });
};

export const listMemberships = async (req: AuthRequest, res: Response) => {
  const page  = Math.max(1, parseInt(String(req.query.page  ?? "1"), 10));
  const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit ?? "50"), 10)));
  const [total, memberships] = await Promise.all([
    prisma.membership.count(),
    prisma.membership.findMany({
      include: { user: true },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
  ]);
  return res.json({ data: memberships, total, page, limit, pages: Math.ceil(total / limit) });
};

export const listDocumentsAdmin = async (req: AuthRequest, res: Response) => {
  const page  = Math.max(1, parseInt(String(req.query.page  ?? "1"), 10));
  const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit ?? "50"), 10)));
  const [total, documents] = await Promise.all([
    prisma.document.count(),
    prisma.document.findMany({
      include: { user: true },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
  ]);
  return res.json({ data: documents, total, page, limit, pages: Math.ceil(total / limit) });
};

export const reports = async (req: AuthRequest, res: Response) => {
  const [users, active, pastDue, documents] = await Promise.all([
    prisma.user.count(),
    prisma.membership.count({ where: { status: "active" } }),
    prisma.membership.count({ where: { status: "past_due" } }),
    prisma.document.count({ where: { status: "pending" } })
  ]);

  if (req.query.format === "csv") {
    const csv = `metric,value\nusers,${users}\nactive_memberships,${active}\npast_due_memberships,${pastDue}\npending_documents,${documents}\n`;
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="velum-report-${new Date().toISOString().slice(0,10)}.csv"`);
    return res.send(csv);
  }

  return res.json({ users, activeMemberships: active, pastDueMemberships: pastDue, pendingDocuments: documents });
};

export const listAuditLogs = async (req: AuthRequest, res: Response) => {
  const page  = Math.max(1, parseInt(String(req.query.page  ?? "1"), 10));
  const limit = Math.min(200, Math.max(1, parseInt(String(req.query.limit ?? "100"), 10)));

  const logs = await prisma.auditLog.findMany({
    orderBy: { createdAt: "desc" },
    skip: (page - 1) * limit,
    take: limit,
    include: {
      user: true,
      actorUser: true,
      targetUser: true
    }
  });
  return res.json(logs);
};

export const updateMembershipStatus = async (req: AuthRequest, res: Response) => {
  const payload = membershipUpdateSchema.parse(req.body);
  const membership = await prisma.membership.findFirst({ where: { userId: req.params.userId } });
  if (!membership) {
    return res.status(404).json({ message: "Membresía no encontrada" });
  }
  const updated = await prisma.membership.update({
    where: { id: membership.id },
    data: { status: payload.status }
  });
  await createAuditLog({
    userId: req.user?.id,
    targetUserId: req.params.userId,
    action: "membership.update",
    resourceType: "membership",
    resourceId: updated.id,
    ip: req.ip,
    metadata: { status: payload.status }
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
    const seed = await prisma.user.findFirst({ select: { clinicId: true } });
    const clinicId = actor?.clinicId ?? seed?.clinicId;
    if (!clinicId) return res.status(400).json({ message: "No se pudo resolver clinicId" });

    const tempPassword = generateTempPassword();
    const passwordHash = await bcrypt.hash(tempPassword, 10);

    // Create user + profile + membership + medicalIntake + documents in transaction
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
      return user;
    });

    // Update medical intake with provided data
    const intakeData: any = {
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

    await prisma.medicalIntake.update({
      where: { userId: created.id },
      data: intakeData
    });

    // Activate membership if requested
    if (activateMembership && planCode) {
      await prisma.membership.updateMany({
        where: { userId: created.id },
        data: { status: 'active', planCode, planId: planCode, source: 'admin' }
      });
    }

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
      } catch (emailErr: any) {
        // Email failure should not block patient creation
      }
    }

    await createAuditLog({
      userId: req.user!.id,
      targetUserId: created.id,
      action: 'admin.patient.create',
      resourceType: 'user',
      resourceId: created.id,
      ip: req.ip,
      metadata: { email, planCode, activateMembership, inviteEmailSent }
    });

    return res.status(201).json({
      message: `Paciente creado${inviteEmailSent ? '. Credenciales enviadas por correo.' : '.'}`,
      patient: created,
      inviteEmailSent,
      ...(sendCredentials ? {} : { tempPassword })
    });
  } catch (error: any) {
    return res.status(500).json({ message: 'Error al crear paciente', detail: error?.message ?? 'unknown' });
  }
};

export const adminUpdatePatientIntake = async (req: AuthRequest, res: Response) => {
  try {
    const { userId } = req.params;
    const intake = req.body ?? {};

    const current = await prisma.medicalIntake.findUnique({ where: { userId } });
    if (!current) return res.status(404).json({ message: 'Expediente no encontrado' });

    const consentAccepted = intake.consentAccepted ?? current.consentAccepted;
    const phototype       = intake.phototype       ?? current.phototype;
    const status          = (intake.consentAccepted && intake.phototype) ? 'submitted' : (intake.status ?? current.status);

    const updated = await prisma.medicalIntake.update({
      where: { userId },
      data: {
        ...(intake.personalJson  ? { personalJson:  intake.personalJson  } : {}),
        ...(intake.historyJson   ? { historyJson:   intake.historyJson   } : {}),
        ...(intake.phototype     ? { phototype:     intake.phototype     } : {}),
        consentAccepted,
        ...(intake.signatureKey  ? { signatureKey:  intake.signatureKey  } : {}),
        status,
        ...(status === 'submitted' && current.status !== 'submitted' ? { submittedAt: new Date() } : {})
      }
    });

    await createAuditLog({
      userId: req.user!.id,
      targetUserId: userId,
      action: 'admin.patient.intake_update',
      resourceType: 'medical_intake',
      resourceId: current.id,
      ip: req.ip,
      metadata: { status }
    });

    return res.json(updated);
  } catch (error: any) {
    return res.status(500).json({ message: 'Error al actualizar expediente', detail: error?.message ?? 'unknown' });
  }
};

export const adminActivateMembership = async (req: AuthRequest, res: Response) => {
  try {
    const { userId } = req.params;
    const planCode = clean(req.body?.planCode);
    const status   = clean(req.body?.status) || 'active';

    const membership = await prisma.membership.findFirst({ where: { userId } });
    if (!membership) return res.status(404).json({ message: 'Membresía no encontrada' });

    const updated = await prisma.membership.update({
      where: { id: membership.id },
      data: {
        status: status as any,
        ...(planCode ? { planCode, planId: planCode } : {}),
        source: 'admin'
      }
    });

    await createAuditLog({
      userId: req.user!.id,
      targetUserId: userId,
      action: 'admin.patient.membership_activate',
      resourceType: 'membership',
      resourceId: membership.id,
      ip: req.ip,
      metadata: { planCode, status }
    });

    return res.json({ message: 'Membresía actualizada', membership: updated });
  } catch (error: any) {
    return res.status(500).json({ message: 'Error al actualizar membresía', detail: error?.message ?? 'unknown' });
  }
};
