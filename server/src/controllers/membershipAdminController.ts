import { Response } from "express";
import { prisma } from "../db/prisma";
import { AuthRequest } from "../middlewares/auth";
import { membershipUpdateSchema } from "../validators/membership";
import { createAuditLog } from "../services/auditService";
import { logger } from "../utils/logger";
import { clean } from "../utils/strings";
import { parsePagination } from "../utils/pagination";
import { safeIp, queryParams } from "../utils/request";
import { paginated } from "../utils/response";

const VALID_MEMBERSHIP_STATUSES = ['active', 'inactive', 'past_due', 'canceled', 'paused'] as const;
type MembershipStatusValue = typeof VALID_MEMBERSHIP_STATUSES[number];

export const listMemberships = async (req: AuthRequest, res: Response) => {
  const { page, limit, skip } = parsePagination(queryParams(req));
  const [total, memberships] = await Promise.all([
    prisma.membership.count(),
    prisma.membership.findMany({
      include: { user: true },
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    }),
  ]);
  return paginated(res, memberships, { page, limit, total });
};

export const updateMembershipStatus = async (req: AuthRequest, res: Response) => {
  const payload = membershipUpdateSchema.parse(req.body);

  // Atomic update — avoids TOCTOU race between findFirst and update
  const { count } = await prisma.membership.updateMany({
    where: { userId: req.params.userId },
    data: { status: payload.status },
  });
  if (count === 0) {
    return res.status(404).json({ message: "Membresía no encontrada" });
  }
  const updated = await prisma.membership.findFirst({ where: { userId: req.params.userId } });

  await createAuditLog({
    userId: req.user?.id,
    targetUserId: req.params.userId,
    action: "membership.update",
    resourceType: "membership",
    resourceId: updated?.id ?? req.params.userId,
    ip: req.ip,
    metadata: { status: payload.status }
  });

  return res.json(updated);
};

export const adminActivateMembership = async (req: AuthRequest, res: Response) => {
  try {
    const { userId } = req.params;
    const planCode = clean(req.body?.planCode);
    const rawStatus = clean(req.body?.status) || 'active';

    if (!VALID_MEMBERSHIP_STATUSES.includes(rawStatus as MembershipStatusValue)) {
      return res.status(400).json({ message: "Estado de membresía inválido" });
    }
    const status = rawStatus as MembershipStatusValue;

    const membership = await prisma.membership.findFirst({ where: { userId } });
    if (!membership) return res.status(404).json({ message: 'Membresía no encontrada' });

    const updated = await prisma.membership.update({
      where: { id: membership.id },
      data: {
        status,
        ...(planCode ? { planCode, planId: planCode } : {}),
        source: 'admin'
      }
    });

    await createAuditLog({
      userId: req.user!.id,
      targetUserId: userId,
      action: 'admin.patient.membership_activate',
      resourceType: 'membership',
      resourceId: membership.id,
      ip: safeIp(req),
      metadata: { planCode, status }
    });

    return res.json({ message: 'Membresía actualizada', membership: updated });
  } catch (error: unknown) {
    logger.error({ err: error }, "[admin] adminActivateMembership error");
    return res.status(500).json({ message: "Error interno del servidor" });
  }
};
