import { prisma } from "../db/prisma";

export const createAuditLog = async ({
  userId,
  action,
  metadata
}: {
  userId?: string;
  action: string;
  metadata?: Record<string, unknown>;
}) => {
  return prisma.auditLog.create({
    data: {
      userId,
      action,
      metadata
    }
  });
};
