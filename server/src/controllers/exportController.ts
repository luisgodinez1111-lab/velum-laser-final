import { Response } from "express";
import { AuthRequest } from "../middlewares/auth";
import { prisma } from "../db/prisma";
import { logger } from "../utils/logger";
import { createAuditLog } from "../services/auditService";

/** Escapa valor para CSV: envuelve en comillas si contiene coma, comilla o salto */
const csvVal = (v: unknown): string => {
  const s = v == null ? "" : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

const toCsvRow = (vals: unknown[]): string => vals.map(csvVal).join(",");

const sendCsv = (res: Response, filename: string, header: string[], rows: unknown[][]): void => {
  const lines = [header.join(","), ...rows.map(toCsvRow)].join("\r\n");
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.setHeader("Cache-Control", "no-store");
  res.send("\uFEFF" + lines); // BOM para Excel
};

// ── Exportar pagos ─────────────────────────────────────────────────────
export const exportPayments = async (req: AuthRequest, res: Response) => {
  try {
    const { from, to } = req.query as Record<string, string>;
    const where = {
      ...(from ? { createdAt: { gte: new Date(from) } } : {}),
      ...(to   ? { createdAt: { lte: new Date(to)   } } : {}),
    };

    const payments = await prisma.payment.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 10_000,
      select: {
        id: true, amount: true, currency: true, status: true,
        stripePaymentIntentId: true, createdAt: true,
        user: { select: { email: true, profile: { select: { firstName: true, lastName: true } } } },
        membership: { select: { planCode: true } },
      },
    });

    const header = ["ID", "Fecha", "Email", "Nombre", "Plan", "Monto (MXN)", "Moneda", "Estado", "Stripe PI"];
    const rows = payments.map(p => [
      p.id,
      p.createdAt.toISOString().slice(0, 10),
      p.user?.email ?? "",
      [p.user?.profile?.firstName, p.user?.profile?.lastName].filter(Boolean).join(" "),
      p.membership?.planCode ?? "",
      ((p.amount ?? 0) / 100).toFixed(2),
      (p.currency ?? "MXN").toUpperCase(),
      p.status,
      p.stripePaymentIntentId ?? "",
    ]);

    await createAuditLog({ userId: req.user!.id, actorUserId: req.user!.id, action: "admin.export.payments", resourceType: "payment", resourceId: "bulk", ip: req.ip, metadata: { count: rows.length } });
    sendCsv(res, `pagos-${new Date().toISOString().slice(0,10)}.csv`, header, rows);
  } catch (err) {
    logger.error({ err }, "[export] exportPayments error");
    res.status(500).json({ message: "Error generando exportación" });
  }
};

// ── Exportar citas ─────────────────────────────────────────────────────
export const exportAppointments = async (req: AuthRequest, res: Response) => {
  try {
    const { from, to } = req.query as Record<string, string>;
    const where = {
      deletedAt: null,
      ...(from ? { startAt: { gte: new Date(from) } } : {}),
      ...(to   ? { startAt: { lte: new Date(to)   } } : {}),
    };

    const appointments = await prisma.appointment.findMany({
      where,
      orderBy: { startAt: "desc" },
      take: 10_000,
      select: {
        id: true, startAt: true, endAt: true, status: true, reason: true,
        user:      { select: { email: true, profile: { select: { firstName: true, lastName: true, phone: true } } } },
        treatment: { select: { name: true } },
        cabin:     { select: { name: true } },
        createdBy: { select: { email: true } },
      },
    });

    const header = ["ID", "Fecha", "Hora inicio", "Hora fin", "Email paciente", "Nombre paciente", "Teléfono", "Tratamiento", "Cabina", "Estado", "Notas", "Creado por"];
    const tz = "America/Chihuahua";
    const rows = appointments.map(a => [
      a.id,
      a.startAt.toLocaleDateString("es-MX", { timeZone: tz }),
      a.startAt.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit", timeZone: tz }),
      a.endAt?.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit", timeZone: tz }) ?? "",
      a.user?.email ?? "",
      [a.user?.profile?.firstName, a.user?.profile?.lastName].filter(Boolean).join(" "),
      a.user?.profile?.phone ?? "",
      a.treatment?.name ?? "",
      a.cabin?.name ?? "",
      a.status,
      a.reason ?? "",
      a.createdBy?.email ?? "",
    ]);

    await createAuditLog({ userId: req.user!.id, actorUserId: req.user!.id, action: "admin.export.appointments", resourceType: "appointment", resourceId: "bulk", ip: req.ip, metadata: { count: rows.length } });
    sendCsv(res, `citas-${new Date().toISOString().slice(0,10)}.csv`, header, rows);
  } catch (err) {
    logger.error({ err }, "[export] exportAppointments error");
    res.status(500).json({ message: "Error generando exportación" });
  }
};

// ── Exportar miembros ──────────────────────────────────────────────────
export const exportMembers = async (req: AuthRequest, res: Response) => {
  try {
    const members = await prisma.user.findMany({
      where: { role: "member", deletedAt: null },
      orderBy: { createdAt: "desc" },
      take: 10_000,
      select: {
        id: true, email: true, createdAt: true, isActive: true,
        profile: { select: { firstName: true, lastName: true, phone: true, birthDate: true } },
        memberships: {
          where: { status: "active" },
          select: { planCode: true, status: true, currentPeriodEnd: true },
          take: 1,
          orderBy: { createdAt: "desc" },
        },
      },
    });

    const header = ["ID", "Email", "Nombre", "Teléfono", "Fecha nacimiento", "Plan activo", "Membresía hasta", "Activo", "Registrado"];
    const rows = members.map(m => [
      m.id,
      m.email,
      [m.profile?.firstName, m.profile?.lastName].filter(Boolean).join(" "),
      m.profile?.phone ?? "",
      m.profile?.birthDate?.toISOString().slice(0, 10) ?? "",
      m.memberships[0]?.planCode ?? "Sin membresía",
      m.memberships[0]?.currentPeriodEnd?.toISOString().slice(0, 10) ?? "",
      m.isActive ? "Sí" : "No",
      m.createdAt.toISOString().slice(0, 10),
    ]);

    await createAuditLog({ userId: req.user!.id, actorUserId: req.user!.id, action: "admin.export.members", resourceType: "user", resourceId: "bulk", ip: req.ip, metadata: { count: rows.length } });
    sendCsv(res, `miembros-${new Date().toISOString().slice(0,10)}.csv`, header, rows);
  } catch (err) {
    logger.error({ err }, "[export] exportMembers error");
    res.status(500).json({ message: "Error generando exportación" });
  }
};
