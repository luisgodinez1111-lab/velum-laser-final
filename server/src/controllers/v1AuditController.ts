import { Response } from "express";
import { prisma } from "../db/prisma";
import { AuthRequest } from "../middlewares/auth";
import { auditFilterSchema } from "../validators/audit";

export const listAuditLogsV1 = async (req: AuthRequest, res: Response) => {
  const parsed = auditFilterSchema.parse(req.query);

  const logs = await prisma.auditLog.findMany({
    where: {
      ...(parsed.actorUserId ? { actorUserId: parsed.actorUserId } : {}),
      ...(parsed.resourceType ? { resourceType: parsed.resourceType } : {}),
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
      actorUser: {
        select: {
          id: true,
          email: true,
          role: true
        }
      },
      targetUser: {
        select: {
          id: true,
          email: true,
          role: true
        }
      },
      user: {
        select: {
          id: true,
          email: true,
          role: true
        }
      }
    },
    orderBy: { createdAt: "desc" },
    take: parsed.limit ?? 200
  });

  return res.json(logs);
};
