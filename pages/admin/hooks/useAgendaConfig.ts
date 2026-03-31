import { Dispatch, SetStateAction, useEffect, useState } from 'react';
import {
  AgendaCabin,
  AgendaConfig,
  AgendaDaySnapshot,
  AgendaSpecialDateRule,
  AgendaTreatment,
  AgendaWeeklyRule,
  clinicalService,
} from '../../../services/clinicalService';
import {
  GoogleCalendarIntegrationStatus,
  GoogleEventFormatMode,
  googleCalendarIntegrationService,
} from '../../../services/googleCalendarIntegrationService';
import { Member } from '../../../types';
import { AgendaPolicyDraft, AgendaTemplatePreset } from '../adminTypes';
import { toLocalDateKey, plusDays, weekDayForDateKey } from '../../../utils/date';

export interface AgendaConfigHook {
  // Fecha activa
  agendaDate: string;
  setAgendaDate: (date: string) => void;

  // Config y snapshot
  agendaConfig: AgendaConfig | null;
  agendaSnapshot: AgendaDaySnapshot | null;

  // Drafts de configuración
  agendaPolicyDraft: AgendaPolicyDraft;
  agendaCabinsDraft: AgendaCabin[];
  agendaTreatmentsDraft: AgendaTreatment[];
  agendaWeeklyRulesDraft: AgendaWeeklyRule[];
  agendaSpecialDateRulesDraft: AgendaSpecialDateRule[];

  // Selección activa
  selectedAgendaMemberId: string;
  setSelectedAgendaMemberId: (id: string) => void;
  selectedAgendaCabinId: string;
  setSelectedAgendaCabinId: (id: string) => void;
  selectedAgendaTreatmentId: string;
  setSelectedAgendaTreatmentId: (id: string) => void;

  // Template
  templateRangeStart: string;
  setTemplateRangeStart: (v: string) => void;
  templateRangeEnd: string;
  setTemplateRangeEnd: (v: string) => void;
  templatePreset: AgendaTemplatePreset;
  setTemplatePreset: (v: AgendaTemplatePreset) => void;
  templateDaysOfWeek: number[];

  // Bulk de semana
  weekBulkAction: 'open' | 'close' | 'clear';
  setWeekBulkAction: (v: 'open' | 'close' | 'clear') => void;
  weekBulkScope: 'week' | 'workdays' | 'weekend' | 'custom';
  setWeekBulkScope: (v: 'week' | 'workdays' | 'weekend' | 'custom') => void;
  weekBulkSelectedDays: number[];
  setWeekBulkSelectedDays: Dispatch<SetStateAction<number[]>>;
  weekBulkPreset: 'morning' | 'afternoon' | 'full' | 'custom';
  setWeekBulkPreset: (v: 'morning' | 'afternoon' | 'full' | 'custom') => void;
  weekBulkStart: number;
  setWeekBulkStart: (v: number) => void;
  weekBulkEnd: number;
  setWeekBulkEnd: (v: number) => void;
  weekBulkNote: string;
  setWeekBulkNote: (v: string) => void;

  // Estado de operaciones
  isAgendaSaving: boolean;
  isAgendaConfigSaving: boolean;
  agendaMessage: { type: 'ok' | 'error'; text: string } | null;
  setAgendaMessage: (msg: { type: 'ok' | 'error'; text: string } | null) => void;

  // Confirm cancel
  cancelConfirmApptId: string | null;
  setCancelConfirmApptId: (id: string | null) => void;

  // Google Calendar
  googleIntegrationStatus: GoogleCalendarIntegrationStatus | null;
  isGoogleIntegrationSaving: boolean;
  googleIntegrationMessage: { type: 'ok' | 'error'; text: string } | null;
  setGoogleIntegrationMessage: (msg: { type: 'ok' | 'error'; text: string } | null) => void;

  // Métodos de aplicación (llamados desde loadData)
  applyConfigData: (config: AgendaConfig) => void;
  applyDayData: (day: AgendaDaySnapshot) => void;
  applyGoogleStatus: (status: GoogleCalendarIntegrationStatus | null) => void;

  // Funciones de edición de draft
  updateAgendaPolicyField: (field: keyof AgendaPolicyDraft, value: string | number) => void;
  updateWeeklyRuleField: (dayOfWeek: number, changes: Partial<AgendaWeeklyRule>) => void;
  updateCabinDraftField: (cabinId: string, changes: Partial<AgendaCabin>) => void;
  removeCabinDraft: (cabinId: string) => void;
  addCabinDraft: () => void;
  updateTreatmentDraftField: (treatmentId: string, changes: Partial<AgendaTreatment>) => void;
  addTreatmentDraft: () => void;
  removeTreatmentDraft: (treatmentId: string) => void;
  toggleTreatmentCabinAllowed: (treatmentId: string, cabinId: string, checked: boolean) => void;
  moveTreatmentCabinPriority: (treatmentId: string, cabinId: string, direction: -1 | 1) => void;
  toggleTemplateDay: (dayOfWeek: number) => void;
  applySpecialTemplate: () => void;
  setSpecialRuleForDate: (isOpen: boolean, startHour?: number, endHour?: number) => void;
  clearSpecialRuleForDate: () => void;

  // Acciones de agenda
  applyWeekBulk: () => Promise<void>;
  saveAgendaConfiguration: () => Promise<void>;
  toggleAgendaSlotBlock: (slot: { startMinute: number; endMinute: number }) => Promise<void>;
  handleAgendaCreateAppointment: (slot: { label: string; blocked: boolean; available: number; startMinute: number; endMinute: number }) => Promise<void>;
  handleAgendaAppointmentAction: (appointmentId: string, action: 'cancel' | 'confirm' | 'complete' | 'mark_no_show', successMessage: string) => Promise<void>;
  handleAgendaCancelAppointment: (appointmentId: string) => void;
  confirmCancelAppointment: (appointmentId: string) => Promise<void>;

  // Acciones de Google Calendar
  handleGoogleConnect: (canManage: boolean) => Promise<void>;
  handleGoogleDisconnect: (canManage: boolean) => Promise<void>;
  handleGoogleModeChange: (mode: GoogleEventFormatMode, canManage: boolean) => Promise<void>;
}

const normalizeTreatmentDrafts = (items: AgendaTreatment[]): AgendaTreatment[] =>
  items.map((treatment) => ({
    ...treatment,
    prepBufferMinutes: treatment.prepBufferMinutes ?? 0,
    cleanupBufferMinutes: treatment.cleanupBufferMinutes ?? 0,
    allowedCabinIds: treatment.allowedCabinIds ?? (treatment.cabinId ? [treatment.cabinId] : []),
  }));

export const useAgendaConfig = (members: Member[]): AgendaConfigHook => {
  const [agendaDate, setAgendaDate] = useState(() => toLocalDateKey(new Date()));
  const [agendaConfig, setAgendaConfig] = useState<AgendaConfig | null>(null);
  const [agendaSnapshot, setAgendaSnapshot] = useState<AgendaDaySnapshot | null>(null);

  const [agendaPolicyDraft, setAgendaPolicyDraft] = useState<AgendaPolicyDraft>({
    timezone: 'America/Chihuahua',
    slotMinutes: 30,
    autoConfirmHours: 12,
    noShowGraceMinutes: 30,
    maxActiveAppointmentsPerWeek: 4,
    maxActiveAppointmentsPerMonth: 12,
    minAdvanceMinutes: 120,
    maxAdvanceDays: 60,
  });
  const [agendaCabinsDraft, setAgendaCabinsDraft] = useState<AgendaCabin[]>([]);
  const [agendaTreatmentsDraft, setAgendaTreatmentsDraft] = useState<AgendaTreatment[]>([]);
  const [agendaWeeklyRulesDraft, setAgendaWeeklyRulesDraft] = useState<AgendaWeeklyRule[]>([]);
  const [agendaSpecialDateRulesDraft, setAgendaSpecialDateRulesDraft] = useState<AgendaSpecialDateRule[]>([]);

  const [selectedAgendaMemberId, setSelectedAgendaMemberId] = useState('');
  const [selectedAgendaCabinId, setSelectedAgendaCabinId] = useState('');
  const [selectedAgendaTreatmentId, setSelectedAgendaTreatmentId] = useState('');

  const [templateRangeStart, setTemplateRangeStart] = useState(() => toLocalDateKey(new Date()));
  const [templateRangeEnd, setTemplateRangeEnd] = useState(() => toLocalDateKey(new Date()));
  const [templatePreset, setTemplatePreset] = useState<AgendaTemplatePreset>('weekly_copy');
  const [templateDaysOfWeek, setTemplateDaysOfWeek] = useState<number[]>([0, 1, 2, 3, 4, 5, 6]);

  const [weekBulkAction, setWeekBulkAction] = useState<'open' | 'close' | 'clear'>('open');
  const [weekBulkScope, setWeekBulkScope] = useState<'week' | 'workdays' | 'weekend' | 'custom'>('week');
  const [weekBulkSelectedDays, setWeekBulkSelectedDays] = useState<number[]>([1, 2, 3, 4, 5, 6, 0]);
  const [weekBulkPreset, setWeekBulkPreset] = useState<'morning' | 'afternoon' | 'full' | 'custom'>('full');
  const [weekBulkStart, setWeekBulkStart] = useState(8);
  const [weekBulkEnd, setWeekBulkEnd] = useState(20);
  const [weekBulkNote, setWeekBulkNote] = useState('');

  const [isAgendaSaving, setIsAgendaSaving] = useState(false);
  const [isAgendaConfigSaving, setIsAgendaConfigSaving] = useState(false);
  const [agendaMessage, setAgendaMessage] = useState<{ type: 'ok' | 'error'; text: string } | null>(null);
  const [cancelConfirmApptId, setCancelConfirmApptId] = useState<string | null>(null);

  const [googleIntegrationStatus, setGoogleIntegrationStatus] = useState<GoogleCalendarIntegrationStatus | null>(null);
  const [isGoogleIntegrationSaving, setIsGoogleIntegrationSaving] = useState(false);
  const [googleIntegrationMessage, setGoogleIntegrationMessage] = useState<{ type: 'ok' | 'error'; text: string } | null>(null);

  // ── Auto-selección de miembro ──────────────────────────────────────────────
  useEffect(() => {
    if (members.length === 0) return;
    if (selectedAgendaMemberId && members.some((m) => m.id === selectedAgendaMemberId)) return;
    setSelectedAgendaMemberId(members[0].id);
  }, [members, selectedAgendaMemberId]);

  // ── Auto-selección de cabina ───────────────────────────────────────────────
  useEffect(() => {
    const activeCabins = agendaSnapshot?.cabins ?? agendaConfig?.cabins.filter((c) => c.isActive) ?? [];
    if (activeCabins.length === 0) { setSelectedAgendaCabinId(''); return; }
    if (selectedAgendaCabinId && activeCabins.some((c) => c.id === selectedAgendaCabinId)) return;
    setSelectedAgendaCabinId(activeCabins[0].id);
  }, [agendaSnapshot?.cabins, agendaConfig?.cabins, selectedAgendaCabinId]);

  // ── Auto-selección de tratamiento ──────────────────────────────────────────
  useEffect(() => {
    const activeTreatments = agendaTreatmentsDraft
      .filter((t) => t.isActive)
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
    if (activeTreatments.length === 0) { setSelectedAgendaTreatmentId(''); return; }
    if (selectedAgendaTreatmentId && activeTreatments.some((t) => t.id === selectedAgendaTreatmentId)) return;
    setSelectedAgendaTreatmentId(activeTreatments[0].id);
  }, [agendaTreatmentsDraft, selectedAgendaTreatmentId]);

  // ── Sincroniza cabina con tratamiento cuando requiresSpecificCabin ─────────
  useEffect(() => {
    const selectedTreatment = agendaTreatmentsDraft.find((t) => t.id === selectedAgendaTreatmentId);
    const preferredCabinId = selectedTreatment?.allowedCabinIds?.[0] ?? selectedTreatment?.cabinId;
    if (!selectedTreatment?.requiresSpecificCabin || !preferredCabinId) return;
    if (selectedAgendaCabinId === preferredCabinId) return;
    setSelectedAgendaCabinId(preferredCabinId);
  }, [agendaTreatmentsDraft, selectedAgendaTreatmentId, selectedAgendaCabinId]);

  // ── Métodos de aplicación (llamados por loadData en useAdminData) ──────────

  const applyConfigData = (config: AgendaConfig) => {
    setAgendaConfig(config);
    setAgendaPolicyDraft({
      timezone: config.policy.timezone,
      slotMinutes: config.policy.slotMinutes,
      autoConfirmHours: config.policy.autoConfirmHours,
      noShowGraceMinutes: config.policy.noShowGraceMinutes,
      maxActiveAppointmentsPerWeek: config.policy.maxActiveAppointmentsPerWeek,
      maxActiveAppointmentsPerMonth: config.policy.maxActiveAppointmentsPerMonth,
      minAdvanceMinutes: config.policy.minAdvanceMinutes,
      maxAdvanceDays: config.policy.maxAdvanceDays,
    });
    setAgendaCabinsDraft(config.cabins);
    setAgendaTreatmentsDraft(normalizeTreatmentDrafts(config.treatments ?? []));
    setAgendaWeeklyRulesDraft(config.weeklyRules);
    setAgendaSpecialDateRulesDraft(config.specialDateRules);
  };

  const applyDayData = (day: AgendaDaySnapshot) => {
    setAgendaSnapshot(day);
  };

  const applyGoogleStatus = (status: GoogleCalendarIntegrationStatus | null) => {
    setGoogleIntegrationStatus(status);
  };

  // ── Edición de drafts ──────────────────────────────────────────────────────

  const updateAgendaPolicyField = (field: keyof AgendaPolicyDraft, value: string | number) => {
    setAgendaPolicyDraft((current) => {
      const next = { ...current, [field]: value };
      return {
        timezone: String(next.timezone),
        slotMinutes: [10, 15, 20, 30, 45, 60, 90, 120].includes(Number(next.slotMinutes)) ? Number(next.slotMinutes) : 30,
        autoConfirmHours: Math.min(Math.max(Number(next.autoConfirmHours), 0), 72),
        noShowGraceMinutes: Math.min(Math.max(Number(next.noShowGraceMinutes), 5), 240),
        maxActiveAppointmentsPerWeek: Math.min(Math.max(Number(next.maxActiveAppointmentsPerWeek), 1), 50),
        maxActiveAppointmentsPerMonth: Math.min(Math.max(Number(next.maxActiveAppointmentsPerMonth), 1), 200),
        minAdvanceMinutes: Math.min(Math.max(Number(next.minAdvanceMinutes), 0), 10080),
        maxAdvanceDays: Math.min(Math.max(Number(next.maxAdvanceDays), 1), 365),
      };
    });
  };

  const updateWeeklyRuleField = (dayOfWeek: number, changes: Partial<AgendaWeeklyRule>) => {
    setAgendaWeeklyRulesDraft((current) =>
      current.map((rule) => (rule.dayOfWeek === dayOfWeek ? { ...rule, ...changes } : rule))
    );
  };

  const updateCabinDraftField = (cabinId: string, changes: Partial<AgendaCabin>) => {
    setAgendaCabinsDraft((current) => current.map((c) => (c.id === cabinId ? { ...c, ...changes } : c)));
  };

  const removeCabinDraft = (cabinId: string) => {
    setAgendaCabinsDraft((current) => current.filter((c) => c.id !== cabinId));
    setAgendaTreatmentsDraft((current) =>
      current.map((t) => ({
        ...t,
        cabinId: t.cabinId === cabinId ? null : t.cabinId,
        allowedCabinIds: (t.allowedCabinIds ?? []).filter((candidate) => candidate !== cabinId),
        requiresSpecificCabin:
          t.requiresSpecificCabin &&
          (t.allowedCabinIds ?? []).filter((candidate) => candidate !== cabinId).length > 0,
      }))
    );
    if (selectedAgendaCabinId === cabinId) setSelectedAgendaCabinId('');
  };

  const addCabinDraft = () => {
    setAgendaCabinsDraft((current) => [
      ...current,
      { id: `draft-${Date.now()}`, name: `Cabina ${current.length + 1}`, isActive: true, sortOrder: current.length + 1 },
    ]);
  };

  const updateTreatmentDraftField = (treatmentId: string, changes: Partial<AgendaTreatment>) => {
    setAgendaTreatmentsDraft((current) =>
      current.map((t) => (t.id === treatmentId ? { ...t, ...changes } : t))
    );
  };

  const addTreatmentDraft = () => {
    setAgendaTreatmentsDraft((current) => [
      ...current,
      {
        id: `draft-treatment-${Date.now()}`,
        name: `Tratamiento ${current.length + 1}`,
        code: `treatment_${current.length + 1}`,
        description: null,
        durationMinutes: 45,
        prepBufferMinutes: 0,
        cleanupBufferMinutes: 0,
        cabinId: null,
        allowedCabinIds: [],
        requiresSpecificCabin: false,
        isActive: true,
        sortOrder: current.length + 1,
      },
    ]);
  };

  const removeTreatmentDraft = (treatmentId: string) => {
    setAgendaTreatmentsDraft((current) => current.filter((t) => t.id !== treatmentId));
    if (selectedAgendaTreatmentId === treatmentId) setSelectedAgendaTreatmentId('');
  };

  const toggleTreatmentCabinAllowed = (treatmentId: string, cabinId: string, checked: boolean) => {
    setAgendaTreatmentsDraft((current) =>
      current.map((t) => {
        if (t.id !== treatmentId) return t;
        const currentAllowed = t.allowedCabinIds ?? [];
        const nextAllowed = checked
          ? currentAllowed.includes(cabinId) ? currentAllowed : [...currentAllowed, cabinId]
          : currentAllowed.filter((candidate) => candidate !== cabinId);
        return {
          ...t,
          allowedCabinIds: nextAllowed,
          cabinId: nextAllowed[0] ?? null,
          requiresSpecificCabin: t.requiresSpecificCabin ? nextAllowed.length > 0 : false,
        };
      })
    );
  };

  const moveTreatmentCabinPriority = (treatmentId: string, cabinId: string, direction: -1 | 1) => {
    setAgendaTreatmentsDraft((current) =>
      current.map((t) => {
        if (t.id !== treatmentId) return t;
        const allowed = [...(t.allowedCabinIds ?? [])];
        const index = allowed.indexOf(cabinId);
        if (index < 0) return t;
        const nextIndex = index + direction;
        if (nextIndex < 0 || nextIndex >= allowed.length) return t;
        [allowed[index], allowed[nextIndex]] = [allowed[nextIndex], allowed[index]];
        return { ...t, allowedCabinIds: allowed, cabinId: allowed[0] ?? null };
      })
    );
  };

  const toggleTemplateDay = (dayOfWeek: number) => {
    setTemplateDaysOfWeek((current) => {
      if (current.includes(dayOfWeek)) return current.filter((d) => d !== dayOfWeek);
      return [...current, dayOfWeek].sort((a, b) => a - b);
    });
  };

  const applySpecialTemplate = () => {
    const [startYear, startMonth, startDay] = templateRangeStart.split('-').map(Number);
    const [endYear, endMonth, endDay] = templateRangeEnd.split('-').map(Number);
    const start = new Date(startYear, (startMonth ?? 1) - 1, startDay ?? 1);
    const end = new Date(endYear, (endMonth ?? 1) - 1, endDay ?? 1);

    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      setAgendaMessage({ type: 'error', text: 'El rango de plantilla no es válido.' });
      return;
    }
    if (start > end) {
      setAgendaMessage({ type: 'error', text: 'La fecha inicial debe ser menor o igual a la final.' });
      return;
    }
    if (templateDaysOfWeek.length === 0) {
      setAgendaMessage({ type: 'error', text: 'Selecciona al menos un día de semana para aplicar la plantilla.' });
      return;
    }

    const draftByDate = new Map<string, AgendaSpecialDateRule>(
      agendaSpecialDateRulesDraft.map((rule) => [rule.dateKey, rule])
    );
    let cursor = start;
    let updatedCount = 0;
    let safety = 0;
    while (cursor <= end && safety < 370) {
      const dateKey = toLocalDateKey(cursor);
      const dayOfWeek = weekDayForDateKey(dateKey);
      safety += 1;
      if (!templateDaysOfWeek.includes(dayOfWeek)) { cursor = plusDays(cursor, 1); continue; }

      const existing = draftByDate.get(dateKey);
      let nextRule: AgendaSpecialDateRule | null = null;

      if (templatePreset === 'weekly_copy') {
        const weekly = agendaWeeklyRulesDraft.find((rule) => rule.dayOfWeek === dayOfWeek);
        if (weekly) {
          nextRule = {
            id: existing?.id ?? `draft-template-${dateKey}`,
            dateKey,
            isOpen: weekly.isOpen,
            startHour: weekly.isOpen ? weekly.startHour : null,
            endHour: weekly.isOpen ? weekly.endHour : null,
            note: existing?.note ?? 'Aplicado desde plantilla semanal',
          };
        }
      }
      if (templatePreset === 'holiday_closed') {
        nextRule = { id: existing?.id ?? `draft-template-${dateKey}`, dateKey, isOpen: false, startHour: null, endHour: null, note: 'Feriado / cierre especial' };
      }
      if (templatePreset === 'season_extended') {
        nextRule = { id: existing?.id ?? `draft-template-${dateKey}`, dateKey, isOpen: true, startHour: 8, endHour: 22, note: 'Temporada alta' };
      }
      if (templatePreset === 'season_compact') {
        nextRule = { id: existing?.id ?? `draft-template-${dateKey}`, dateKey, isOpen: true, startHour: 10, endHour: 18, note: 'Temporada baja' };
      }

      if (nextRule) { draftByDate.set(dateKey, nextRule); updatedCount += 1; }
      cursor = plusDays(cursor, 1);
    }

    setAgendaSpecialDateRulesDraft(
      [...draftByDate.values()].sort((a, b) => a.dateKey.localeCompare(b.dateKey))
    );
    setAgendaMessage({ type: 'ok', text: `Plantilla aplicada a ${updatedCount} fecha(s). Guarda configuración para confirmar.` });
  };

  const setSpecialRuleForDate = (isOpen: boolean, startHour?: number, endHour?: number) => {
    setAgendaSpecialDateRulesDraft((current) => {
      const next = [...current];
      const index = next.findIndex((rule) => rule.dateKey === agendaDate);
      const incoming: AgendaSpecialDateRule = index >= 0
        ? { ...next[index], isOpen, startHour: startHour ?? next[index].startHour, endHour: endHour ?? next[index].endHour }
        : { id: `draft-${agendaDate}`, dateKey: agendaDate, isOpen, startHour: startHour ?? 9, endHour: endHour ?? 20, note: null };
      if (index >= 0) { next[index] = incoming; } else { next.push(incoming); }
      return next;
    });
  };

  const clearSpecialRuleForDate = () => {
    setAgendaSpecialDateRulesDraft((current) => current.filter((rule) => rule.dateKey !== agendaDate));
  };

  // ── Helpers de payload de configuración ───────────────────────────────────

  const buildConfigPayload = (overrideSpecialRules?: AgendaSpecialDateRule[]) => {
    const specialDateRules = overrideSpecialRules ?? agendaSpecialDateRulesDraft;
    return {
      timezone: agendaPolicyDraft.timezone,
      slotMinutes: agendaPolicyDraft.slotMinutes,
      autoConfirmHours: agendaPolicyDraft.autoConfirmHours,
      noShowGraceMinutes: agendaPolicyDraft.noShowGraceMinutes,
      maxActiveAppointmentsPerWeek: agendaPolicyDraft.maxActiveAppointmentsPerWeek,
      maxActiveAppointmentsPerMonth: agendaPolicyDraft.maxActiveAppointmentsPerMonth,
      minAdvanceMinutes: agendaPolicyDraft.minAdvanceMinutes,
      maxAdvanceDays: agendaPolicyDraft.maxAdvanceDays,
      cabins: agendaCabinsDraft.map((c, i) => ({
        id: c.id.startsWith('draft-') ? undefined : c.id,
        name: c.name,
        isActive: c.isActive,
        sortOrder: c.sortOrder ?? i + 1,
      })),
      treatments: agendaTreatmentsDraft.map((t, i) => ({
        id: t.id.startsWith('draft-treatment-') ? undefined : t.id,
        name: t.name.trim(),
        code: t.code.trim().toLowerCase(),
        description: t.description ?? null,
        durationMinutes: t.durationMinutes,
        prepBufferMinutes: t.prepBufferMinutes ?? 0,
        cleanupBufferMinutes: t.cleanupBufferMinutes ?? 0,
        cabinId: (t.allowedCabinIds ?? [])[0] ?? t.cabinId ?? null,
        allowedCabinIds: t.allowedCabinIds ?? [],
        requiresSpecificCabin: t.requiresSpecificCabin,
        isActive: t.isActive,
        sortOrder: t.sortOrder ?? i + 1,
      })),
      weeklyRules: agendaWeeklyRulesDraft.map((r) => ({
        dayOfWeek: r.dayOfWeek,
        isOpen: r.isOpen,
        startHour: r.startHour,
        endHour: r.endHour,
      })),
      specialDateRules: specialDateRules.map((r) => ({
        dateKey: r.dateKey,
        isOpen: r.isOpen,
        startHour: r.startHour ?? null,
        endHour: r.endHour ?? null,
        note: r.note ?? null,
      })),
    };
  };

  // ── Acciones de agenda ─────────────────────────────────────────────────────

  const applyWeekBulk = async () => {
    const ref = new Date(agendaDate + 'T12:00:00');
    const dow = ref.getDay();
    const offsetToMonday = dow === 0 ? -6 : 1 - dow;
    const monday = plusDays(ref, offsetToMonday);

    let targetDays: number[];
    if (weekBulkScope === 'week') targetDays = [1, 2, 3, 4, 5, 6, 0];
    else if (weekBulkScope === 'workdays') targetDays = [1, 2, 3, 4, 5];
    else if (weekBulkScope === 'weekend') targetDays = [6, 0];
    else targetDays = weekBulkSelectedDays;

    const note =
      weekBulkNote.trim() ||
      (weekBulkAction === 'open' ? `Abierto ${weekBulkStart}:00–${weekBulkEnd}:00` : weekBulkAction === 'close' ? 'Cerrado' : 'Horario base');

    const byDate = new Map<string, AgendaSpecialDateRule>(agendaSpecialDateRulesDraft.map((r) => [r.dateKey, r]));
    for (let i = 0; i < 7; i++) {
      const d = plusDays(monday, i);
      const dayOfWeek = d.getDay();
      if (!targetDays.includes(dayOfWeek)) continue;
      const dateKey = toLocalDateKey(d);
      if (weekBulkAction === 'clear') {
        byDate.delete(dateKey);
      } else {
        const existing = byDate.get(dateKey);
        byDate.set(dateKey, {
          id: existing?.id ?? `draft-week-${dateKey}`,
          dateKey,
          isOpen: weekBulkAction === 'open',
          startHour: weekBulkAction === 'open' ? weekBulkStart : null,
          endHour: weekBulkAction === 'open' ? weekBulkEnd : null,
          note,
        });
      }
    }
    const newSpecialRules = [...byDate.values()].sort((a, b) => a.dateKey.localeCompare(b.dateKey));
    setAgendaSpecialDateRulesDraft(newSpecialRules);

    setIsAgendaConfigSaving(true);
    setAgendaMessage(null);
    try {
      const updatedConfig = await clinicalService.updateAdminAgendaConfig(buildConfigPayload(newSpecialRules));
      setAgendaConfig(updatedConfig);
      setAgendaWeeklyRulesDraft(updatedConfig.weeklyRules);
      setAgendaSpecialDateRulesDraft(updatedConfig.specialDateRules);
      const snapshot = await clinicalService.getAdminAgendaDay(agendaDate);
      setAgendaSnapshot(snapshot);
      const scopeLabel =
        weekBulkScope === 'week' ? 'toda la semana' :
        weekBulkScope === 'workdays' ? 'Lun–Vie' :
        weekBulkScope === 'weekend' ? 'Sáb–Dom' :
        `${targetDays.length} días`;
      const actionLabel =
        weekBulkAction === 'open' ? `abierto ${weekBulkStart}:00–${weekBulkEnd}:00` :
        weekBulkAction === 'close' ? 'cerrado' : 'horario base restaurado';
      setAgendaMessage({ type: 'ok', text: `✓ Guardado: ${scopeLabel} → ${actionLabel}` });
    } catch (error: any) {
      setAgendaMessage({ type: 'error', text: error?.message ?? 'No fue posible guardar la configuración.' });
    } finally {
      setIsAgendaConfigSaving(false);
    }
  };

  const saveAgendaConfiguration = async () => {
    if (!agendaCabinsDraft.some((c) => c.isActive)) {
      setAgendaMessage({ type: 'error', text: 'Debes mantener al menos una cabina activa.' });
      return;
    }
    if (agendaPolicyDraft.maxActiveAppointmentsPerMonth < agendaPolicyDraft.maxActiveAppointmentsPerWeek) {
      setAgendaMessage({ type: 'error', text: 'El límite mensual de citas activas debe ser mayor o igual al límite semanal.' });
      return;
    }

    const normalizedCodes = agendaTreatmentsDraft.map((t) => t.code.trim().toLowerCase());
    const duplicateCode = normalizedCodes.find((code, index) => code && normalizedCodes.indexOf(code) !== index);
    if (duplicateCode) { setAgendaMessage({ type: 'error', text: `El código "${duplicateCode}" está repetido en tratamientos.` }); return; }
    const missingCode = normalizedCodes.find((code) => code.length === 0);
    if (missingCode !== undefined) { setAgendaMessage({ type: 'error', text: 'Todos los tratamientos deben tener código.' }); return; }
    const invalidCode = normalizedCodes.find((code) => code.length > 0 && !/^[a-z0-9_]+$/.test(code));
    if (invalidCode) { setAgendaMessage({ type: 'error', text: 'El código del tratamiento solo acepta letras minúsculas, números y guion bajo.' }); return; }
    const invalidTreatmentName = agendaTreatmentsDraft.find((t) => t.name.trim().length === 0);
    if (invalidTreatmentName) { setAgendaMessage({ type: 'error', text: 'Todos los tratamientos deben tener nombre.' }); return; }
    const invalidDuration = agendaTreatmentsDraft.find((t) => t.durationMinutes % agendaPolicyDraft.slotMinutes !== 0);
    if (invalidDuration) {
      setAgendaMessage({ type: 'error', text: `La duración de "${invalidDuration.name}" debe ser múltiplo del intervalo (${agendaPolicyDraft.slotMinutes} min).` });
      return;
    }

    const cabinIdSet = new Set(agendaCabinsDraft.map((c) => c.id));
    const activeCabinIdSet = new Set(agendaCabinsDraft.filter((c) => c.isActive).map((c) => c.id));
    const treatmentWithoutCabin = agendaTreatmentsDraft.find(
      (t) => t.requiresSpecificCabin && (t.allowedCabinIds ?? []).length === 0
    );
    if (treatmentWithoutCabin) {
      setAgendaMessage({ type: 'error', text: `El tratamiento "${treatmentWithoutCabin.name}" requiere cabina específica, pero no tiene cabinas permitidas.` });
      return;
    }
    const treatmentWithInactiveCabin = agendaTreatmentsDraft.find(
      (t) => t.requiresSpecificCabin && (t.allowedCabinIds ?? []).some((id) => !activeCabinIdSet.has(id))
    );
    if (treatmentWithInactiveCabin) {
      setAgendaMessage({ type: 'error', text: `El tratamiento "${treatmentWithInactiveCabin.name}" solo puede usar cabinas activas.` });
      return;
    }
    const treatmentWithMissingCabin = agendaTreatmentsDraft.find(
      (t) => (t.allowedCabinIds ?? []).some((id) => !cabinIdSet.has(id))
    );
    if (treatmentWithMissingCabin) {
      setAgendaMessage({ type: 'error', text: `El tratamiento "${treatmentWithMissingCabin.name}" apunta a una cabina que ya no existe.` });
      return;
    }

    setIsAgendaConfigSaving(true);
    setAgendaMessage(null);
    try {
      const updatedConfig = await clinicalService.updateAdminAgendaConfig(buildConfigPayload());
      setAgendaConfig(updatedConfig);
      setAgendaPolicyDraft({
        timezone: updatedConfig.policy.timezone,
        slotMinutes: updatedConfig.policy.slotMinutes,
        autoConfirmHours: updatedConfig.policy.autoConfirmHours,
        noShowGraceMinutes: updatedConfig.policy.noShowGraceMinutes,
        maxActiveAppointmentsPerWeek: updatedConfig.policy.maxActiveAppointmentsPerWeek,
        maxActiveAppointmentsPerMonth: updatedConfig.policy.maxActiveAppointmentsPerMonth,
        minAdvanceMinutes: updatedConfig.policy.minAdvanceMinutes,
        maxAdvanceDays: updatedConfig.policy.maxAdvanceDays,
      });
      setAgendaCabinsDraft(updatedConfig.cabins);
      setAgendaTreatmentsDraft(normalizeTreatmentDrafts(updatedConfig.treatments ?? []));
      setAgendaWeeklyRulesDraft(updatedConfig.weeklyRules);
      setAgendaSpecialDateRulesDraft(updatedConfig.specialDateRules);
      const snapshot = await clinicalService.getAdminAgendaDay(agendaDate);
      setAgendaSnapshot(snapshot);
      setAgendaMessage({ type: 'ok', text: 'Configuración de agenda guardada.' });
    } catch (error: any) {
      setAgendaMessage({ type: 'error', text: error?.message ?? 'No fue posible guardar la configuración.' });
    } finally {
      setIsAgendaConfigSaving(false);
    }
  };

  const toggleAgendaSlotBlock = async (slot: { startMinute: number; endMinute: number }) => {
    const cabinId = selectedAgendaCabinId || null;
    const block = (agendaSnapshot?.blocks ?? []).find(
      (candidate) =>
        candidate.dateKey === agendaDate &&
        candidate.startMinute === slot.startMinute &&
        candidate.endMinute === slot.endMinute &&
        (candidate.cabinId ?? null) === cabinId
    );

    setIsAgendaSaving(true);
    setAgendaMessage(null);
    try {
      if (block) {
        await clinicalService.deleteAdminAgendaBlock(block.id);
      } else {
        await clinicalService.createAdminAgendaBlock({
          dateKey: agendaDate,
          startMinute: slot.startMinute,
          endMinute: slot.endMinute,
          cabinId,
          reason: cabinId ? 'Bloqueo por cabina desde panel admin' : 'Bloqueo general desde panel admin',
        });
      }
      const snapshot = await clinicalService.getAdminAgendaDay(agendaDate);
      setAgendaSnapshot(snapshot);
      setAgendaMessage({ type: 'ok', text: block ? 'Bloqueo removido.' : 'Bloqueo aplicado.' });
    } catch (error: any) {
      setAgendaMessage({ type: 'error', text: error?.message ?? 'No fue posible actualizar el bloqueo.' });
    } finally {
      setIsAgendaSaving(false);
    }
  };

  const handleAgendaCreateAppointment = async (slot: { label: string; blocked: boolean; available: number; startMinute: number; endMinute: number }) => {
    if (!selectedAgendaMemberId) {
      setAgendaMessage({ type: 'error', text: 'Selecciona un socio para agendar.' });
      return;
    }
    if (slot.blocked || slot.available <= 0) {
      setAgendaMessage({ type: 'error', text: 'El slot seleccionado no tiene capacidad disponible.' });
      return;
    }

    setIsAgendaSaving(true);
    setAgendaMessage(null);
    try {
      const slotStart = new Date(`${agendaDate}T00:00:00`);
      slotStart.setHours(0, slot.startMinute, 0, 0);
      const selectedTreatment = agendaTreatmentsDraft.find((t) => t.id === selectedAgendaTreatmentId);
      const preferredCabinIds = selectedTreatment?.allowedCabinIds ?? (selectedTreatment?.cabinId ? [selectedTreatment.cabinId] : []);
      const requestedCabinId = selectedTreatment?.requiresSpecificCabin
        ? preferredCabinIds[0] ?? undefined
        : selectedAgendaCabinId || preferredCabinIds[0] || undefined;
      const durationMinutes = selectedTreatment?.durationMinutes ?? slot.endMinute - slot.startMinute;
      const slotEnd = new Date(slotStart.getTime() + durationMinutes * 60 * 1000);

      if (selectedTreatment?.requiresSpecificCabin && preferredCabinIds.length === 0) {
        setAgendaMessage({ type: 'error', text: `El tratamiento "${selectedTreatment.name}" requiere cabina específica, pero no tiene cabinas configuradas.` });
        return;
      }

      await clinicalService.createAppointment({
        userId: selectedAgendaMemberId,
        cabinId: requestedCabinId,
        treatmentId: selectedTreatment?.id,
        startAt: slotStart.toISOString(),
        endAt: slotEnd.toISOString(),
        reason: selectedTreatment?.code ?? (selectedAgendaCabinId ? 'admin.manual_schedule.cabin' : 'admin.manual_schedule'),
      });
      const snapshot = await clinicalService.getAdminAgendaDay(agendaDate);
      setAgendaSnapshot(snapshot);
      setAgendaMessage({ type: 'ok', text: `Cita creada en ${slot.label}.` });
    } catch (error: any) {
      setAgendaMessage({ type: 'error', text: error?.message ?? 'No fue posible agendar en ese horario.' });
    } finally {
      setIsAgendaSaving(false);
    }
  };

  const handleAgendaAppointmentAction = async (
    appointmentId: string,
    action: 'cancel' | 'confirm' | 'complete' | 'mark_no_show',
    successMessage: string
  ) => {
    setIsAgendaSaving(true);
    setAgendaMessage(null);
    try {
      await clinicalService.updateAppointment(appointmentId, {
        action,
        canceledReason: action === 'cancel' ? 'Cancelación operativa desde panel admin' : undefined,
      });
      const snapshot = await clinicalService.getAdminAgendaDay(agendaDate);
      setAgendaSnapshot(snapshot);
      setAgendaMessage({ type: 'ok', text: successMessage });
    } catch (error: any) {
      setAgendaMessage({ type: 'error', text: error?.message ?? 'No fue posible ejecutar la acción de agenda.' });
    } finally {
      setIsAgendaSaving(false);
    }
  };

  const handleAgendaCancelAppointment = (appointmentId: string) => {
    setCancelConfirmApptId(appointmentId);
  };

  const confirmCancelAppointment = async (appointmentId: string) => {
    setCancelConfirmApptId(null);
    await handleAgendaAppointmentAction(appointmentId, 'cancel', 'Cita cancelada correctamente.');
  };

  // ── Google Calendar ────────────────────────────────────────────────────────

  const handleGoogleConnect = async (canManage: boolean) => {
    if (!canManage) return;
    setIsGoogleIntegrationSaving(true);
    setGoogleIntegrationMessage(null);
    try {
      const response = await googleCalendarIntegrationService.connect();
      if (typeof window !== 'undefined') window.location.href = response.url;
    } catch (error: any) {
      setGoogleIntegrationMessage({ type: 'error', text: error?.message ?? 'No fue posible iniciar la conexión con Google Calendar.' });
    } finally {
      setIsGoogleIntegrationSaving(false);
    }
  };

  const handleGoogleDisconnect = async (canManage: boolean) => {
    if (!canManage) return;
    setIsGoogleIntegrationSaving(true);
    setGoogleIntegrationMessage(null);
    try {
      await googleCalendarIntegrationService.disconnect();
      const status = await googleCalendarIntegrationService.getStatus();
      setGoogleIntegrationStatus(status);
      setGoogleIntegrationMessage({ type: 'ok', text: 'Google Calendar desconectado.' });
    } catch (error: any) {
      setGoogleIntegrationMessage({ type: 'error', text: error?.message ?? 'No fue posible desconectar Google Calendar.' });
    } finally {
      setIsGoogleIntegrationSaving(false);
    }
  };

  const handleGoogleModeChange = async (mode: GoogleEventFormatMode, canManage: boolean) => {
    if (!canManage) return;
    setIsGoogleIntegrationSaving(true);
    setGoogleIntegrationMessage(null);
    try {
      const response = await googleCalendarIntegrationService.updateSettings(mode);
      setGoogleIntegrationStatus((current) => ({
        connected: current?.connected ?? true,
        email: current?.email ?? null,
        calendarId: current?.calendarId ?? null,
        eventFormatMode: response.eventFormatMode,
        lastSyncAt: current?.lastSyncAt ?? null,
        watchExpiration: current?.watchExpiration ?? null,
      }));
      setGoogleIntegrationMessage({ type: 'ok', text: 'Preferencias de privacidad actualizadas.' });
    } catch (error: any) {
      setGoogleIntegrationMessage({ type: 'error', text: error?.message ?? 'No fue posible actualizar el formato del evento.' });
    } finally {
      setIsGoogleIntegrationSaving(false);
    }
  };

  return {
    agendaDate,
    setAgendaDate,
    agendaConfig,
    agendaSnapshot,
    agendaPolicyDraft,
    agendaCabinsDraft,
    agendaTreatmentsDraft,
    agendaWeeklyRulesDraft,
    agendaSpecialDateRulesDraft,
    selectedAgendaMemberId,
    setSelectedAgendaMemberId,
    selectedAgendaCabinId,
    setSelectedAgendaCabinId,
    selectedAgendaTreatmentId,
    setSelectedAgendaTreatmentId,
    templateRangeStart,
    setTemplateRangeStart,
    templateRangeEnd,
    setTemplateRangeEnd,
    templatePreset,
    setTemplatePreset,
    templateDaysOfWeek,
    weekBulkAction,
    setWeekBulkAction,
    weekBulkScope,
    setWeekBulkScope,
    weekBulkSelectedDays,
    setWeekBulkSelectedDays,
    weekBulkPreset,
    setWeekBulkPreset,
    weekBulkStart,
    setWeekBulkStart,
    weekBulkEnd,
    setWeekBulkEnd,
    weekBulkNote,
    setWeekBulkNote,
    isAgendaSaving,
    isAgendaConfigSaving,
    agendaMessage,
    setAgendaMessage,
    cancelConfirmApptId,
    setCancelConfirmApptId,
    googleIntegrationStatus,
    isGoogleIntegrationSaving,
    googleIntegrationMessage,
    setGoogleIntegrationMessage,
    applyConfigData,
    applyDayData,
    applyGoogleStatus,
    updateAgendaPolicyField,
    updateWeeklyRuleField,
    updateCabinDraftField,
    removeCabinDraft,
    addCabinDraft,
    updateTreatmentDraftField,
    addTreatmentDraft,
    removeTreatmentDraft,
    toggleTreatmentCabinAllowed,
    moveTreatmentCabinPriority,
    toggleTemplateDay,
    applySpecialTemplate,
    setSpecialRuleForDate,
    clearSpecialRuleForDate,
    applyWeekBulk,
    saveAgendaConfiguration,
    toggleAgendaSlotBlock,
    handleAgendaCreateAppointment,
    handleAgendaAppointmentAction,
    handleAgendaCancelAppointment,
    confirmCancelAppointment,
    handleGoogleConnect,
    handleGoogleDisconnect,
    handleGoogleModeChange,
  };
};
