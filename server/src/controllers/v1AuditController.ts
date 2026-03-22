import { Response } from "express";
import { prisma } from "../db/prisma";
import { AuthRequest } from "../middlewares/auth";
import { auditFilterSchema } from "../validators/audit";

export const listAuditLogsV1 = async (req: AuthRequest, res: Response) => {
  const parsed = auditFilterSchema.parse(req.query);
  const limit  = parsed.limit ?? 50;
  const page   = parsed.page  ?? 1;
  const skip   = (page - 1) * limit;

  const where = {
    ...(parsed.actorUserId  ? { actorUserId: parsed.actorUserId }   : {}),
    ...(parsed.targetUserId ? { targetUserId: parsed.targetUserId } : {}),
    ...(parsed.userId       ? { userId: parsed.userId }             : {}),
    ...(parsed.action       ? { action: parsed.action }             : {}),
    ...(parsed.resourceType ? { resourceType: parsed.resourceType } : {}),
    ...(parsed.resourceId   ? { resourceId: parsed.resourceId }     : {}),
    ...(parsed.result       ? { result: parsed.result }             : {}),
    ...(parsed.startDate || parsed.endDate
      ? { createdAt: {
            ...(parsed.startDate ? { gte: new Date(parsed.startDate) } : {}),
            ...(parsed.endDate   ? { lte: new Date(parsed.endDate)   } : {})
          } }
      : {})
  };

  const [total, logs] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
      where,
      include: {
        actorUser:  { select: { id: true, email: true, role: true } },
        targetUser: { select: { id: true, email: true, role: true } },
        user:       { select: { id: true, email: true, role: true } }
      },
      orderBy: { createdAt: "desc" },
      skip,
      take: limit
    })
  ]);

  return res.json({ logs, total, page, limit, pages: Math.ceil(total / limit) });
};
