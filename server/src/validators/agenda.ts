import { z } from "zod";

const dateKeyRegex = /^\d{4}-\d{2}-\d{2}$/;

const weeklyRuleSchema = z
  .object({
    dayOfWeek: z.number().int().min(0).max(6),
    isOpen: z.boolean(),
    startHour: z.number().int().min(0).max(23).optional(),
    endHour: z.number().int().min(1).max(24).optional()
  })
  .refine((rule) => {
    if (!rule.isOpen) {
      return true;
    }
    if (rule.startHour === undefined || rule.endHour === undefined) {
      return false;
    }
    return rule.endHour > rule.startHour;
  }, { message: "La regla semanal requiere rango de horas válido cuando está abierta" });

const specialDateRuleSchema = z
  .object({
    dateKey: z.string().regex(dateKeyRegex),
    isOpen: z.boolean(),
    startHour: z.number().int().min(0).max(23).nullable().optional(),
    endHour: z.number().int().min(1).max(24).nullable().optional(),
    note: z.string().max(200).nullable().optional()
  })
  .refine((rule) => {
    if (!rule.isOpen) {
      return true;
    }
    if (rule.startHour == null || rule.endHour == null) {
      return false;
    }
    return rule.endHour > rule.startHour;
  }, { message: "La regla por fecha requiere rango de horas válido cuando está abierta" });

export const agendaConfigUpdateSchema = z.object({
  timezone: z.string().min(3).optional(),
  slotMinutes: z.number().int().min(10).max(120).optional(),
  autoConfirmHours: z.number().int().min(0).max(72).optional(),
  noShowGraceMinutes: z.number().int().min(5).max(240).optional(),
  cabins: z
    .array(
      z.object({
        id: z.string().min(3).optional(),
        name: z.string().min(1).max(80),
        isActive: z.boolean().optional(),
        sortOrder: z.number().int().min(0).max(99).optional()
      })
    )
    .min(1)
    .max(20)
    .optional(),
  weeklyRules: z.array(weeklyRuleSchema).max(7).optional(),
  specialDateRules: z.array(specialDateRuleSchema).max(365).optional()
});

export const agendaBlockCreateSchema = z
  .object({
    dateKey: z.string().regex(dateKeyRegex),
    startMinute: z.number().int().min(0).max(1439),
    endMinute: z.number().int().min(1).max(1440),
    cabinId: z.string().min(3).nullable().optional(),
    reason: z.string().min(3).max(180).optional()
  })
  .refine((payload) => payload.endMinute > payload.startMinute, {
    message: "El rango del bloqueo es inválido"
  });

export const agendaDateParamSchema = z.object({
  dateKey: z.string().regex(dateKeyRegex)
});
