import { Appointment } from "@prisma/client";

export const weekdayMap: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6
};

export const comparableStatuses = ["scheduled", "confirmed"] as const;

export const activeAgendaStatuses = ["scheduled", "confirmed", "completed", "no_show"] as const;

export type ZonedParts = {
  dateKey: string;
  dayOfWeek: number;
  minutesFromDay: number;
};

export const toZonedParts = (date: Date, timeZone: string): ZonedParts => {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    weekday: "short"
  });

  const parts = formatter.formatToParts(date);
  const byType = (type: string) => parts.find((part) => part.type === type)?.value;

  const year = byType("year") ?? "1970";
  const month = byType("month") ?? "01";
  const day = byType("day") ?? "01";
  const weekdayName = byType("weekday") ?? "Sun";

  const parsedHour = Number(byType("hour") ?? "0");
  const hour = parsedHour === 24 ? 0 : parsedHour;
  const minute = Number(byType("minute") ?? "0");

  return {
    dateKey: `${year}-${month}-${day}`,
    dayOfWeek: weekdayMap[weekdayName] ?? 0,
    minutesFromDay: hour * 60 + minute
  };
};

export const dayOfWeekForDateKey = (dateKey: string, timeZone: string) => {
  const reference = new Date(`${dateKey}T12:00:00.000Z`);
  return toZonedParts(reference, timeZone).dayOfWeek;
};

export const overlapsRange = (startA: number, endA: number, startB: number, endB: number) => startA < endB && endA > startB;

export const normalizeDateKey = (value: string) => value.trim();

export function bufferedRange({
  startAt,
  endAt,
  prepBufferMinutes = 0,
  cleanupBufferMinutes = 0
}: {
  startAt: Date;
  endAt: Date;
  prepBufferMinutes?: number;
  cleanupBufferMinutes?: number;
}) {
  return {
    startAt: new Date(startAt.getTime() - prepBufferMinutes * 60 * 1000),
    endAt: new Date(endAt.getTime() + cleanupBufferMinutes * 60 * 1000)
  };
}

export const appointmentRangeForDateKey = (
  appointment: Appointment & {
    treatment?: { prepBufferMinutes?: number | null; cleanupBufferMinutes?: number | null } | null;
  },
  dateKey: string,
  timeZone: string
) => {
  const padded = bufferedRange({
    startAt: new Date(appointment.startAt),
    endAt: new Date(appointment.endAt),
    prepBufferMinutes: appointment.treatment?.prepBufferMinutes ?? 0,
    cleanupBufferMinutes: appointment.treatment?.cleanupBufferMinutes ?? 0
  });
  const start = toZonedParts(padded.startAt, timeZone);
  const end = toZonedParts(padded.endAt, timeZone);

  if (end.dateKey < dateKey || start.dateKey > dateKey) {
    return null;
  }

  const startMinute = start.dateKey < dateKey ? 0 : start.minutesFromDay;
  const endMinute = end.dateKey > dateKey ? 1440 : end.minutesFromDay;

  return {
    startMinute,
    endMinute
  };
};
