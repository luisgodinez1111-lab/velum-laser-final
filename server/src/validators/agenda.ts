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

const treatmentSchema = z
  .object({
    id: z.string().min(3).optional(),
    name: z.string().min(1).max(80),
    code: z.string().min(2).max(80).regex(/^[a-z0-9_]+$/),
    description: z.string().max(240).nullable().optional(),
    durationMinutes: z.number().int().min(10).max(240),
    prepBufferMinutes: z.number().int().min(0).max(120).optional(),
    cleanupBufferMinutes: z.number().int().min(0).max(120).optional(),
    cabinId: z.string().min(3).nullable().optional(),
    allowedCabinIds: z.array(z.string().min(3)).max(20).optional(),
    requiresSpecificCabin: z.boolean().optional(),
    isActive: z.boolean().optional(),
    sortOrder: z.number().int().min(0).max(999).optional()
  })
  .refine((value) => {
    if (!value.requiresSpecificCabin) {
      return true;
    }
    return Boolean(value.cabinId) || Boolean(value.allowedCabinIds?.length);
  }, { message: "Si el tratamiento requiere cabina específica, debes seleccionar una cabina" });

export const agendaConfigUpdateSchema = z
  .object({
    timezone: z.string().min(3).optional(),
    slotMinutes: z.number().int().min(10).max(120).optional(),
    autoConfirmHours: z.number().int().min(0).max(72).optional(),
    noShowGraceMinutes: z.number().int().min(5).max(240).optional(),
    maxActiveAppointmentsPerWeek: z.number().int().min(1).max(50).optional(),
    maxActiveAppointmentsPerMonth: z.number().int().min(1).max(200).optional(),
    minAdvanceMinutes: z.number().int().min(0).max(10080).optional(),
    maxAdvanceDays: z.number().int().min(1).max(365).optional(),
    cabins: z
      .array(
        z.object({
          id: z.string().min(3).optional(),
          name: z.string().min(1).max(80),
          isActive: z.boolean().optional(),
          sortOrder: z.number().int().min(0).max(99).optional()
        })
      )
      .min(0)
      .max(20)
      .optional(),
    treatments: z.array(treatmentSchema).max(50).optional(),
    weeklyRules: z.array(weeklyRuleSchema).max(7).optional(),
    specialDateRules: z.array(specialDateRuleSchema).max(365).optional()
  })
  .refine((payload) => {
    if (payload.maxActiveAppointmentsPerWeek == null || payload.maxActiveAppointmentsPerMonth == null) {
      return true;
    }
    return payload.maxActiveAppointmentsPerMonth >= payload.maxActiveAppointmentsPerWeek;
  }, { message: "El límite mensual debe ser mayor o igual al límite semanal" });

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
