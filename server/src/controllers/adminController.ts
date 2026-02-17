import { Response } from "express";
import { prisma } from "../db/prisma";
import { AuthRequest } from "../middlewares/auth";
import { membershipUpdateSchema } from "../validators/membership";
import { roleUpdateSchema } from "../validators/admin";
import { auditFilterSchema } from "../validators/audit";
import { createAuditLog } from "../services/auditService";

export const listUsers = async (_req: AuthRequest, res: Response) => {
  const users = await prisma.user.findMany({
    include: { profile: true, memberships: true, documents: true, medicalIntake: true }
  });
  return res.json(users);
};

export const listMemberships = async (_req: AuthRequest, res: Response) => {
  const memberships = await prisma.membership.findMany({ include: { user: true } });
  return res.json(memberships);
};

export const listDocumentsAdmin = async (_req: AuthRequest, res: Response) => {
  const documents = await prisma.document.findMany({ include: { user: true } });
  return res.json(documents);
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
    res.setHeader("Content-Type", "text/csv");
    return res.send(csv);
  }

  return res.json({ users, activeMemberships: active, pastDueMemberships: pastDue, pendingDocuments: documents });
};

export const listAuditLogs = async (req: AuthRequest, res: Response) => {
  const parsed = auditFilterSchema.parse(req.query);

  const logs = await prisma.auditLog.findMany({
    where: {
      ...(parsed.actorUserId ? { actorUserId: parsed.actorUserId } : {}),
      ...(parsed.targetUserId ? { targetUserId: parsed.targetUserId } : {}),
      ...(parsed.userId ? { userId: parsed.userId } : {}),
      ...(parsed.action ? { action: parsed.action } : {}),
      ...(parsed.resourceType ? { resourceType: parsed.resourceType } : {}),
      ...(parsed.resourceId ? { resourceId: parsed.resourceId } : {}),
      ...(parsed.result ? { result: parsed.result } : {}),
      ...(parsed.startDate || parsed.endDate
        ? {
            createdAt: {
              ...(parsed.startDate ? { gte: new Date(parsed.startDate) } : {}),
              ...(parsed.endDate ? { lte: new Date(parsed.endDate) } : {})
            }
          }
        : {})
    },
    include: {
      user: { select: { id: true, email: true, role: true } },
      actorUser: { select: { id: true, email: true, role: true } },
      targetUser: { select: { id: true, email: true, role: true } }
    },
    orderBy: { createdAt: "desc" },
    take: parsed.limit ?? 200
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
    data: { role: payload.role },
    select: { id: true, email: true, role: true }
  });

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
