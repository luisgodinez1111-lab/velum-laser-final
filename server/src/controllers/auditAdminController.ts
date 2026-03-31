import { Response } from "express";
import { prisma } from "../db/prisma";
import { AuthRequest } from "../middlewares/auth";
import { auditFilterSchema } from "../validators/audit";
import { parsePagination } from "../utils/pagination";
import { escapeCsvField } from "../services/csvExportService";
import { paginated } from "../utils/response";
import { queryParams } from "../utils/request";

// Construye el filtro where para consultas de AuditLog — compartido por listAuditLogs y exportAuditLogsCSV
const buildAuditWhere = (parsed: ReturnType<typeof auditFilterSchema.parse>) => ({
  ...(parsed.actorUserId   ? { actorUserId: parsed.actorUserId }   : {}),
  ...(parsed.targetUserId  ? { targetUserId: parsed.targetUserId } : {}),
  ...(parsed.userId        ? { userId: parsed.userId }             : {}),
  ...(parsed.action        ? { action: parsed.action }             : {}),
  ...(parsed.resourceType  ? { resourceType: parsed.resourceType } : {}),
  ...(parsed.resourceId    ? { resourceId: parsed.resourceId }     : {}),
  ...(parsed.result        ? { result: parsed.result }             : {}),
  ...(parsed.startDate || parsed.endDate
    ? { createdAt: {
        ...(parsed.startDate ? { gte: new Date(parsed.startDate) } : {}),
        ...(parsed.endDate   ? { lte: new Date(parsed.endDate) }   : {}),
      }}
    : {}),
});

export const listAuditLogs = async (req: AuthRequest, res: Response) => {
  const parsed = auditFilterSchema.parse(req.query);
  const pageSize = parsed.limit ?? 50;
  const page = parsed.page ?? 1;
  const skip = (page - 1) * pageSize;

  const where = buildAuditWhere(parsed);

  const [logs, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      include: {
        user: { select: { id: true, email: true, role: true } },
        actorUser: { select: { id: true, email: true, role: true } },
        targetUser: { select: { id: true, email: true, role: true } }
      },
      orderBy: { createdAt: "desc" },
      take: pageSize,
      skip,
    }),
    prisma.auditLog.count({ where }),
  ]);

  return paginated(res, logs, { page, limit: pageSize, total });
};

export const exportAuditLogsCSV = async (req: AuthRequest, res: Response) => {
  const parsed = auditFilterSchema.parse(req.query);
  const BATCH = 500;
  const bom = "\uFEFF";
  const header = "Fecha,Actor,Acción,Recurso,ID Recurso,Target,Resultado,IP\n";

  const where = buildAuditWhere(parsed);

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="velum-auditoria-${new Date().toISOString().slice(0, 10)}.csv"`);
  res.write(bom + header);

  let cursor: string | undefined;
  let hasMore = true;

  while (hasMore) {
    const batch = await prisma.auditLog.findMany({
      where,
      include: {
        actorUser: { select: { email: true } },
        targetUser: { select: { email: true } },
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: BATCH,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    });

    for (const log of batch) {
      const row = [
        log.createdAt.toISOString(),
        log.actorUser?.email ?? "",
        log.action,
        log.resourceType ?? "",
        log.resourceId ?? "",
        log.targetUser?.email ?? "",
        log.result ?? "",
        log.ip ?? "",
      ].map(escapeCsvField).join(",");
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

export const listDocumentsAdmin = async (req: AuthRequest, res: Response) => {
  const { page, limit, skip } = parsePagination(queryParams(req));
  const [total, documents] = await Promise.all([
    prisma.document.count(),
    prisma.document.findMany({
      include: { user: true },
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    }),
  ]);
  return paginated(res, documents, { page, limit, total });
};
