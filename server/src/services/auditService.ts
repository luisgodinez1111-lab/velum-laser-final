import { Prisma } from "@prisma/client";
import { withExplicitTenant } from "../db/withTenantContext";
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

  // Helper transversal (pre-auth/público/autenticado): tenant vía getTenantIdOr,
  // write scoped → withExplicitTenant (fail-closed-safe).
  const tenantId = getTenantIdOr(env.defaultClinicId);
  return withExplicitTenant(tenantId, (tx) => tx.auditLog.create({
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
      tenantId,
    }
  }));
};
