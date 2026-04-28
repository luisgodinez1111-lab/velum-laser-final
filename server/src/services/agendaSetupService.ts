import { AgendaPolicy, AgendaWeeklyRule, AgendaTreatment } from "@prisma/client";
import { prisma } from "../db/prisma";
import { env } from "../utils/env";

export const defaultPolicy: Pick<
  AgendaPolicy,
  | "timezone"
  | "slotMinutes"
  | "autoConfirmHours"
  | "noShowGraceMinutes"
  | "maxActiveAppointmentsPerWeek"
  | "maxActiveAppointmentsPerMonth"
  | "minAdvanceMinutes"
  | "maxAdvanceDays"
> = {
  timezone: "America/Chihuahua",
  slotMinutes: 30,
  autoConfirmHours: 12,
  noShowGraceMinutes: 30,
  maxActiveAppointmentsPerWeek: 4,
  maxActiveAppointmentsPerMonth: 12,
  minAdvanceMinutes: 120,
  maxAdvanceDays: 60
};

export const defaultWeeklyRules: Array<Pick<AgendaWeeklyRule, "dayOfWeek" | "isOpen" | "startHour" | "endHour">> = [
  { dayOfWeek: 0, isOpen: false, startHour: 9, endHour: 20 },
  { dayOfWeek: 1, isOpen: true, startHour: 9, endHour: 20 },
  { dayOfWeek: 2, isOpen: true, startHour: 9, endHour: 20 },
  { dayOfWeek: 3, isOpen: true, startHour: 9, endHour: 20 },
  { dayOfWeek: 4, isOpen: true, startHour: 9, endHour: 20 },
  { dayOfWeek: 5, isOpen: true, startHour: 9, endHour: 20 },
  { dayOfWeek: 6, isOpen: true, startHour: 9, endHour: 20 }
];

export const defaultTreatments: Array<
  Pick<
    AgendaTreatment,
    | "name"
    | "code"
    | "description"
    | "durationMinutes"
    | "prepBufferMinutes"
    | "cleanupBufferMinutes"
    | "requiresSpecificCabin"
    | "isActive"
    | "sortOrder"
  >
> = [
  {
    name: "Valoración",
    code: "valuation",
    description: "Primera valoración clínica",
    durationMinutes: 45,
    prepBufferMinutes: 0,
    cleanupBufferMinutes: 0,
    requiresSpecificCabin: false,
    isActive: true,
    sortOrder: 1
  },
  {
    name: "Sesión Láser",
    code: "laser_session",
    description: "Sesión regular de tratamiento láser",
    durationMinutes: 45,
    prepBufferMinutes: 0,
    cleanupBufferMinutes: 0,
    requiresSpecificCabin: false,
    isActive: true,
    sortOrder: 2
  }
];

const ensurePolicy = async () => {
  const existing = await prisma.agendaPolicy.findFirst();
  if (existing) {
    return existing;
  }

  return prisma.agendaPolicy.create({
    data: { ...defaultPolicy, tenantId: env.defaultClinicId }
  });
};

const ensureCabins = async () => {
  const count = await prisma.agendaCabin.count();
  if (count > 0) {
    return;
  }

  await prisma.agendaCabin.createMany({
    data: [
      { name: "Cabina 1", isActive: true, sortOrder: 1, tenantId: env.defaultClinicId },
      { name: "Cabina 2", isActive: true, sortOrder: 2, tenantId: env.defaultClinicId }
    ]
  });
};

const ensureWeeklyRules = async () => {
  const existing = await prisma.agendaWeeklyRule.findMany();
  if (existing.length === 7) {
    return;
  }

  const existingByDay = new Set(existing.map((rule) => rule.dayOfWeek));

  await Promise.all(
    defaultWeeklyRules
      .filter((rule) => !existingByDay.has(rule.dayOfWeek))
      .map((rule) =>
        prisma.agendaWeeklyRule.create({
          data: { ...rule, tenantId: env.defaultClinicId }
        })
      )
  );
};

const ensureTreatments = async () => {
  const count = await prisma.agendaTreatment.count();
  if (count > 0) {
    return;
  }

  await prisma.agendaTreatment.createMany({
    data: defaultTreatments.map((t) => ({ ...t, tenantId: env.defaultClinicId }))
  });
};

export const ensureAgendaDefaults = async () => {
  await ensurePolicy();
  await ensureCabins();
  await ensureWeeklyRules();
  await ensureTreatments();
};
