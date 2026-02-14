import { prisma } from "../db/prisma";

export const getOverview = async () => {
  const [totalUsers, totalLeads, totalAppointments, activeMembers, pendingIntakes] =
    await Promise.all([
      prisma.user.count({ where: { role: "member" } }),
      prisma.lead.count(),
      prisma.appointment.count(),
      prisma.membership.count({ where: { status: "active" } }),
      prisma.medicalIntake.count({ where: { status: "submitted" } })
    ]);

  return {
    totalUsers,
    totalLeads,
    totalAppointments,
    activeMembers,
    pendingIntakes
  };
};

export const getAppointmentStats = async (days = 30) => {
  const since = new Date();
  since.setDate(since.getDate() - days);

  const appointments = await prisma.appointment.findMany({
    where: { createdAt: { gte: since } },
    select: { status: true, type: true, scheduledAt: true, createdAt: true }
  });

  // Group by status
  const byStatus: Record<string, number> = {};
  const byType: Record<string, number> = {};
  const byDay: Record<string, number> = {};

  for (const a of appointments) {
    byStatus[a.status] = (byStatus[a.status] || 0) + 1;
    byType[a.type] = (byType[a.type] || 0) + 1;
    const dayKey = a.scheduledAt.toISOString().split("T")[0];
    byDay[dayKey] = (byDay[dayKey] || 0) + 1;
  }

  return { total: appointments.length, byStatus, byType, byDay };
};

export const getLeadStats = async (days = 30) => {
  const since = new Date();
  since.setDate(since.getDate() - days);

  const leads = await prisma.lead.findMany({
    where: { createdAt: { gte: since } },
    select: { source: true, status: true, createdAt: true }
  });

  const bySource: Record<string, number> = {};
  const byStatus: Record<string, number> = {};
  const byDay: Record<string, number> = {};

  for (const l of leads) {
    bySource[l.source] = (bySource[l.source] || 0) + 1;
    byStatus[l.status] = (byStatus[l.status] || 0) + 1;
    const dayKey = l.createdAt.toISOString().split("T")[0];
    byDay[dayKey] = (byDay[dayKey] || 0) + 1;
  }

  const conversionRate =
    leads.length > 0
      ? ((leads.filter((l) => l.status === "converted").length / leads.length) * 100).toFixed(1)
      : "0";

  return { total: leads.length, conversionRate, bySource, byStatus, byDay };
};

export const getSessionStats = async (days = 30) => {
  const since = new Date();
  since.setDate(since.getDate() - days);

  const sessions = await prisma.sessionTreatment.findMany({
    where: { createdAt: { gte: since } },
    select: { zones: true, createdAt: true }
  });

  const zoneCount: Record<string, number> = {};
  for (const s of sessions) {
    for (const z of s.zones) {
      zoneCount[z] = (zoneCount[z] || 0) + 1;
    }
  }

  return { totalSessions: sessions.length, byZone: zoneCount };
};
