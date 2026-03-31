import { Response } from "express";
import { prisma } from "../db/prisma";
import { AuthRequest } from "../middlewares/auth";
import { auditFilterSchema } from "../validators/audit";
import { paginated } from "../utils/response";

export const listAuditLogsV1 = async (req: AuthRequest, res: Response) => {
  const parsed = auditFilterSchema.parse(req.query);
  const limit  = parsed.limit ?? 50;
  const page   = parsed.page  ?? 1;
  const skip   = (page - 1) * limit;
  // Only join user relations when caller explicitly requests them (reduces query cost)
  const withRelations = req.query.include === "relations";

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

  const userSelect = { id: true, email: true, role: true } as const;

  const [total, logs] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
      where,
      ...(withRelations ? {
        include: {
          actorUser:  { select: userSelect },
          targetUser: { select: userSelect },
          user:       { select: userSelect },
        },
      } : {}),
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip,
      take: limit,
    })
  ]);

  return paginated(res, logs, { page, limit, total });
};
