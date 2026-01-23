import { Response } from "express";
import { prisma } from "../db/prisma";
import { AuthRequest } from "../middlewares/auth";

export const listUsers = async (_req: AuthRequest, res: Response) => {
  const users = await prisma.user.findMany({
    include: { profile: true, memberships: true }
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
