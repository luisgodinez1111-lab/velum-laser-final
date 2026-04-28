import { Prisma } from "@prisma/client";
import { prisma } from "../db/prisma";
import { getTenantIdOr } from "../utils/tenantContext";
import { env } from "../utils/env";

type AuditResult = "success" | "failed";

export const createAuditLog = async ({
  userId,
  actorUserId,
  targetUserId,
  action,
  resourceType,
  resourceId,
  result = "success",
  ip,
  metadata
}: {
  userId?: string;
  actorUserId?: string;
  targetUserId?: string;
  action: string;
  resourceType?: string;
  resourceId?: string;
  result?: AuditResult;
  ip?: string;
  metadata?: Prisma.InputJsonValue;
}) => {
  // actor = who performed the action; userId = subject of the action (defaults to actor)
  const actor = actorUserId ?? userId;

  return prisma.auditLog.create({
    data: {
      userId: userId ?? actorUserId,
      actorUserId: actor,
      targetUserId,
      action,
      resourceType,
      resourceId,
      result,
      ip,
      metadata,
      tenantId: getTenantIdOr(env.defaultClinicId),
    }
  });
};
