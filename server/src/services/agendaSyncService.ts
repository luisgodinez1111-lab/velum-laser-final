import { prisma } from "../db/prisma";
import { getAgendaConfig } from "./agendaConfigService";

export const syncAppointmentWorkflow = async () => {
  const { policy } = await getAgendaConfig();
  const now = new Date();
  const autoConfirmUntil = new Date(now.getTime() + policy.autoConfirmHours * 60 * 60 * 1000);

  const autoConfirmed = await prisma.appointment.updateMany({
    where: {
      status: "scheduled",
      startAt: {
        lte: autoConfirmUntil
      },
      endAt: {
        gt: now
      }
    },
    data: {
      status: "confirmed",
      confirmedAt: now,
      autoConfirmedAt: now
    }
  });

  const noShowCutoff = new Date(now.getTime() - policy.noShowGraceMinutes * 60 * 1000);

  // Fetch only IDs of overdue appointments that have at least one session
  // to avoid N+1 updates — mark no-show in a single updateMany
  const overdueAll = await prisma.appointment.findMany({
    where: {
      status: { in: ["scheduled", "confirmed"] },
      endAt: { lte: noShowCutoff }
    },
    select: {
      id: true,
      sessions: { select: { id: true }, take: 1 }
    }
  });

  const noShowIds = overdueAll
    .filter((a) => a.sessions.length === 0)
    .map((a) => a.id);

  const noShowResult = noShowIds.length > 0
    ? await prisma.appointment.updateMany({
        where: { id: { in: noShowIds } },
        data: { status: "no_show", noShowAt: now }
      })
    : { count: 0 };

  const noShowMarked = noShowResult.count;

  return {
    autoConfirmed: autoConfirmed.count,
    noShowMarked
  };
};
