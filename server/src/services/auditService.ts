import { Prisma } from "@prisma/client";
import { prisma } from "../db/prisma";

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
  const actor = actorUserId ?? userId;

  return prisma.auditLog.create({
    data: {
      userId: userId ?? actor,
      actorUserId: actor,
      targetUserId,
      action,
      resourceType,
      resourceId,
      result,
      ip,
      metadata,
      metadataJson: metadata
    }
  });
};
