import { Response } from "express";
import { prisma } from "../db/prisma";
import { AuthRequest } from "../middlewares/auth";
import { membershipUpdateSchema } from "../validators/membership";
import { createAuditLog } from "../services/auditService";

export const listUsers = async (_req: AuthRequest, res: Response) => {
  const users = await prisma.user.findMany({
    include: { profile: true, memberships: true, documents: true }
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

export const listAuditLogs = async (_req: AuthRequest, res: Response) => {
  const logs = await prisma.auditLog.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
    include: { user: true }
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
    action: "membership.update",
    metadata: { targetUserId: req.params.userId, status: payload.status, ip: req.ip }
  });
  return res.json(updated);
};
