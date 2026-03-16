import { Response } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "../db/prisma";
import { AuthRequest } from "../middlewares/auth";
import { membershipUpdateSchema } from "../validators/membership";
import { createAuditLog } from "../services/auditService";
import { readStripePlanCatalog } from "../services/stripePlanCatalogService";

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
