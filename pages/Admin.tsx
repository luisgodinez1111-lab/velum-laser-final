import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '../components/Button';
import { PasswordInput } from '../components/PasswordInput';
import { VelumLogo } from '../components/VelumLogo';
import { AgendaIntegrations } from './settings/AgendaIntegrations';
import {
  Users,
  BarChart3,
  Wallet,
  FolderOpen,
  CalendarDays,
  Settings,
  ShieldCheck,
  LogOut,
  Menu,
  X,
  ChevronLeft,
  ChevronRight,
  Search,
  RefreshCw,
  AlertTriangle,
  Activity,
  Target,
  FileText,
  Clock3,
  ArrowRight,
  CheckCircle2,
  CircleAlert,
  Shield,
  HandCoins,
  Trash2,
  Zap,
  ClipboardList,
  CheckCheck,
  XCircle
} from 'lucide-react';
import { AuditLogEntry, Member, UserRole } from '../types';
import { useAuth } from '../context/AuthContext';
import { memberService, auditService } from '../services/dataService';
import { SessionTreatment, SessionCreatePayload, MedicalIntake } from '../services/clinicalService';
import { AdminUsersPermissions } from "./AdminUsersPermissions";
import { AdminStripeSettings } from "./AdminStripeSettings";
import { AdminWhatsAppSettings } from "./AdminWhatsAppSettings";
import { useToast } from "../context/ToastContext";
import {
  AgendaCabin,
  AgendaConfig,
  AgendaDaySnapshot,
  AgendaSpecialDateRule,
  AgendaTreatment,
  AgendaWeeklyRule,
  Appointment,
  clinicalService
} from '../services/clinicalService';
import {
  GoogleCalendarIntegrationStatus,
  GoogleEventFormatMode,
  googleCalendarIntegrationService
} from '../services/googleCalendarIntegrationService';

type AdminSection = 'panel' | 'socias' | 'agenda' | 'expedientes' | 'ajustes';

type HealthFlag = 'ok' | 'warning' | 'critical';

type ControlAlert = {
  id: string;
  level: HealthFlag;
  title: string;
  detail: string;
  section: AdminSection;
};

type AgendaPolicyDraft = {
  timezone: string;
  slotMinutes: number;
  autoConfirmHours: number;
  noShowGraceMinutes: number;
  maxActiveAppointmentsPerWeek: number;
  maxActiveAppointmentsPerMonth: number;
  minAdvanceMinutes: number;
  maxAdvanceDays: number;
};

type AgendaTemplatePreset = 'weekly_copy' | 'holiday_closed' | 'season_extended' | 'season_compact';

type SettingsCategory = 'agenda' | 'sistema' | 'integraciones' | 'auditoria';

const weekDayLabel: Record<number, string> = {
  0: 'Domingo',
  1: 'Lunes',
  2: 'Martes',
  3: 'Miércoles',
  4: 'Jueves',
  5: 'Viernes',
  6: 'Sábado'
};

const sectionMeta: Record<AdminSection, { label: string; icon: React.ComponentType<any> }> = {
  panel:       { label: 'Panel',        icon: Activity },
  socias:      { label: 'Socias',       icon: Users },
  agenda:      { label: 'Agenda',       icon: CalendarDays },
  expedientes: { label: 'Expedientes',  icon: FolderOpen },
  ajustes:     { label: 'Ajustes',      icon: Settings },
};

const NAV_SECTIONS: AdminSection[] = ['panel', 'socias', 'agenda', 'expedientes', 'ajustes'];

const allowedRoles: UserRole[] = ['admin', 'staff', 'system'];

const roleTitle: Record<UserRole, string> = {
  admin: 'Administrador General',
  staff: 'Gerencia Operativa',
  member: 'Socio',
  system: 'Sistema'
};

const formatMoney = (amount: number) =>
  new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
    maximumFractionDigits: 0
  }).format(amount);

const statusLabel = (status?: string) => {
  switch (status) {
    case 'active':
      return 'Activo';
    case 'past_due':
      return 'Pago vencido';
    case 'canceled':
      return 'Cancelado';
    case 'paused':
      return 'Pausado';
    case 'pending':
      return 'Pendiente';
    case 'inactive':
      return 'Inactivo';
    default:
      return status ?? 'N/A';
  }
};

const statusPill = (status?: string) => {
  switch (status) {
    case 'active':
      return 'bg-emerald-100 text-emerald-700 border-emerald-200';
    case 'pending':
      return 'bg-amber-100 text-amber-700 border-amber-200';
    case 'past_due':
      return 'bg-red-100 text-red-700 border-red-200';
    case 'paused':
      return 'bg-orange-100 text-orange-700 border-orange-200';
    case 'canceled':
      return 'bg-zinc-200 text-zinc-700 border-zinc-300';
    default:
      return 'bg-zinc-100 text-zinc-700 border-zinc-200';
  }
};

const parseMxDate = (value?: string) => {
  if (!value) return null;
  const direct = new Date(value);
  if (!Number.isNaN(direct.getTime())) {
    return direct;
  }

  const match = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return null;

  const [, day, month, year] = match;
  const parsed = new Date(Number(year), Number(month) - 1, Number(day));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const toLocalDateKey = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const plusDays = (date: Date, days: number) => {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
};

const weekDayForDateKey = (dateKey: string) => {
  const [year, month, day] = dateKey.split('-').map(Number);
  const date = new Date(year, (month ?? 1) - 1, day ?? 1);
  return date.getDay();
};

const riskOfMember = (member: Member): HealthFlag => {
  const status = member.subscriptionStatus;
  const consent = !!member.clinical?.consentFormSigned;
  if ((status === 'past_due' || status === 'canceled' || status === 'inactive') && !consent) return 'critical';
  if (status !== 'active' || !consent) return 'warning';
  return 'ok';
};

export const Admin: React.FC = () => {
  const { login, logout, user, isAuthenticated, isLoading: isAuthLoading } = useAuth();
  const toast = useToast();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [activeSection, setActiveSection] = useState<AdminSection>('panel');
  const [settingsCategory, setSettingsCategory] = useState<SettingsCategory>('agenda');

  const [isLoadingData, setIsLoadingData] = useState(false);
  const [dataLoadError, setDataLoadError] = useState('');
  const [members, setMembers] = useState<Member[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);

  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'issue'>('all');
  const [selectedMember, setSelectedMember] = useState<Member | null>(null);

  // Session registration
  const [sessionModalMember, setSessionModalMember] = useState<Member | null>(null);
  const [sessionForm, setSessionForm] = useState({ appointmentId: '', zona: '', fluencia: '', frecuencia: '', spot: '', passes: '', notes: '', adverseEvents: '' });
  const [isSessionSaving, setIsSessionSaving] = useState(false);
  const [cancelConfirmApptId, setCancelConfirmApptId] = useState<string | null>(null);
  const [confirmCancelMemberId, setConfirmCancelMemberId] = useState<string | null>(null);

  // Drawer history (shared between modal and drawer)
  const [memberSessions, setMemberSessions] = useState<SessionTreatment[]>([]);
  const [isLoadingSessions, setIsLoadingSessions] = useState(false);
  const [memberAppointments, setMemberAppointments] = useState<Appointment[]>([]);
  const [isLoadingMemberHistory, setIsLoadingMemberHistory] = useState(false);

  // Intake approval
  const [isApprovingIntake, setIsApprovingIntake] = useState<string | null>(null);
  const [intakeToReject, setIntakeToReject] = useState<string | null>(null);
  const [intakeRejectReason, setIntakeRejectReason] = useState('');

  // Expediente viewer modal
  const [intakeModal, setIntakeModal] = useState<{ member: Member; intake: MedicalIntake | null } | null>(null);
  const [intakeModalLoading, setIntakeModalLoading] = useState(false);

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
    maxAdvanceDays: 60
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
  const [isAgendaSaving, setIsAgendaSaving] = useState(false);
  const [isAgendaConfigSaving, setIsAgendaConfigSaving] = useState(false);
  const [agendaMessage, setAgendaMessage] = useState<{ type: 'ok' | 'error'; text: string } | null>(null);
  const [googleIntegrationStatus, setGoogleIntegrationStatus] = useState<GoogleCalendarIntegrationStatus | null>(null);
  const [isGoogleIntegrationLoading, setIsGoogleIntegrationLoading] = useState(false);
  const [isGoogleIntegrationSaving, setIsGoogleIntegrationSaving] = useState(false);
  const [googleIntegrationMessage, setGoogleIntegrationMessage] = useState<{ type: 'ok' | 'error'; text: string } | null>(null);

  const hasAccess = !!user && allowedRoles.includes(user.role);
  const canManageGoogleIntegration = user?.role === 'admin' || user?.role === 'system';

  const normalizeTreatmentDrafts = (items: AgendaTreatment[]) =>
    items.map((treatment) => ({
      ...treatment,
      prepBufferMinutes: treatment.prepBufferMinutes ?? 0,
      cleanupBufferMinutes: treatment.cleanupBufferMinutes ?? 0,
      allowedCabinIds: treatment.allowedCabinIds ?? (treatment.cabinId ? [treatment.cabinId] : [])
    }));

  const loadData = async () => {
    setIsLoadingData(true);
    setIsGoogleIntegrationLoading(true);
    setDataLoadError('');
    try {
      const [membersData, logsData, configData, dayData, integrationData] = await Promise.all([
        memberService.getAll(),
        user?.role === 'admin' || user?.role === 'system'
          ? auditService.getLogs().catch(() => [] as AuditLogEntry[])
          : Promise.resolve([] as AuditLogEntry[]),
        clinicalService.getAdminAgendaConfig().catch(() => null),
        clinicalService.getAdminAgendaDay(agendaDate).catch(() => null),
        user?.role === 'admin' || user?.role === 'system'
          ? googleCalendarIntegrationService.getStatus().catch(() => null)
          : Promise.resolve(null)
      ]);
      setMembers(membersData);
      setAuditLogs(logsData);
      setGoogleIntegrationStatus(integrationData);
      if (configData) {
        setAgendaConfig(configData);
        setAgendaPolicyDraft({
          timezone: configData.policy.timezone,
          slotMinutes: configData.policy.slotMinutes,
          autoConfirmHours: configData.policy.autoConfirmHours,
          noShowGraceMinutes: configData.policy.noShowGraceMinutes,
          maxActiveAppointmentsPerWeek: configData.policy.maxActiveAppointmentsPerWeek,
          maxActiveAppointmentsPerMonth: configData.policy.maxActiveAppointmentsPerMonth,
          minAdvanceMinutes: configData.policy.minAdvanceMinutes,
          maxAdvanceDays: configData.policy.maxAdvanceDays
        });
        setAgendaCabinsDraft(configData.cabins);
        setAgendaTreatmentsDraft(normalizeTreatmentDrafts(configData.treatments ?? []));
        setAgendaWeeklyRulesDraft(configData.weeklyRules);
        setAgendaSpecialDateRulesDraft(configData.specialDateRules);
      }
      if (dayData) {
        setAgendaSnapshot(dayData);
      }

      if (!selectedAgendaMemberId && membersData.length > 0) {
        setSelectedAgendaMemberId(membersData[0].id);
      }
    } catch (err: any) {
      const msg = err?.message || 'No se pudo cargar los datos del panel.';
      setDataLoadError(msg);
      toast.error(msg);
    } finally {
      setIsLoadingData(false);
      setIsGoogleIntegrationLoading(false);
    }
  };

  useEffect(() => {
    if (isAuthenticated && hasAccess) {
      loadData();
    }
  }, [isAuthenticated, hasAccess, user?.id, user?.role]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const hash = window.location.hash;
    const queryStart = hash.indexOf('?');
    if (queryStart < 0) return;

    const params = new URLSearchParams(hash.slice(queryStart + 1));
    const integration = params.get('integration');
    const status = params.get('status');
    const error = params.get('error');
    const section = params.get('section');
    const settings = params.get('settingsCategory');

    if (section === 'configuraciones' || section === 'ajustes') {
      setActiveSection('ajustes');
    }
    if (settings === 'agenda') {
      setSettingsCategory('agenda');
    }

    if (integration === 'google' && status === 'success') {
      setGoogleIntegrationMessage({ type: 'ok', text: 'Google Calendar conectado correctamente.' });
      void loadData();
    }

    if (integration === 'google' && status === 'error') {
      setGoogleIntegrationMessage({
        type: 'error',
        text: error ? `No se pudo conectar Google Calendar: ${error}` : 'No se pudo conectar Google Calendar.'
      });
    }

    if (integration !== 'google') {
      return;
    }

    params.delete('integration');
    params.delete('status');
    params.delete('error');

    const cleanedHash = hash.slice(0, queryStart);
    const remainingQuery = params.toString();
    const nextHash = remainingQuery ? `${cleanedHash}?${remainingQuery}` : cleanedHash;

    if (nextHash !== hash) {
      window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}${nextHash}`);
    }
  }, []);

  useEffect(() => {
    if (!isAuthenticated || !hasAccess) return;
    let cancelled = false;
    const loadDaySnapshot = async () => {
      try {
        const data = await clinicalService.getAdminAgendaDay(agendaDate);
        if (!cancelled) {
          setAgendaSnapshot(data);
        }
      } catch (_error) {
        // Keep admin panel usable even if agenda endpoint fails.
      }
    };
    loadDaySnapshot();
    return () => {
      cancelled = true;
    };
  }, [agendaDate, isAuthenticated, hasAccess]);

  useEffect(() => {
    if (members.length === 0) return;
    if (selectedAgendaMemberId && members.some((member) => member.id === selectedAgendaMemberId)) return;
    setSelectedAgendaMemberId(members[0].id);
  }, [members, selectedAgendaMemberId]);

  useEffect(() => {
    const activeCabins = agendaSnapshot?.cabins ?? agendaConfig?.cabins.filter((cabin) => cabin.isActive) ?? [];
    if (activeCabins.length === 0) {
      setSelectedAgendaCabinId('');
      return;
    }
    if (selectedAgendaCabinId && activeCabins.some((cabin) => cabin.id === selectedAgendaCabinId)) {
      return;
    }
    setSelectedAgendaCabinId(activeCabins[0].id);
  }, [agendaSnapshot?.cabins, agendaConfig?.cabins, selectedAgendaCabinId]);

  useEffect(() => {
    const activeTreatments = agendaTreatmentsDraft
      .filter((treatment) => treatment.isActive)
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));

    if (activeTreatments.length === 0) {
      setSelectedAgendaTreatmentId('');
      return;
    }

    if (selectedAgendaTreatmentId && activeTreatments.some((treatment) => treatment.id === selectedAgendaTreatmentId)) {
      return;
    }

    setSelectedAgendaTreatmentId(activeTreatments[0].id);
  }, [agendaTreatmentsDraft, selectedAgendaTreatmentId]);

  useEffect(() => {
    const selectedTreatment = agendaTreatmentsDraft.find((treatment) => treatment.id === selectedAgendaTreatmentId);
    const preferredCabinId = selectedTreatment?.allowedCabinIds?.[0] ?? selectedTreatment?.cabinId;
    if (!selectedTreatment?.requiresSpecificCabin || !preferredCabinId) {
      return;
    }
    if (selectedAgendaCabinId === preferredCabinId) {
      return;
    }
    setSelectedAgendaCabinId(preferredCabinId);
  }, [agendaTreatmentsDraft, selectedAgendaTreatmentId, selectedAgendaCabinId]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');
    try {
      await login(email, password);
    } catch (err: any) {
      setLoginError(err.message ?? 'Error de autenticación');
    }
  };

  const doUpdateMember = async (id: string, status: string) => {
    try {
      await memberService.updateMembershipStatus(id, status);
      await loadData();
      setSelectedMember((prev) => prev?.id === id ? { ...prev, subscriptionStatus: status } : prev);
      toast.success('Membresía actualizada.');
    } catch {
      toast.error('No fue posible actualizar el estatus de la membresía.');
    }
  };

  const handleUpdateMember = (id: string, status: string) => {
    if (status === 'canceled') {
      setConfirmCancelMemberId(id);
      return;
    }
    void doUpdateMember(id, status);
  };

  const loadMemberHistory = async (member: Member) => {
    setIsLoadingMemberHistory(true);
    try {
      const [sessions, appointments] = await Promise.all([
        clinicalService.getMemberSessions(member.id),
        clinicalService.listAppointments({ userId: member.id })
      ]);
      setMemberSessions(sessions);
      setMemberAppointments(appointments);
    } catch {
      setMemberSessions([]);
      setMemberAppointments([]);
    } finally {
      setIsLoadingMemberHistory(false);
    }
  };

  const handleOpenMemberDrawer = (member: Member) => {
    setSelectedMember(member);
    void loadMemberHistory(member);
  };

  const openSessionModal = async (member: Member) => {
    setSessionModalMember(member);
    setSessionForm({ appointmentId: '', zona: '', fluencia: '', frecuencia: '', spot: '', passes: '', notes: '', adverseEvents: '' });
    setIsLoadingSessions(true);
    try {
      const appointments = await clinicalService.listAppointments({ userId: member.id });
      setMemberAppointments(appointments.filter((a) => a.status === 'confirmed' || a.status === 'scheduled'));
    } catch {
      setMemberAppointments([]);
    } finally {
      setIsLoadingSessions(false);
    }
  };

  const openSessionModalForAppointment = (appointment: Appointment) => {
    const member = members.find((m) => m.id === appointment.userId) ?? null;
    if (!member) return;
    setSessionForm({ appointmentId: appointment.id, zona: '', fluencia: '', frecuencia: '', spot: '', passes: '', notes: '', adverseEvents: '' });
    setMemberAppointments([appointment]);
    setSessionModalMember(member);
  };

  const handleSubmitSession = async () => {
    if (!sessionModalMember || !user) return;
    setIsSessionSaving(true);
    try {
      const laserParametersJson: Record<string, unknown> = {};
      if (sessionForm.zona) laserParametersJson.zona = sessionForm.zona;
      if (sessionForm.fluencia) laserParametersJson.fluencia = `${sessionForm.fluencia} J/cm²`;
      if (sessionForm.frecuencia) laserParametersJson.frecuencia = `${sessionForm.frecuencia} Hz`;
      if (sessionForm.spot) laserParametersJson.spot = `${sessionForm.spot} mm`;
      if (sessionForm.passes) laserParametersJson.passes = sessionForm.passes;
      const payload: SessionCreatePayload = {
        userId: sessionModalMember.id,
        ...(sessionForm.appointmentId ? { appointmentId: sessionForm.appointmentId } : {}),
        ...(Object.keys(laserParametersJson).length > 0 ? { laserParametersJson } : {}),
        ...(sessionForm.notes ? { notes: sessionForm.notes } : {}),
        ...(sessionForm.adverseEvents ? { adverseEvents: sessionForm.adverseEvents } : {})
      };
      await clinicalService.createSession(payload);
      toast.success("Sesión registrada correctamente.");
      setSessionForm({ appointmentId: '', zona: '', fluencia: '', frecuencia: '', spot: '', passes: '', notes: '', adverseEvents: '' });
      setSessionModalMember(null);
      await loadData();
    } catch (err: any) {
      toast.error(err?.message ?? "No se pudo registrar la sesión.");
    } finally {
      setIsSessionSaving(false);
    }
  };

  const openIntakeModal = async (m: Member) => {
    setIntakeModal({ member: m, intake: null });
    setIntakeModalLoading(true);
    try {
      const data = await clinicalService.getMedicalIntakeByUserId(m.id);
      setIntakeModal({ member: m, intake: data });
    } catch {
      toast.error("No se pudo cargar el expediente.");
    } finally {
      setIntakeModalLoading(false);
    }
  };

  const handleApproveIntake = async (userId: string, approved: boolean) => {
    if (!approved && !intakeRejectReason.trim()) return;
    setIsApprovingIntake(userId);
    try {
      await clinicalService.approveMedicalIntake(userId, approved, approved ? undefined : intakeRejectReason.trim());
      setIntakeToReject(null);
      setIntakeRejectReason('');
      await loadData();
      if (selectedMember?.id === userId) {
        setSelectedMember((prev) => prev ? { ...prev, intakeStatus: approved ? 'approved' : 'rejected' } : prev);
      }
      if (intakeModal?.member.id === userId) {
        setIntakeModal((prev) => prev ? { ...prev, member: { ...prev.member, intakeStatus: approved ? 'approved' : 'rejected' } } : prev);
      }
      toast.success(approved ? "Expediente aprobado." : "Expediente rechazado.");
    } catch (err: any) {
      toast.error(err?.message ?? "No se pudo actualizar el expediente.");
    } finally {
      setIsApprovingIntake(null);
    }
  };

  const analytics = useMemo(() => {
    const totalSocios = members.length;
    const sociosActivos = members.filter((m) => m.subscriptionStatus === 'active').length;
    const sociosPendientes = members.filter((m) => m.subscriptionStatus === 'pending').length;
    const sociosConRiesgo = members.filter((m) => m.subscriptionStatus !== 'active').length;

    const expedientesFirmados = members.filter((m) => m.clinical?.consentFormSigned).length;
    const expedientesPendientes = Math.max(totalSocios - expedientesFirmados, 0);

    const mrr = members.reduce((acc, m) => acc + (m.amount ?? 0), 0);
    const arpu = sociosActivos > 0 ? mrr / sociosActivos : 0;
    const churnRisk = totalSocios > 0 ? (sociosConRiesgo / totalSocios) * 100 : 0;

    const failedAudits = auditLogs.filter((log) => log.status === 'failed').length;
    const sensitiveEvents = auditLogs.filter((log) => {
      const bag = `${log.action} ${log.resource}`.toLowerCase();
      return /role|membership|auth|login|permission|delete|cancel/.test(bag);
    }).length;

    const highRiskMembers = members.filter((m) => riskOfMember(m) === 'critical');
    const collectionQueue = members.filter((m) => ['past_due', 'paused', 'inactive', 'canceled'].includes(m.subscriptionStatus ?? ''));

    const renewalsIn7Days = members.filter((m) => {
      const nextDate = parseMxDate(m.nextBillingDate);
      if (!nextDate) return false;
      const now = new Date();
      const diff = nextDate.getTime() - now.getTime();
      const days = diff / (1000 * 60 * 60 * 24);
      return days >= 0 && days <= 7;
    }).length;

    return {
      totalSocios,
      sociosActivos,
      sociosPendientes,
      sociosConRiesgo,
      expedientesFirmados,
      expedientesPendientes,
      mrr,
      arpu,
      churnRisk,
      failedAudits,
      sensitiveEvents,
      highRiskMembers,
      collectionQueue,
      renewalsIn7Days
    };
  }, [members, auditLogs]);

  const planBreakdown = useMemo(() => {
    const map = new Map<string, { members: number; revenue: number }>();

    members.forEach((member) => {
      const key = member.plan ?? 'Plan Velum';
      const current = map.get(key) ?? { members: 0, revenue: 0 };
      current.members += 1;
      current.revenue += member.amount ?? 0;
      map.set(key, current);
    });

    return Array.from(map.entries())
      .map(([plan, data]) => ({ plan, ...data }))
      .sort((a, b) => b.revenue - a.revenue);
  }, [members]);

  const controlAlerts = useMemo<ControlAlert[]>(() => {
    const alerts: ControlAlert[] = [];

    if (analytics.highRiskMembers.length > 0) {
      alerts.push({
        id: 'risk-members',
        level: 'critical',
        title: 'Socias en riesgo crítico',
        detail: `${analytics.highRiskMembers.length} socias combinan pago vencido + expediente incompleto.`,
        section: 'socias'
      });
    }

    if (analytics.expedientesPendientes > 0) {
      alerts.push({
        id: 'pending-files',
        level: 'warning',
        title: 'Expedientes pendientes',
        detail: `${analytics.expedientesPendientes} expedientes requieren firma/validación clínica.`,
        section: 'expedientes'
      });
    }

    if (analytics.collectionQueue.length > 0) {
      alerts.push({
        id: 'collection-queue',
        level: 'warning',
        title: 'Cola de cobranza activa',
        detail: `${analytics.collectionQueue.length} cuentas requieren recuperación o regularización.`,
        section: 'socias'
      });
    }

    if (analytics.failedAudits > 0) {
      alerts.push({
        id: 'audit-failed',
        level: 'critical',
        title: 'Eventos de seguridad fallidos',
        detail: `${analytics.failedAudits} eventos en bitácora con estatus FAILED.`,
        section: 'ajustes'
      });
    }

    if (alerts.length === 0) {
      alerts.push({
        id: 'system-ok',
        level: 'ok',
        title: 'Operación estable',
        detail: 'No hay alertas críticas al momento. Mantén monitoreo continuo.',
        section: 'panel'
      });
    }

    return alerts;
  }, [analytics]);

  const filteredMembers = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return members.filter((member) => {
      const matchesSearch =
        member.name.toLowerCase().includes(term) || member.email.toLowerCase().includes(term);

      const matchesStatus =
        statusFilter === 'all'
          ? true
          : statusFilter === 'active'
            ? member.subscriptionStatus === 'active'
            : member.subscriptionStatus !== 'active';

      return matchesSearch && matchesStatus;
    });
  }, [members, searchTerm, statusFilter]);

  const memberById = useMemo(() => {
    return new Map(members.map((member) => [member.id, member]));
  }, [members]);

  const dayAppointments = useMemo(() => {
    return [...(agendaSnapshot?.appointments ?? [])].sort(
      (a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime()
    );
  }, [agendaSnapshot?.appointments]);

  const agendaSlots = useMemo(() => {
    return agendaSnapshot?.slots ?? [];
  }, [agendaSnapshot?.slots]);

  const availableAgendaSlots = useMemo(() => {
    return agendaSlots.filter((slot) => !slot.blocked && slot.available > 0);
  }, [agendaSlots]);

  const agendaSummary = useMemo(() => {
    return (
      agendaSnapshot?.summary ?? {
        totalSlots: 0,
        blockedSlots: 0,
        totalCapacity: 0,
        usedUnits: 0,
        availableUnits: 0,
        occupancy: 0,
        appointmentsToday: 0,
        canceledToday: 0,
        noShowToday: 0,
        completedToday: 0
      }
    );
  }, [agendaSnapshot?.summary]);

  const resolveAppointmentMember = (appointment: Appointment) => {
    const member = memberById.get(appointment.userId);
    if (member) return member.name;
    return appointment.user?.email ?? appointment.userId;
  };

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
        maxAdvanceDays: Math.min(Math.max(Number(next.maxAdvanceDays), 1), 365)
      };
    });
  };

  const updateWeeklyRuleField = (dayOfWeek: number, changes: Partial<AgendaWeeklyRule>) => {
    setAgendaWeeklyRulesDraft((current) =>
      current.map((rule) => (rule.dayOfWeek === dayOfWeek ? { ...rule, ...changes } : rule))
    );
  };

  const updateCabinDraftField = (cabinId: string, changes: Partial<AgendaCabin>) => {
    setAgendaCabinsDraft((current) => current.map((cabin) => (cabin.id === cabinId ? { ...cabin, ...changes } : cabin)));
  };

  const removeCabinDraft = (cabinId: string) => {
    setAgendaCabinsDraft((current) => current.filter((cabin) => cabin.id !== cabinId));
    setAgendaTreatmentsDraft((current) =>
      current.map((treatment) => ({
          ...treatment,
          cabinId: treatment.cabinId === cabinId ? null : treatment.cabinId,
          allowedCabinIds: (treatment.allowedCabinIds ?? []).filter((candidate) => candidate !== cabinId),
          requiresSpecificCabin:
            treatment.requiresSpecificCabin &&
            (treatment.allowedCabinIds ?? []).filter((candidate) => candidate !== cabinId).length > 0
        }))
    );
    if (selectedAgendaCabinId === cabinId) {
      setSelectedAgendaCabinId('');
    }
  };

  const addCabinDraft = () => {
    setAgendaCabinsDraft((current) => [
      ...current,
      {
        id: `draft-${Date.now()}`,
        name: `Cabina ${current.length + 1}`,
        isActive: true,
        sortOrder: current.length + 1
      }
    ]);
  };

  const updateTreatmentDraftField = (treatmentId: string, changes: Partial<AgendaTreatment>) => {
    setAgendaTreatmentsDraft((current) =>
      current.map((treatment) => (treatment.id === treatmentId ? { ...treatment, ...changes } : treatment))
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
        sortOrder: current.length + 1
      }
    ]);
  };

  const removeTreatmentDraft = (treatmentId: string) => {
    setAgendaTreatmentsDraft((current) => current.filter((treatment) => treatment.id !== treatmentId));
    if (selectedAgendaTreatmentId === treatmentId) {
      setSelectedAgendaTreatmentId('');
    }
  };

  const toggleTreatmentCabinAllowed = (treatmentId: string, cabinId: string, checked: boolean) => {
    setAgendaTreatmentsDraft((current) =>
      current.map((treatment) => {
        if (treatment.id !== treatmentId) return treatment;
        const currentAllowed = treatment.allowedCabinIds ?? [];
        const nextAllowed = checked
          ? currentAllowed.includes(cabinId)
            ? currentAllowed
            : [...currentAllowed, cabinId]
          : currentAllowed.filter((candidate) => candidate !== cabinId);
        return {
          ...treatment,
          allowedCabinIds: nextAllowed,
          cabinId: nextAllowed[0] ?? null,
          requiresSpecificCabin: treatment.requiresSpecificCabin ? nextAllowed.length > 0 : false
        };
      })
    );
  };

  const moveTreatmentCabinPriority = (treatmentId: string, cabinId: string, direction: -1 | 1) => {
    setAgendaTreatmentsDraft((current) =>
      current.map((treatment) => {
        if (treatment.id !== treatmentId) return treatment;
        const allowed = [...(treatment.allowedCabinIds ?? [])];
        const index = allowed.indexOf(cabinId);
        if (index < 0) return treatment;
        const nextIndex = index + direction;
        if (nextIndex < 0 || nextIndex >= allowed.length) return treatment;
        [allowed[index], allowed[nextIndex]] = [allowed[nextIndex], allowed[index]];
        return {
          ...treatment,
          allowedCabinIds: allowed,
          cabinId: allowed[0] ?? null
        };
      })
    );
  };

  const toggleTemplateDay = (dayOfWeek: number) => {
    setTemplateDaysOfWeek((current) => {
      if (current.includes(dayOfWeek)) {
        return current.filter((day) => day !== dayOfWeek);
      }
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
      if (!templateDaysOfWeek.includes(dayOfWeek)) {
        cursor = plusDays(cursor, 1);
        continue;
      }

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
            note: existing?.note ?? 'Aplicado desde plantilla semanal'
          };
        }
      }

      if (templatePreset === 'holiday_closed') {
        nextRule = {
          id: existing?.id ?? `draft-template-${dateKey}`,
          dateKey,
          isOpen: false,
          startHour: null,
          endHour: null,
          note: 'Feriado / cierre especial'
        };
      }

      if (templatePreset === 'season_extended') {
        nextRule = {
          id: existing?.id ?? `draft-template-${dateKey}`,
          dateKey,
          isOpen: true,
          startHour: 8,
          endHour: 22,
          note: 'Temporada alta'
        };
      }

      if (templatePreset === 'season_compact') {
        nextRule = {
          id: existing?.id ?? `draft-template-${dateKey}`,
          dateKey,
          isOpen: true,
          startHour: 10,
          endHour: 18,
          note: 'Temporada baja'
        };
      }

      if (nextRule) {
        draftByDate.set(dateKey, nextRule);
        updatedCount += 1;
      }

      cursor = plusDays(cursor, 1);
    }

    setAgendaSpecialDateRulesDraft(
      [...draftByDate.values()].sort((a, b) => a.dateKey.localeCompare(b.dateKey))
    );
    setAgendaMessage({
      type: 'ok',
      text: `Plantilla aplicada a ${updatedCount} fecha(s). Guarda configuración para confirmar.`
    });
  };

  const setSpecialRuleForDate = (isOpen: boolean, startHour?: number, endHour?: number) => {
    setAgendaSpecialDateRulesDraft((current) => {
      const next = [...current];
      const index = next.findIndex((rule) => rule.dateKey === agendaDate);
      const incoming: AgendaSpecialDateRule = index >= 0
        ? { ...next[index], isOpen, startHour: startHour ?? next[index].startHour, endHour: endHour ?? next[index].endHour }
        : {
            id: `draft-${agendaDate}`,
            dateKey: agendaDate,
            isOpen,
            startHour: startHour ?? 9,
            endHour: endHour ?? 20,
            note: null
          };
      if (index >= 0) {
        next[index] = incoming;
      } else {
        next.push(incoming);
      }
      return next;
    });
  };

  const clearSpecialRuleForDate = () => {
    setAgendaSpecialDateRulesDraft((current) => current.filter((rule) => rule.dateKey !== agendaDate));
  };

  const saveAgendaConfiguration = async () => {
    if (!agendaCabinsDraft.some((cabin) => cabin.isActive)) {
      setAgendaMessage({ type: 'error', text: 'Debes mantener al menos una cabina activa.' });
      return;
    }
    if (agendaPolicyDraft.maxActiveAppointmentsPerMonth < agendaPolicyDraft.maxActiveAppointmentsPerWeek) {
      setAgendaMessage({
        type: 'error',
        text: 'El límite mensual de citas activas debe ser mayor o igual al límite semanal.'
      });
      return;
    }

    const normalizedCodes = agendaTreatmentsDraft.map((treatment) => treatment.code.trim().toLowerCase());
    const duplicateCode = normalizedCodes.find((code, index) => code && normalizedCodes.indexOf(code) !== index);
    if (duplicateCode) {
      setAgendaMessage({ type: 'error', text: `El código "${duplicateCode}" está repetido en tratamientos.` });
      return;
    }

    const missingCode = normalizedCodes.find((code) => code.length === 0);
    if (missingCode !== undefined) {
      setAgendaMessage({ type: 'error', text: 'Todos los tratamientos deben tener código.' });
      return;
    }

    const invalidCode = normalizedCodes.find((code) => code.length > 0 && !/^[a-z0-9_]+$/.test(code));
    if (invalidCode) {
      setAgendaMessage({ type: 'error', text: 'El código del tratamiento solo acepta letras minúsculas, números y guion bajo.' });
      return;
    }

    const invalidTreatmentName = agendaTreatmentsDraft.find((treatment) => treatment.name.trim().length === 0);
    if (invalidTreatmentName) {
      setAgendaMessage({ type: 'error', text: 'Todos los tratamientos deben tener nombre.' });
      return;
    }

    const invalidDuration = agendaTreatmentsDraft.find(
      (treatment) => treatment.durationMinutes % agendaPolicyDraft.slotMinutes !== 0
    );
    if (invalidDuration) {
      setAgendaMessage({
        type: 'error',
        text: `La duración de "${invalidDuration.name}" debe ser múltiplo del intervalo (${agendaPolicyDraft.slotMinutes} min).`
      });
      return;
    }

    const cabinIdSet = new Set(agendaCabinsDraft.map((cabin) => cabin.id));
    const activeCabinIdSet = new Set(agendaCabinsDraft.filter((cabin) => cabin.isActive).map((cabin) => cabin.id));
    const treatmentWithoutCabin = agendaTreatmentsDraft.find(
      (treatment) => treatment.requiresSpecificCabin && (treatment.allowedCabinIds ?? []).length === 0
    );
    if (treatmentWithoutCabin) {
      setAgendaMessage({
        type: 'error',
        text: `El tratamiento "${treatmentWithoutCabin.name}" requiere cabina específica, pero no tiene cabinas permitidas.`
      });
      return;
    }

    const treatmentWithInactiveCabin = agendaTreatmentsDraft.find(
      (treatment) =>
        treatment.requiresSpecificCabin &&
        (treatment.allowedCabinIds ?? []).some((cabinId) => !activeCabinIdSet.has(cabinId))
    );
    if (treatmentWithInactiveCabin) {
      setAgendaMessage({
        type: 'error',
        text: `El tratamiento "${treatmentWithInactiveCabin.name}" solo puede usar cabinas activas.`
      });
      return;
    }

    const treatmentWithMissingCabin = agendaTreatmentsDraft.find(
      (treatment) => (treatment.allowedCabinIds ?? []).some((cabinId) => !cabinIdSet.has(cabinId))
    );
    if (treatmentWithMissingCabin) {
      setAgendaMessage({
        type: 'error',
        text: `El tratamiento "${treatmentWithMissingCabin.name}" apunta a una cabina que ya no existe.`
      });
      return;
    }

    setIsAgendaConfigSaving(true);
    setAgendaMessage(null);
    try {
      const payload = {
        timezone: agendaPolicyDraft.timezone,
        slotMinutes: agendaPolicyDraft.slotMinutes,
        autoConfirmHours: agendaPolicyDraft.autoConfirmHours,
        noShowGraceMinutes: agendaPolicyDraft.noShowGraceMinutes,
        maxActiveAppointmentsPerWeek: agendaPolicyDraft.maxActiveAppointmentsPerWeek,
        maxActiveAppointmentsPerMonth: agendaPolicyDraft.maxActiveAppointmentsPerMonth,
        minAdvanceMinutes: agendaPolicyDraft.minAdvanceMinutes,
        maxAdvanceDays: agendaPolicyDraft.maxAdvanceDays,
        cabins: agendaCabinsDraft.map((cabin, index) => ({
          id: cabin.id.startsWith('draft-') ? undefined : cabin.id,
          name: cabin.name,
          isActive: cabin.isActive,
          sortOrder: cabin.sortOrder ?? index + 1
        })),
        treatments: agendaTreatmentsDraft.map((treatment, index) => ({
          id: treatment.id.startsWith('draft-treatment-') ? undefined : treatment.id,
          name: treatment.name.trim(),
          code: treatment.code.trim().toLowerCase(),
          description: treatment.description ?? null,
          durationMinutes: treatment.durationMinutes,
          prepBufferMinutes: treatment.prepBufferMinutes ?? 0,
          cleanupBufferMinutes: treatment.cleanupBufferMinutes ?? 0,
          cabinId: (treatment.allowedCabinIds ?? [])[0] ?? treatment.cabinId ?? null,
          allowedCabinIds: treatment.allowedCabinIds ?? [],
          requiresSpecificCabin: treatment.requiresSpecificCabin,
          isActive: treatment.isActive,
          sortOrder: treatment.sortOrder ?? index + 1
        })),
        weeklyRules: agendaWeeklyRulesDraft.map((rule) => ({
          dayOfWeek: rule.dayOfWeek,
          isOpen: rule.isOpen,
          startHour: rule.startHour,
          endHour: rule.endHour
        })),
        specialDateRules: agendaSpecialDateRulesDraft.map((rule) => ({
          dateKey: rule.dateKey,
          isOpen: rule.isOpen,
          startHour: rule.startHour ?? null,
          endHour: rule.endHour ?? null,
          note: rule.note ?? null
        }))
      };

      const updatedConfig = await clinicalService.updateAdminAgendaConfig(payload);
      setAgendaConfig(updatedConfig);
      setAgendaPolicyDraft({
        timezone: updatedConfig.policy.timezone,
        slotMinutes: updatedConfig.policy.slotMinutes,
        autoConfirmHours: updatedConfig.policy.autoConfirmHours,
        noShowGraceMinutes: updatedConfig.policy.noShowGraceMinutes,
        maxActiveAppointmentsPerWeek: updatedConfig.policy.maxActiveAppointmentsPerWeek,
        maxActiveAppointmentsPerMonth: updatedConfig.policy.maxActiveAppointmentsPerMonth,
        minAdvanceMinutes: updatedConfig.policy.minAdvanceMinutes,
        maxAdvanceDays: updatedConfig.policy.maxAdvanceDays
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
          reason: cabinId ? 'Bloqueo por cabina desde panel admin' : 'Bloqueo general desde panel admin'
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
      const selectedTreatment = agendaTreatmentsDraft.find((treatment) => treatment.id === selectedAgendaTreatmentId);
      const preferredCabinIds = selectedTreatment?.allowedCabinIds ?? (selectedTreatment?.cabinId ? [selectedTreatment.cabinId] : []);
      const requestedCabinId = selectedTreatment?.requiresSpecificCabin
        ? preferredCabinIds[0] ?? undefined
        : selectedAgendaCabinId || preferredCabinIds[0] || undefined;
      const durationMinutes = selectedTreatment?.durationMinutes ?? slot.endMinute - slot.startMinute;
      const slotEnd = new Date(slotStart.getTime() + durationMinutes * 60 * 1000);

      if (selectedTreatment?.requiresSpecificCabin && preferredCabinIds.length === 0) {
        setAgendaMessage({
          type: 'error',
          text: `El tratamiento "${selectedTreatment.name}" requiere cabina específica, pero no tiene cabinas configuradas.`
        });
        return;
      }

      await clinicalService.createAppointment({
        userId: selectedAgendaMemberId,
        cabinId: requestedCabinId,
        treatmentId: selectedTreatment?.id,
        startAt: slotStart.toISOString(),
        endAt: slotEnd.toISOString(),
        reason: selectedTreatment?.code ?? (selectedAgendaCabinId ? 'admin.manual_schedule.cabin' : 'admin.manual_schedule')
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
        canceledReason: action === 'cancel' ? 'Cancelación operativa desde panel admin' : undefined
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

  const handleGoogleConnect = async () => {
    if (!canManageGoogleIntegration) return;
    setIsGoogleIntegrationSaving(true);
    setGoogleIntegrationMessage(null);
    try {
      const response = await googleCalendarIntegrationService.connect();
      if (typeof window !== 'undefined') {
        window.location.href = response.url;
      }
    } catch (error: any) {
      setGoogleIntegrationMessage({
        type: 'error',
        text: error?.message ?? 'No fue posible iniciar la conexión con Google Calendar.'
      });
    } finally {
      setIsGoogleIntegrationSaving(false);
    }
  };

  const handleGoogleDisconnect = async () => {
    if (!canManageGoogleIntegration) return;
    setIsGoogleIntegrationSaving(true);
    setGoogleIntegrationMessage(null);
    try {
      await googleCalendarIntegrationService.disconnect();
      const status = await googleCalendarIntegrationService.getStatus();
      setGoogleIntegrationStatus(status);
      setGoogleIntegrationMessage({ type: 'ok', text: 'Google Calendar desconectado.' });
    } catch (error: any) {
      setGoogleIntegrationMessage({
        type: 'error',
        text: error?.message ?? 'No fue posible desconectar Google Calendar.'
      });
    } finally {
      setIsGoogleIntegrationSaving(false);
    }
  };

  const handleGoogleModeChange = async (mode: GoogleEventFormatMode) => {
    if (!canManageGoogleIntegration) return;
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
        watchExpiration: current?.watchExpiration ?? null
      }));
      setGoogleIntegrationMessage({ type: 'ok', text: 'Preferencias de privacidad actualizadas.' });
    } catch (error: any) {
      setGoogleIntegrationMessage({
        type: 'error',
        text: error?.message ?? 'No fue posible actualizar el formato del evento.'
      });
    } finally {
      setIsGoogleIntegrationSaving(false);
    }
  };

  // ─── Helper UI ────────────────────────────────────────────────────────────

  const intakeStatusLabel = (status?: string) => {
    switch (status) {
      case 'approved': return { label: 'Aprobado', cls: 'text-emerald-700 bg-emerald-50 border-emerald-200' };
      case 'submitted': return { label: 'Pendiente revisión', cls: 'text-amber-700 bg-amber-50 border-amber-200' };
      case 'rejected': return { label: 'Rechazado', cls: 'text-red-700 bg-red-50 border-red-200' };
      default: return { label: 'Borrador', cls: 'text-zinc-500 bg-zinc-50 border-zinc-200' };
    }
  };

  const apptStatusLabel = (status?: string) => {
    switch (status) {
      case 'scheduled': return { label: 'Agendada', cls: 'bg-blue-50 text-blue-700 border-blue-200' };
      case 'confirmed': return { label: 'Confirmada', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
      case 'completed': return { label: 'Completada', cls: 'bg-velum-100 text-velum-700 border-velum-200' };
      case 'canceled': return { label: 'Cancelada', cls: 'bg-zinc-100 text-zinc-500 border-zinc-200' };
      case 'no_show': return { label: 'No show', cls: 'bg-red-50 text-red-600 border-red-200' };
      default: return { label: status ?? '—', cls: 'bg-zinc-100 text-zinc-500 border-zinc-200' };
    }
  };

  const Pill: React.FC<{ label: string; cls: string }> = ({ label, cls }) => (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${cls}`}>{label}</span>
  );

  const KpiCard: React.FC<{ icon: React.ReactNode; label: string; value: string | number; sub?: string; accent?: string }> = ({ icon, label, value, sub, accent = 'text-velum-900' }) => (
    <div className="bg-white rounded-2xl border border-velum-100 p-5 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-bold uppercase tracking-widest text-velum-500">{label}</span>
        <span className="text-velum-400">{icon}</span>
      </div>
      <p className={`text-3xl font-serif font-bold leading-none ${accent}`}>{value}</p>
      {sub && <p className="text-xs text-velum-400">{sub}</p>}
    </div>
  );

  // ─── Session Modal ────────────────────────────────────────────────────────

  const renderSessionModal = () => {
    if (!sessionModalMember) return null;
    return (
      <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
        <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl border border-velum-100 overflow-hidden flex flex-col max-h-[90vh]">
          <div className="px-6 py-5 border-b border-velum-100 flex items-center justify-between">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-velum-500">Registro clínico</p>
              <h3 className="font-serif text-lg text-velum-900 mt-0.5">{sessionModalMember.name}</h3>
            </div>
            <button onClick={() => setSessionModalMember(null)} className="text-velum-400 hover:text-velum-900 p-1 rounded-xl hover:bg-velum-50 transition"><X size={20} /></button>
          </div>
          <div className="p-6 space-y-5 overflow-y-auto">
            {memberAppointments.length > 0 && (
              <div>
                <label className="block text-xs font-bold uppercase tracking-widest text-velum-500 mb-2">Cita asociada</label>
                <select value={sessionForm.appointmentId} onChange={(e) => setSessionForm((f) => ({ ...f, appointmentId: e.target.value }))}
                  className="w-full rounded-xl border border-velum-200 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-velum-900/20 focus:border-velum-900 transition bg-white">
                  <option value="">Sin cita específica</option>
                  {memberAppointments.map((a) => (
                    <option key={a.id} value={a.id}>
                      {new Date(a.startAt).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })} — {a.treatment?.name ?? 'Sin tratamiento'}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-velum-500 mb-3">Parámetros láser</p>
              <div className="grid grid-cols-2 gap-3">
                {([['zona', 'Zona tratada', 'Ej. Zona I', 'text'], ['fluencia', 'Fluencia (J/cm²)', 'Ej. 14', 'number'], ['frecuencia', 'Frecuencia (Hz)', 'Ej. 2', 'number'], ['spot', 'Spot (mm)', 'Ej. 12', 'number']] as const).map(([field, label, placeholder, type]) => (
                  <div key={field}>
                    <label className="block text-xs text-velum-500 mb-1">{label}</label>
                    <input value={sessionForm[field]} onChange={(e) => setSessionForm((f) => ({ ...f, [field]: e.target.value }))}
                      placeholder={placeholder} type={type} min="0" step={field === 'fluencia' ? '0.1' : field === 'frecuencia' ? '0.5' : '1'}
                      className="w-full rounded-xl border border-velum-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-velum-900/20 focus:border-velum-900 transition" />
                  </div>
                ))}
                <div className="col-span-2">
                  <label className="block text-xs text-velum-500 mb-1">Pasadas</label>
                  <input value={sessionForm.passes} onChange={(e) => setSessionForm((f) => ({ ...f, passes: e.target.value }))}
                    placeholder="Ej. 3" type="number" min="1"
                    className="w-full rounded-xl border border-velum-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-velum-900/20 focus:border-velum-900 transition" />
                </div>
              </div>
            </div>
            <div>
              <label className="block text-xs font-bold uppercase tracking-widest text-velum-500 mb-2">Notas clínicas</label>
              <textarea value={sessionForm.notes} onChange={(e) => setSessionForm((f) => ({ ...f, notes: e.target.value }))}
                rows={3} placeholder="Observaciones, tolerancia del cliente, respuesta al tratamiento..."
                className="w-full rounded-xl border border-velum-200 px-3 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-velum-900/20 focus:border-velum-900 transition" />
            </div>
            <div>
              <label className="block text-xs font-bold uppercase tracking-widest text-velum-500 mb-2">Eventos adversos</label>
              <textarea value={sessionForm.adverseEvents} onChange={(e) => setSessionForm((f) => ({ ...f, adverseEvents: e.target.value }))}
                rows={2} placeholder="Eritema, edema... (dejar vacío si no aplica)"
                className={`w-full rounded-xl border px-3 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-velum-900/20 transition ${sessionForm.adverseEvents ? 'border-amber-300 bg-amber-50/40' : 'border-velum-200 focus:border-velum-900'}`} />
            </div>
          </div>
          <div className="px-6 py-4 border-t border-velum-100 flex gap-3 bg-velum-50/50">
            <button onClick={handleSubmitSession} disabled={isSessionSaving}
              className="flex-1 bg-velum-900 text-white rounded-xl py-2.5 text-sm font-medium hover:bg-velum-800 transition disabled:opacity-50 flex items-center justify-center gap-2">
              <Zap size={14} />{isSessionSaving ? 'Registrando...' : 'Registrar sesión'}
            </button>
            <button onClick={() => setSessionModalMember(null)} className="px-4 py-2.5 rounded-xl border border-velum-200 text-sm text-velum-700 hover:bg-velum-100 transition">Cancelar</button>
          </div>
        </div>
      </div>
    );
  };

  // ─── Member Drawer ────────────────────────────────────────────────────────

  const renderMemberDrawer = () => {
    if (!selectedMember) return null;
    const intake = intakeStatusLabel(selectedMember.intakeStatus);
    const mem = selectedMember;
    return (
      <>
        <div className="fixed inset-0 bg-black/20 backdrop-blur-sm z-40" onClick={() => setSelectedMember(null)} />
        <div className="fixed right-0 top-0 h-full w-full max-w-md bg-white shadow-2xl z-50 flex flex-col overflow-hidden">
          {/* Header */}
          <div className="px-6 py-5 border-b border-velum-100 flex items-start justify-between">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-velum-400">Perfil del socio</p>
              <h2 className="font-serif text-xl text-velum-900 mt-1">{mem.name}</h2>
              <p className="text-xs text-velum-500 mt-0.5">{mem.email}</p>
            </div>
            <button onClick={() => setSelectedMember(null)} className="p-2 rounded-xl hover:bg-velum-50 text-velum-400 hover:text-velum-700 transition"><X size={18} /></button>
          </div>
          {/* Stats */}
          <div className="grid grid-cols-2 gap-3 p-4 border-b border-velum-100">
            {[
              { label: 'Plan', value: mem.plan ?? 'N/A' },
              { label: 'Estado', value: <Pill label={statusLabel(mem.subscriptionStatus)} cls={statusPill(mem.subscriptionStatus)} /> },
              { label: 'Monto', value: mem.amount ? formatMoney(mem.amount) : 'N/A' },
              { label: 'Expediente', value: <Pill label={intake.label} cls={intake.cls} /> }
            ].map(({ label, value }) => (
              <div key={label} className="bg-velum-50 rounded-xl p-3">
                <p className="text-[10px] font-bold uppercase tracking-widest text-velum-400 mb-1">{label}</p>
                <div className="text-sm font-medium text-velum-900">{value}</div>
              </div>
            ))}
          </div>
          {/* Scrollable body */}
          <div className="flex-1 overflow-y-auto">
            {/* Acciones */}
            <div className="p-4 border-b border-velum-100 space-y-2">
              <p className="text-[10px] font-bold uppercase tracking-widest text-velum-400 mb-3">Acciones</p>
              <button onClick={() => { openSessionModal(mem); setSelectedMember(null); }}
                className="w-full flex items-center gap-2 px-4 py-2.5 bg-velum-900 text-white rounded-xl text-sm font-medium hover:bg-velum-800 transition">
                <Zap size={14} />Registrar sesión
              </button>
              {mem.subscriptionStatus !== 'active' && (
                <button onClick={() => handleUpdateMember(mem.id, 'active')}
                  className="w-full flex items-center gap-2 px-4 py-2.5 bg-emerald-600 text-white rounded-xl text-sm font-medium hover:bg-emerald-700 transition">
                  <CheckCircle2 size={14} />Activar cuenta
                </button>
              )}
              {mem.subscriptionStatus === 'active' && (
                <button onClick={() => handleUpdateMember(mem.id, 'past_due')}
                  className="w-full flex items-center gap-2 px-4 py-2.5 border border-amber-300 text-amber-700 bg-amber-50 rounded-xl text-sm font-medium hover:bg-amber-100 transition">
                  <CircleAlert size={14} />Marcar pago vencido
                </button>
              )}
              {mem.subscriptionStatus !== 'canceled' && (
                <button onClick={() => handleUpdateMember(mem.id, 'canceled')}
                  className="w-full flex items-center gap-2 px-4 py-2.5 border border-red-200 text-red-600 bg-red-50 rounded-xl text-sm font-medium hover:bg-red-100 transition">
                  <XCircle size={14} />Cancelar membresía
                </button>
              )}
            </div>
            {/* Expediente viewer button */}
            {selectedMember.intakeStatus && selectedMember.intakeStatus !== 'draft' && (
              <div className="px-4 pt-4 pb-0">
                <button onClick={() => { openIntakeModal(mem); setSelectedMember(null); }}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 border border-velum-200 text-velum-700 rounded-xl text-sm font-medium hover:bg-velum-50 transition">
                  <FolderOpen size={14} />Ver expediente completo
                </button>
              </div>
            )}
            {/* Intake approval */}
            {(selectedMember.intakeStatus === 'submitted' || intakeToReject === mem.id) && (
              <div className="p-4 border-b border-velum-100">
                <p className="text-[10px] font-bold uppercase tracking-widest text-velum-400 mb-3">Revisión de expediente</p>
                {intakeToReject === mem.id ? (
                  <div className="space-y-3">
                    <textarea value={intakeRejectReason} onChange={(e) => setIntakeRejectReason(e.target.value)}
                      placeholder="Motivo del rechazo (requerido)" rows={3}
                      className="w-full rounded-xl border border-red-200 bg-red-50/30 px-3 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-red-300 transition" />
                    <div className="flex gap-2">
                      <button onClick={() => handleApproveIntake(mem.id, false)} disabled={!intakeRejectReason.trim() || isApprovingIntake === mem.id}
                        className="flex-1 bg-red-600 text-white rounded-xl py-2 text-sm font-medium hover:bg-red-700 transition disabled:opacity-50">
                        {isApprovingIntake === mem.id ? 'Procesando...' : 'Confirmar rechazo'}
                      </button>
                      <button onClick={() => { setIntakeToReject(null); setIntakeRejectReason(''); }}
                        className="px-3 py-2 rounded-xl border border-velum-200 text-sm text-velum-600 hover:bg-velum-50 transition">Cancelar</button>
                    </div>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <button onClick={() => handleApproveIntake(mem.id, true)} disabled={isApprovingIntake === mem.id}
                      className="flex-1 bg-emerald-600 text-white rounded-xl py-2.5 text-sm font-medium hover:bg-emerald-700 transition disabled:opacity-50">
                      {isApprovingIntake === mem.id ? 'Procesando...' : 'Aprobar'}
                    </button>
                    <button onClick={() => setIntakeToReject(mem.id)}
                      className="flex-1 border border-red-200 text-red-600 bg-red-50 rounded-xl py-2.5 text-sm font-medium hover:bg-red-100 transition">Rechazar</button>
                  </div>
                )}
              </div>
            )}
            {/* Citas */}
            <div className="p-4 border-b border-velum-100">
              <p className="text-[10px] font-bold uppercase tracking-widest text-velum-400 mb-3">Citas recientes</p>
              {isLoadingMemberHistory ? (
                <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="h-10 bg-velum-100 rounded-xl animate-pulse" />)}</div>
              ) : memberAppointments.length === 0 ? (
                <p className="text-xs text-velum-400 text-center py-4">Sin citas registradas</p>
              ) : (
                <div className="space-y-2">
                  {memberAppointments.slice(0, 5).map((a) => {
                    const s = apptStatusLabel(a.status);
                    return (
                      <div key={a.id} className="flex items-center justify-between p-2.5 rounded-xl bg-velum-50">
                        <div>
                          <p className="text-xs font-medium text-velum-900">{new Date(a.startAt).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })}</p>
                          <p className="text-[11px] text-velum-500">{a.treatment?.name ?? 'Sin tratamiento'}</p>
                        </div>
                        <Pill label={s.label} cls={s.cls} />
                      </div>
                    );
                  })}
                  {memberAppointments.length > 5 && <p className="text-[11px] text-velum-400 text-center">+{memberAppointments.length - 5} más</p>}
                </div>
              )}
            </div>
            {/* Sesiones */}
            <div className="p-4">
              <p className="text-[10px] font-bold uppercase tracking-widest text-velum-400 mb-3">Sesiones clínicas</p>
              {isLoadingMemberHistory ? (
                <div className="space-y-2">{[1,2].map(i => <div key={i} className="h-12 bg-velum-100 rounded-xl animate-pulse" />)}</div>
              ) : memberSessions.length === 0 ? (
                <p className="text-xs text-velum-400 text-center py-4">Sin sesiones registradas</p>
              ) : (
                <div className="space-y-2">
                  {memberSessions.slice(0, 5).map((s) => {
                    const params = s.laserParametersJson as Record<string, string> | null;
                    return (
                      <div key={s.id} className="p-3 rounded-xl bg-velum-50 space-y-1">
                        <div className="flex items-center justify-between">
                          <p className="text-xs font-medium text-velum-900">{new Date(s.createdAt).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })}</p>
                          {s.adverseEvents && <span className="text-[10px] px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full border border-amber-200">Evento adverso</span>}
                        </div>
                        {params && (
                          <p className="text-[11px] text-velum-500">
                            {[params.zona, params.fluencia, params.frecuencia, params.spot].filter(Boolean).join(' · ')}
                          </p>
                        )}
                        {s.notes && <p className="text-[11px] text-velum-500 line-clamp-1">{s.notes}</p>}
                      </div>
                    );
                  })}
                  {memberSessions.length > 5 && <p className="text-[11px] text-velum-400 text-center">+{memberSessions.length - 5} más</p>}
                </div>
              )}
            </div>
          </div>
        </div>
      </>
    );
  };

  // ─── Section: Panel ───────────────────────────────────────────────────────

  const renderPanel = () => {
    const todayLabel = new Date().toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' });
    const userName = user?.email?.split('@')[0] ?? 'Admin';
    const actionAlerts = controlAlerts.filter((a) => a.level !== 'ok');

    return (
      <div className="space-y-8">
        {/* Greeting */}
        <div>
          <p className="text-xs text-velum-400 capitalize">{todayLabel}</p>
          <h1 className="text-2xl font-serif text-velum-900 mt-0.5">Hola, {userName}</h1>
        </div>

        {/* 3 primary metrics — tappable shortcuts */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            {
              label: 'Socias activas',
              value: analytics.sociosActivos,
              sub: `de ${analytics.totalSocios} registradas`,
              accent: 'text-velum-900',
              section: 'socias' as AdminSection,
            },
            {
              label: 'Citas hoy',
              value: agendaSummary.appointmentsToday,
              sub: `${agendaSummary.completedToday} completadas`,
              accent: 'text-velum-900',
              section: 'agenda' as AdminSection,
            },
            {
              label: 'Expedientes pendientes',
              value: analytics.expedientesPendientes,
              sub: 'requieren revisión clínica',
              accent: analytics.expedientesPendientes > 0 ? 'text-amber-600' : 'text-emerald-600',
              section: 'expedientes' as AdminSection,
            },
          ].map(({ label, value, sub, accent, section }) => (
            <button key={label} onClick={() => setActiveSection(section)}
              className="bg-white rounded-2xl border border-velum-100 p-5 text-left hover:border-velum-300 hover:shadow-sm transition group">
              <p className="text-[10px] font-bold uppercase tracking-widest text-velum-400 mb-2">{label}</p>
              <p className={`text-4xl font-serif font-bold ${accent}`}>{value}</p>
              <p className="text-xs text-velum-400 mt-1.5 group-hover:text-velum-600 transition flex items-center gap-1">
                {sub} <ArrowRight size={11} />
              </p>
            </button>
          ))}
        </div>

        {/* Acciones urgentes — only shown when needed */}
        {actionAlerts.length > 0 && (
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-velum-400 mb-3">Requieren atención</p>
            <div className="space-y-2">
              {actionAlerts.map((alert) => (
                <div key={alert.id}
                  className={`flex items-center gap-3 px-4 py-3 rounded-2xl border ${alert.level === 'warning' ? 'bg-amber-50 border-amber-200' : 'bg-red-50 border-red-200'}`}>
                  <div className={`shrink-0 ${alert.level === 'warning' ? 'text-amber-500' : 'text-red-500'}`}>
                    {alert.level === 'warning' ? <CircleAlert size={16} /> : <AlertTriangle size={16} />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-semibold ${alert.level === 'warning' ? 'text-amber-900' : 'text-red-900'}`}>{alert.title}</p>
                    <p className={`text-xs ${alert.level === 'warning' ? 'text-amber-700' : 'text-red-700'}`}>{alert.detail}</p>
                  </div>
                  {alert.section !== 'panel' && (
                    <button onClick={() => {
                      setActiveSection(alert.section);
                      if (alert.section === 'ajustes') setSettingsCategory('auditoria');
                    }}
                      className={`shrink-0 text-xs font-medium px-3 py-1.5 rounded-xl transition
                        ${alert.level === 'warning' ? 'bg-amber-100 text-amber-700 hover:bg-amber-200' : 'bg-red-100 text-red-700 hover:bg-red-200'}`}>
                      Ver <ArrowRight size={11} className="inline ml-0.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Two-column: agenda de hoy + actividad reciente */}
        <div className="grid lg:grid-cols-2 gap-6">
          {/* Agenda de hoy */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <p className="text-[10px] font-bold uppercase tracking-widest text-velum-400">Agenda de hoy</p>
              <button onClick={() => setActiveSection('agenda')} className="text-xs text-velum-400 hover:text-velum-900 transition flex items-center gap-1">
                Ver agenda <ArrowRight size={11} />
              </button>
            </div>
            <div className="bg-white rounded-2xl border border-velum-100 overflow-hidden">
              {dayAppointments.length === 0 ? (
                <div className="py-10 text-center">
                  <CalendarDays size={24} className="mx-auto text-velum-200 mb-2" />
                  <p className="text-sm text-velum-400">Sin citas programadas hoy</p>
                </div>
              ) : (
                <div className="divide-y divide-velum-50">
                  {dayAppointments.slice(0, 6).map((appt) => {
                    const m = memberById.get(appt.userId ?? '');
                    const s = apptStatusLabel(appt.status);
                    return (
                      <div key={appt.id} className="flex items-center gap-3 px-4 py-3">
                        <p className="text-xs font-mono text-velum-400 w-12 shrink-0">
                          {new Date(appt.startAt).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}
                        </p>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-velum-900 truncate">{m?.name || m?.email || 'Paciente'}</p>
                        </div>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${s.cls}`}>{s.label}</span>
                      </div>
                    );
                  })}
                  {dayAppointments.length > 6 && (
                    <button onClick={() => setActiveSection('agenda')}
                      className="w-full py-2.5 text-xs text-velum-400 hover:text-velum-700 hover:bg-velum-50 transition">
                      +{dayAppointments.length - 6} más → Ver agenda completa
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Actividad reciente */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <p className="text-[10px] font-bold uppercase tracking-widest text-velum-400">Actividad reciente</p>
              <button onClick={() => { setActiveSection('ajustes'); setSettingsCategory('auditoria'); }}
                className="text-xs text-velum-400 hover:text-velum-900 transition flex items-center gap-1">
                Ver todo <ArrowRight size={11} />
              </button>
            </div>
            <div className="bg-white rounded-2xl border border-velum-100 overflow-hidden">
              {auditLogs.length === 0 ? (
                <div className="py-10 text-center">
                  <Activity size={24} className="mx-auto text-velum-200 mb-2" />
                  <p className="text-sm text-velum-400">Sin actividad registrada</p>
                </div>
              ) : (
                <div className="divide-y divide-velum-50">
                  {auditLogs.slice(0, 6).map((log, i) => (
                    <div key={log.id ?? i} className="flex items-center gap-3 px-4 py-2.5">
                      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${log.status === 'success' ? 'bg-emerald-500' : 'bg-red-500'}`} />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-mono text-velum-600 truncate">{log.action}</p>
                        <p className="text-[10px] text-velum-400">{log.user ?? '—'}</p>
                      </div>
                      <p className="text-[10px] text-velum-300 shrink-0 whitespace-nowrap">
                        {new Date(log.timestamp).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  };

  // ─── Section: Socios ──────────────────────────────────────────────────────

  const renderSocios = () => (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-serif text-velum-900">Socias</h1>
          <p className="text-sm text-velum-500 mt-1">{members.length} pacientes registradas</p>
        </div>
      </div>
      {/* Search + filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-velum-400" />
          <input value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="Buscar por nombre o correo..."
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-velum-200 text-sm focus:outline-none focus:ring-2 focus:ring-velum-900/20 focus:border-velum-900 transition bg-white" />
        </div>
        <div className="flex gap-2 flex-wrap">
          {(['all', 'active', 'issue'] as const).map((f) => (
            <button key={f} onClick={() => setStatusFilter(f)}
              className={`px-3 py-2 rounded-xl text-xs font-medium transition ${statusFilter === f ? 'bg-velum-900 text-white' : 'bg-white border border-velum-200 text-velum-600 hover:bg-velum-50'}`}>
              {f === 'all' ? 'Todos' : f === 'active' ? 'Activos' : 'Con incidencia'}
            </button>
          ))}
        </div>
      </div>
      {/* Table */}
      <div className="bg-white rounded-2xl border border-velum-100 overflow-hidden">
        {filteredMembers.length === 0 ? (
          <div className="py-16 text-center">
            <Users size={32} className="mx-auto text-velum-200 mb-3" />
            <p className="text-sm text-velum-400">No hay socios que coincidan con tu búsqueda</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-velum-100 bg-velum-50/50">
                  {['Nombre', 'Plan', 'Estado', 'Expediente', 'Riesgo', ''].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-velum-400">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredMembers.map((m, i) => {
                  const risk = riskOfMember(m);
                  const intake = intakeStatusLabel(m.intakeStatus);
                  return (
                    <tr key={m.id} className={`border-b border-velum-50 hover:bg-velum-50/60 transition cursor-pointer ${i === filteredMembers.length - 1 ? 'border-b-0' : ''}`}
                      onClick={() => handleOpenMemberDrawer(m)}>
                      <td className="px-4 py-3">
                        <p className="font-medium text-velum-900">{m.name}</p>
                        <p className="text-xs text-velum-400">{m.email}</p>
                      </td>
                      <td className="px-4 py-3 text-velum-600">{m.plan ?? '—'}</td>
                      <td className="px-4 py-3"><Pill label={statusLabel(m.subscriptionStatus)} cls={statusPill(m.subscriptionStatus)} /></td>
                      <td className="px-4 py-3"><Pill label={intake.label} cls={intake.cls} /></td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${risk === 'ok' ? 'text-emerald-600' : risk === 'warning' ? 'text-amber-600' : 'text-red-600'}`}>
                          <span className={`w-2 h-2 rounded-full ${risk === 'ok' ? 'bg-emerald-500' : risk === 'warning' ? 'bg-amber-400' : 'bg-red-500'}`} />
                          {risk === 'ok' ? 'Normal' : risk === 'warning' ? 'Atención' : 'Crítico'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <button className="text-velum-400 hover:text-velum-900 transition p-1 rounded-lg hover:bg-velum-100"><ArrowRight size={16} /></button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );

  // ─── Section: KPIs ────────────────────────────────────────────────────────

  const renderKPIs = () => (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-serif text-velum-900">KPIs</h1>
        <p className="text-sm text-velum-500 mt-1">Indicadores clave de desempeño</p>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <KpiCard icon={<Users size={18} />} label="Socios activos" value={analytics.sociosActivos} sub={`${analytics.sociosPendientes} pendientes de activación`} />
        <KpiCard icon={<Wallet size={18} />} label="MRR" value={formatMoney(analytics.mrr)} sub="Ingreso recurrente mensual" accent="text-emerald-700" />
        <KpiCard icon={<Target size={18} />} label="ARPU" value={formatMoney(analytics.arpu)} sub="Ingreso promedio por usuario" />
        <KpiCard icon={<AlertTriangle size={18} />} label="Riesgo de churn" value={`${analytics.churnRisk.toFixed(1)}%`} sub={`${analytics.sociosConRiesgo} socios en riesgo`} accent={analytics.churnRisk > 20 ? 'text-red-600' : 'text-velum-900'} />
        <KpiCard icon={<FileText size={18} />} label="Expedientes firmados" value={analytics.expedientesFirmados} sub={`de ${analytics.totalSocios} socios`} />
        <KpiCard icon={<Clock3 size={18} />} label="Renovaciones próximas" value={analytics.renewalsIn7Days} sub="en los próximos 7 días" />
      </div>
      {/* Plan breakdown */}
      <div>
        <h2 className="text-xs font-bold uppercase tracking-widest text-velum-500 mb-3">Distribución por plan</h2>
        <div className="bg-white rounded-2xl border border-velum-100 overflow-hidden">
          {planBreakdown.length === 0 ? (
            <div className="py-12 text-center text-xs text-velum-400">Sin datos de planes</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-velum-100 bg-velum-50/50">
                  {['Plan', 'Socios', 'Ingreso total', '% del MRR'].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-velum-400">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {planBreakdown.map((p, i) => (
                  <tr key={p.plan} className={i < planBreakdown.length - 1 ? 'border-b border-velum-50' : ''}>
                    <td className="px-4 py-3 font-medium text-velum-900">{p.plan}</td>
                    <td className="px-4 py-3 text-velum-600">{p.members}</td>
                    <td className="px-4 py-3 text-velum-600">{formatMoney(p.revenue)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-1.5 bg-velum-100 rounded-full overflow-hidden max-w-[80px]">
                          <div className="h-full bg-velum-900 rounded-full" style={{ width: `${analytics.mrr > 0 ? (p.revenue / analytics.mrr) * 100 : 0}%` }} />
                        </div>
                        <span className="text-xs text-velum-500">{analytics.mrr > 0 ? ((p.revenue / analytics.mrr) * 100).toFixed(0) : 0}%</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );

  // ─── Section: Finanzas ────────────────────────────────────────────────────

  const renderFinanzas = () => {
    const topMembers = [...members].sort((a, b) => (b.amount ?? 0) - (a.amount ?? 0)).slice(0, 20);
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-serif text-velum-900">Finanzas</h1>
          <p className="text-sm text-velum-500 mt-1">Radar de ingresos y facturación</p>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard icon={<Wallet size={18} />} label="MRR total" value={formatMoney(analytics.mrr)} accent="text-emerald-700" />
          <KpiCard icon={<Target size={18} />} label="ARPU" value={formatMoney(analytics.arpu)} />
          <KpiCard icon={<Users size={18} />} label="Socios activos" value={analytics.sociosActivos} />
          <KpiCard icon={<AlertTriangle size={18} />} label="En cobranza" value={analytics.collectionQueue.length} accent={analytics.collectionQueue.length > 0 ? 'text-red-600' : 'text-velum-900'} />
        </div>
        <div>
          <h2 className="text-xs font-bold uppercase tracking-widest text-velum-500 mb-3">Top socios por monto</h2>
          <div className="bg-white rounded-2xl border border-velum-100 overflow-hidden">
            {topMembers.length === 0 ? (
              <div className="py-12 text-center text-xs text-velum-400">Sin datos</div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-velum-100 bg-velum-50/50">
                    {['#', 'Socio', 'Plan', 'Monto', 'Estado'].map((h) => (
                      <th key={h} className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-velum-400">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {topMembers.map((m, i) => (
                    <tr key={m.id} className={`hover:bg-velum-50 transition cursor-pointer ${i < topMembers.length - 1 ? 'border-b border-velum-50' : ''}`}
                      onClick={() => handleOpenMemberDrawer(m)}>
                      <td className="px-4 py-3 text-velum-400 text-xs">{i + 1}</td>
                      <td className="px-4 py-3">
                        <p className="font-medium text-velum-900">{m.name}</p>
                        <p className="text-xs text-velum-400">{m.email}</p>
                      </td>
                      <td className="px-4 py-3 text-velum-600">{m.plan ?? '—'}</td>
                      <td className="px-4 py-3 font-medium text-velum-900">{m.amount ? formatMoney(m.amount) : '—'}</td>
                      <td className="px-4 py-3"><Pill label={statusLabel(m.subscriptionStatus)} cls={statusPill(m.subscriptionStatus)} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    );
  };

  // ─── Expediente viewer modal ───────────────────────────────────────────────

  const FITZPATRICK = [
    { type: 1, label: 'Tipo I', desc: 'Muy clara. Siempre se quema, nunca broncea.', color: '#FDEBD0', textCls: 'text-amber-900' },
    { type: 2, label: 'Tipo II', desc: 'Clara. Siempre se quema, a veces broncea.', color: '#F5CBA7', textCls: 'text-amber-900' },
    { type: 3, label: 'Tipo III', desc: 'Media. A veces se quema, siempre broncea.', color: '#E59866', textCls: 'text-amber-900' },
    { type: 4, label: 'Tipo IV', desc: 'Oliva. Raramente se quema, siempre broncea.', color: '#CA6F1E', textCls: 'text-white' },
    { type: 5, label: 'Tipo V', desc: 'Morena oscura. Muy raramente se quema.', color: '#784212', textCls: 'text-white' },
    { type: 6, label: 'Tipo VI', desc: 'Negra. No se quema, broncea profundamente.', color: '#2C1503', textCls: 'text-white' },
  ];

  const renderIntakeModal = () => {
    if (!intakeModal) return null;
    const { member: m, intake } = intakeModal;
    const pj = (intake?.personalJson as any) ?? {};
    const hj = (intake?.historyJson as any) ?? {};
    const fitz = FITZPATRICK.find((f) => f.type === intake?.phototype);
    const intakeStatus = intakeStatusLabel(m.intakeStatus);

    return (
      <>
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50" onClick={() => setIntakeModal(null)} />
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
          <div className="pointer-events-auto w-full max-w-2xl max-h-[90vh] bg-white rounded-3xl shadow-2xl flex flex-col overflow-hidden">
            {/* Header */}
            <div className="px-6 py-5 border-b border-velum-100 flex items-start justify-between shrink-0">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-velum-400">Expediente clínico</p>
                <h2 className="font-serif text-xl text-velum-900 mt-0.5">{m.name || m.email}</h2>
                <p className="text-xs text-velum-500 mt-0.5">{m.email}</p>
              </div>
              <div className="flex items-center gap-2">
                <Pill label={intakeStatus.label} cls={intakeStatus.cls} />
                <button onClick={() => setIntakeModal(null)} className="p-2 rounded-xl hover:bg-velum-50 text-velum-400 hover:text-velum-700 transition ml-1">
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto">
              {intakeModalLoading ? (
                <div className="p-8 flex flex-col items-center gap-3">
                  <div className="w-10 h-10 border-2 border-velum-200 border-t-velum-700 rounded-full animate-spin" />
                  <p className="text-sm text-velum-500">Cargando expediente...</p>
                </div>
              ) : !intake ? (
                <div className="p-8 text-center">
                  <FolderOpen size={32} className="mx-auto text-velum-300 mb-3" />
                  <p className="text-sm text-velum-500">Este paciente aún no tiene expediente registrado.</p>
                </div>
              ) : (
                <div className="divide-y divide-velum-50">
                  {/* Fototipo Fitzpatrick */}
                  <div className="p-5 space-y-3">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-velum-400">Fototipo de Fitzpatrick</p>
                    <div className="flex gap-1.5">
                      {FITZPATRICK.map((f) => (
                        <div key={f.type}
                          className={`flex-1 rounded-xl py-2 text-center transition ${intake.phototype === f.type ? 'ring-2 ring-offset-1 ring-velum-900 scale-105' : 'opacity-50'}`}
                          style={{ backgroundColor: f.color }}>
                          <p className={`text-[10px] font-bold ${f.textCls}`}>{f.label}</p>
                        </div>
                      ))}
                    </div>
                    {fitz ? (
                      <div className="flex items-start gap-3 bg-velum-50 rounded-xl p-3">
                        <div className="w-8 h-8 rounded-full shrink-0 ring-2 ring-velum-200" style={{ backgroundColor: fitz.color }} />
                        <div>
                          <p className="text-sm font-semibold text-velum-900">{fitz.label}</p>
                          <p className="text-xs text-velum-500 mt-0.5">{fitz.desc}</p>
                          {intake.phototype && intake.phototype >= 4 && (
                            <p className="text-xs text-amber-700 font-medium mt-1.5 flex items-center gap-1">
                              <AlertTriangle size={11} /> Precaución: fototipos altos requieren parámetros láser ajustados.
                            </p>
                          )}
                        </div>
                      </div>
                    ) : (
                      <p className="text-xs text-velum-400 italic">No registrado</p>
                    )}
                  </div>

                  {/* Datos personales */}
                  <div className="p-5 space-y-3">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-velum-400">Datos personales</p>
                    <div className="grid grid-cols-2 gap-3">
                      {[
                        { label: 'Nombre completo', value: pj.fullName },
                        { label: 'Teléfono', value: pj.phone },
                        { label: 'Fecha de nacimiento', value: pj.birthDate ? new Date(pj.birthDate).toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' }) : null },
                        { label: 'Correo electrónico', value: m.email },
                      ].map(({ label, value }) => (
                        <div key={label} className="bg-velum-50 rounded-xl p-3">
                          <p className="text-[10px] font-bold uppercase tracking-widest text-velum-400 mb-1">{label}</p>
                          <p className="text-sm text-velum-900">{value || <span className="text-velum-300 italic">No registrado</span>}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Historia clínica */}
                  <div className="p-5 space-y-3">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-velum-400">Historia clínica</p>
                    <div className="space-y-3">
                      {[
                        { label: 'Alergias', value: hj.allergies, icon: <AlertTriangle size={12} /> },
                        { label: 'Medicamentos actuales', value: hj.medications, icon: <FileText size={12} /> },
                        { label: 'Condiciones de piel', value: hj.skinConditions, icon: <Activity size={12} /> },
                      ].map(({ label, value, icon }) => (
                        <div key={label} className="bg-velum-50 rounded-xl p-3">
                          <p className="text-[10px] font-bold uppercase tracking-widest text-velum-400 mb-1 flex items-center gap-1">{icon}{label}</p>
                          <p className="text-sm text-velum-900 whitespace-pre-wrap">{value || <span className="text-velum-300 italic">Ninguna / No especificado</span>}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Consentimiento */}
                  <div className="p-5 space-y-3">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-velum-400">Consentimiento informado</p>
                    <div className="grid grid-cols-2 gap-3">
                      <div className={`rounded-xl p-3 flex items-center gap-2 ${intake.consentAccepted ? 'bg-emerald-50' : 'bg-velum-50'}`}>
                        {intake.consentAccepted ? <CheckCircle2 size={16} className="text-emerald-600 shrink-0" /> : <XCircle size={16} className="text-velum-300 shrink-0" />}
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-widest text-velum-400">Consentimiento</p>
                          <p className={`text-sm font-medium ${intake.consentAccepted ? 'text-emerald-700' : 'text-velum-500'}`}>
                            {intake.consentAccepted ? 'Aceptado' : 'Pendiente'}
                          </p>
                        </div>
                      </div>
                      <div className={`rounded-xl p-3 flex items-center gap-2 ${intake.signatureKey ? 'bg-emerald-50' : 'bg-velum-50'}`}>
                        {intake.signatureKey ? <CheckCheck size={16} className="text-emerald-600 shrink-0" /> : <XCircle size={16} className="text-velum-300 shrink-0" />}
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-widest text-velum-400">Firma digital</p>
                          <p className={`text-sm font-medium ${intake.signatureKey ? 'text-emerald-700' : 'text-velum-500'}`}>
                            {intake.signatureKey ? 'Firmado' : 'Sin firma'}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Candidacy note */}
                  {intake.phototype && (
                    <div className="p-5">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-velum-400 mb-3">Determinación de candidatura</p>
                      <div className={`rounded-xl p-4 text-sm ${intake.phototype <= 3 ? 'bg-emerald-50 border border-emerald-200 text-emerald-800' : intake.phototype === 4 ? 'bg-amber-50 border border-amber-200 text-amber-800' : 'bg-red-50 border border-red-200 text-red-800'}`}>
                        {intake.phototype <= 3 && <><strong>Candidata favorable.</strong> Fototipo I–III: responde óptimamente al láser de depilación con mínimo riesgo de pigmentación.</>}
                        {intake.phototype === 4 && <><strong>Candidata con precaución.</strong> Fototipo IV: requiere parámetros ajustados (fluencia reducida, pulso largo). Riesgo moderado de hiperpigmentación post-tratamiento.</>}
                        {intake.phototype >= 5 && <><strong>Candidata de alto riesgo.</strong> Fototipo V–VI: alto riesgo de hiperpigmentación. Evaluar con especialista antes de iniciar tratamiento. Considerar láser Nd:YAG 1064 nm.</>}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Footer — approve/reject */}
            {!intakeModalLoading && intake && (m.intakeStatus === 'submitted' || intakeToReject === m.id) && (
              <div className="px-6 py-4 border-t border-velum-100 bg-velum-50/50 shrink-0 space-y-3">
                <p className="text-[10px] font-bold uppercase tracking-widest text-velum-400">Resolución del expediente</p>
                {intakeToReject === m.id ? (
                  <div className="space-y-2">
                    <textarea value={intakeRejectReason} onChange={(e) => setIntakeRejectReason(e.target.value)}
                      placeholder="Motivo del rechazo (requerido)" rows={2}
                      className="w-full rounded-xl border border-red-200 bg-white px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-red-300 transition" />
                    <div className="flex gap-2">
                      <button onClick={() => handleApproveIntake(m.id, false)} disabled={!intakeRejectReason.trim() || isApprovingIntake === m.id}
                        className="flex-1 bg-red-600 text-white rounded-xl py-2.5 text-sm font-medium hover:bg-red-700 transition disabled:opacity-50">
                        {isApprovingIntake === m.id ? 'Procesando...' : 'Confirmar rechazo'}
                      </button>
                      <button onClick={() => { setIntakeToReject(null); setIntakeRejectReason(''); }}
                        className="px-4 py-2.5 rounded-xl border border-velum-200 text-sm text-velum-600 hover:bg-white transition">Cancelar</button>
                    </div>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <button onClick={() => handleApproveIntake(m.id, true)} disabled={isApprovingIntake === m.id}
                      className="flex-1 bg-emerald-600 text-white rounded-xl py-2.5 text-sm font-medium hover:bg-emerald-700 transition disabled:opacity-50">
                      {isApprovingIntake === m.id ? 'Procesando...' : 'Aprobar candidatura'}
                    </button>
                    <button onClick={() => setIntakeToReject(m.id)}
                      className="flex-1 border border-red-200 text-red-600 bg-white rounded-xl py-2.5 text-sm font-medium hover:bg-red-50 transition">Rechazar</button>
                  </div>
                )}
              </div>
            )}
            {!intakeModalLoading && intake && m.intakeStatus === 'approved' && (
              <div className="px-6 py-4 border-t border-velum-100 bg-emerald-50/50 shrink-0">
                <div className="flex items-center gap-2 text-emerald-700">
                  <CheckCircle2 size={16} />
                  <p className="text-sm font-medium">Expediente aprobado. Paciente candidata confirmada.</p>
                </div>
              </div>
            )}
            {!intakeModalLoading && intake && m.intakeStatus === 'rejected' && (
              <div className="px-6 py-4 border-t border-velum-100 bg-red-50/50 shrink-0">
                <div className="flex items-center gap-2 text-red-700">
                  <XCircle size={16} />
                  <p className="text-sm font-medium">Expediente rechazado. Revisar con la paciente.</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </>
    );
  };

  // ─── Section: Expedientes ─────────────────────────────────────────────────

  const renderExpedientes = () => {
    const pendingApproval = members.filter((m) => m.intakeStatus === 'submitted');
    const expStats = [
      { label: 'Aprobados', value: members.filter((m) => m.intakeStatus === 'approved').length, cls: 'text-emerald-700' },
      { label: 'Pendientes revisión', value: pendingApproval.length, cls: 'text-amber-600' },
      { label: 'Rechazados', value: members.filter((m) => m.intakeStatus === 'rejected').length, cls: 'text-red-600' },
      { label: 'Sin expediente', value: members.filter((m) => !m.intakeStatus || m.intakeStatus === 'draft').length, cls: 'text-velum-600' }
    ];
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-serif text-velum-900">Expedientes clínicos</h1>
          <p className="text-sm text-velum-500 mt-1">Gestión de fichas médicas y consentimientos</p>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {expStats.map(({ label, value, cls }) => (
            <div key={label} className="bg-white rounded-2xl border border-velum-100 p-5">
              <p className="text-[10px] font-bold uppercase tracking-widest text-velum-400 mb-2">{label}</p>
              <p className={`text-3xl font-serif font-bold ${cls}`}>{value}</p>
            </div>
          ))}
        </div>
        {/* Pending queue */}
        {pendingApproval.length > 0 && (
          <div>
            <h2 className="text-xs font-bold uppercase tracking-widest text-velum-500 mb-3">Cola de aprobación</h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {pendingApproval.map((m) => (
                <div key={m.id} className="bg-white rounded-2xl border border-amber-200 bg-amber-50/30 p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-medium text-velum-900 text-sm">{m.name}</p>
                      <p className="text-xs text-velum-500">{m.email}</p>
                    </div>
                    <button onClick={() => openIntakeModal(m)} className="text-[10px] font-bold uppercase tracking-widest text-velum-600 hover:text-velum-900 transition border border-velum-200 rounded-lg px-2 py-1 bg-white shrink-0">
                      Ver expediente
                    </button>
                  </div>
                  {intakeToReject === m.id ? (
                    <div className="space-y-2">
                      <textarea value={intakeRejectReason} onChange={(e) => setIntakeRejectReason(e.target.value)}
                        placeholder="Motivo del rechazo (requerido)" rows={2}
                        className="w-full rounded-xl border border-red-200 bg-red-50/30 px-3 py-2 text-xs resize-none focus:outline-none focus:ring-2 focus:ring-red-300 transition" />
                      <div className="flex gap-2">
                        <button onClick={() => handleApproveIntake(m.id, false)} disabled={!intakeRejectReason.trim() || isApprovingIntake === m.id}
                          className="flex-1 bg-red-600 text-white rounded-xl py-1.5 text-xs font-medium hover:bg-red-700 transition disabled:opacity-50">Confirmar</button>
                        <button onClick={() => { setIntakeToReject(null); setIntakeRejectReason(''); }}
                          className="px-3 py-1.5 rounded-xl border border-velum-200 text-xs text-velum-600 hover:bg-velum-50 transition">Cancelar</button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <button onClick={() => handleApproveIntake(m.id, true)} disabled={isApprovingIntake === m.id}
                        className="flex-1 bg-emerald-600 text-white rounded-xl py-2 text-xs font-medium hover:bg-emerald-700 transition disabled:opacity-50">
                        {isApprovingIntake === m.id ? '...' : 'Aprobar'}
                      </button>
                      <button onClick={() => setIntakeToReject(m.id)}
                        className="flex-1 border border-red-200 text-red-600 bg-red-50 rounded-xl py-2 text-xs font-medium hover:bg-red-100 transition">Rechazar</button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
        {/* Full table */}
        <div>
          <h2 className="text-xs font-bold uppercase tracking-widest text-velum-500 mb-3">Todos los expedientes</h2>
          <div className="bg-white rounded-2xl border border-velum-100 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-velum-100 bg-velum-50/50">
                    {['Socio', 'Consentimiento', 'Estado expediente', 'Docs', 'Acciones'].map((h) => (
                      <th key={h} className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-velum-400">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {members.map((m, i) => {
                    const intake = intakeStatusLabel(m.intakeStatus);
                    return (
                      <tr key={m.id} className={`hover:bg-velum-50 transition ${i < members.length - 1 ? 'border-b border-velum-50' : ''}`}>
                        <td className="px-4 py-3">
                          <p className="font-medium text-velum-900">{m.name}</p>
                          <p className="text-xs text-velum-400">{m.email}</p>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center gap-1 text-xs font-medium ${m.clinical?.consentFormSigned ? 'text-emerald-600' : 'text-velum-400'}`}>
                            {m.clinical?.consentFormSigned ? <CheckCircle2 size={13} /> : <XCircle size={13} />}
                            {m.clinical?.consentFormSigned ? 'Firmado' : 'Pendiente'}
                          </span>
                        </td>
                        <td className="px-4 py-3"><Pill label={intake.label} cls={intake.cls} /></td>
                        <td className="px-4 py-3 text-velum-500">{m.clinical?.documents?.length ?? 0}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <button onClick={() => openIntakeModal(m)} className="text-xs text-velum-900 font-semibold hover:underline transition">Ver expediente</button>
                            <button onClick={() => handleOpenMemberDrawer(m)} className="text-xs text-velum-400 hover:text-velum-700 transition">Perfil</button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    );
  };

  // ─── Section: Agenda ──────────────────────────────────────────────────────

  const renderAgenda = () => {
    const fmtMinutes = (minutes: number) => {
      const h = Math.floor(minutes / 60).toString().padStart(2, '0');
      const m = (minutes % 60).toString().padStart(2, '0');
      return `${h}:${m}`;
    };
    const activeCabins = (agendaSnapshot?.cabins ?? agendaConfig?.cabins ?? []).filter((c) => c.isActive);
    const activeTreatments = agendaTreatmentsDraft.filter((t) => t.isActive).sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
    const effectiveRule = agendaSnapshot?.effectiveRule;
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-serif text-velum-900">Agenda</h1>
          <p className="text-sm text-velum-500 mt-1">Gestión de citas, slots y cabinas</p>
        </div>
        {/* Date navigation */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-1 bg-white border border-velum-200 rounded-xl overflow-hidden">
            <button onClick={() => setAgendaDate(toLocalDateKey(plusDays(new Date(agendaDate + 'T12:00:00'), -1)))}
              className="p-2.5 hover:bg-velum-50 text-velum-600 transition"><ChevronLeft size={16} /></button>
            <span className="px-3 py-2 text-sm font-medium text-velum-900 min-w-[140px] text-center">
              {new Date(agendaDate + 'T12:00:00').toLocaleDateString('es-MX', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })}
            </span>
            <button onClick={() => setAgendaDate(toLocalDateKey(plusDays(new Date(agendaDate + 'T12:00:00'), 1)))}
              className="p-2.5 hover:bg-velum-50 text-velum-600 transition"><ChevronRight size={16} /></button>
          </div>
          <button onClick={() => setAgendaDate(toLocalDateKey(new Date()))}
            className="px-3 py-2.5 rounded-xl border border-velum-200 bg-white text-sm text-velum-600 hover:bg-velum-50 transition">Hoy</button>
          <div className="flex gap-2 flex-wrap">
            {[
              { label: `${agendaSummary.appointmentsToday} citas`, cls: 'bg-blue-50 text-blue-700 border-blue-200' },
              { label: `${agendaSummary.availableUnits} disponibles`, cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
              { label: `${agendaSummary.blockedSlots} bloqueados`, cls: 'bg-velum-100 text-velum-600 border-velum-200' }
            ].map(({ label, cls }) => (
              <span key={label} className={`px-3 py-1.5 rounded-xl text-xs font-medium border ${cls}`}>{label}</span>
            ))}
          </div>
          {agendaMessage && (
            <p className={`text-xs font-medium px-3 py-1.5 rounded-xl ${agendaMessage.type === 'ok' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
              {agendaMessage.text}
            </p>
          )}
        </div>

        {/* Rule info */}
        {effectiveRule && (
          <div className={`flex items-center gap-3 p-3 rounded-xl text-xs ${effectiveRule.isOpen ? 'bg-emerald-50 border border-emerald-200 text-emerald-700' : 'bg-red-50 border border-red-200 text-red-700'}`}>
            <span>{effectiveRule.isOpen ? '✓ Abierto' : '✗ Cerrado'}</span>
            {effectiveRule.isOpen && <span>{effectiveRule.startHour ?? 0}:00 – {effectiveRule.endHour ?? 0}:00</span>}
            <span className="text-[10px] opacity-60">[{effectiveRule.source}]</span>
          </div>
        )}

        <div className="grid lg:grid-cols-2 gap-6">
          {/* Left: new appointment form + slots */}
          <div className="space-y-4">
            {/* New appointment selectors */}
            <div className="bg-white rounded-2xl border border-velum-100 p-5 space-y-3">
              <p className="text-xs font-bold uppercase tracking-widest text-velum-500">Nueva cita</p>
              <select value={selectedAgendaMemberId} onChange={(e) => setSelectedAgendaMemberId(e.target.value)}
                className="w-full rounded-xl border border-velum-200 px-3 py-2.5 text-sm focus:outline-none focus:border-velum-900 transition bg-white">
                <option value="">Seleccionar socio</option>
                {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
              <div className="grid grid-cols-2 gap-3">
                <select value={selectedAgendaCabinId} onChange={(e) => setSelectedAgendaCabinId(e.target.value)}
                  className="w-full rounded-xl border border-velum-200 px-3 py-2.5 text-sm focus:outline-none focus:border-velum-900 transition bg-white">
                  <option value="">Cabina (opcional)</option>
                  {activeCabins.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <select value={selectedAgendaTreatmentId} onChange={(e) => setSelectedAgendaTreatmentId(e.target.value)}
                  className="w-full rounded-xl border border-velum-200 px-3 py-2.5 text-sm focus:outline-none focus:border-velum-900 transition bg-white">
                  <option value="">Tratamiento (opcional)</option>
                  {activeTreatments.map((t) => <option key={t.id} value={t.id}>{t.name} ({t.durationMinutes}min)</option>)}
                </select>
              </div>
            </div>
            {/* Slots matrix */}
            <div className="bg-white rounded-2xl border border-velum-100 overflow-hidden">
              <div className="px-5 py-4 border-b border-velum-100 flex items-center justify-between">
                <p className="text-xs font-bold uppercase tracking-widest text-velum-500">Slots del día</p>
                {isAgendaSaving && <span className="text-xs text-velum-400 animate-pulse">Procesando...</span>}
              </div>
              {agendaSlots.length === 0 ? (
                <div className="py-12 text-center text-xs text-velum-400">
                  <CalendarDays size={28} className="mx-auto mb-2 text-velum-200" />Sin slots configurados para este día
                </div>
              ) : (
                <div className="divide-y divide-velum-50">
                  {agendaSlots.map((slot) => {
                    const isBlocked = slot.blocked;
                    return (
                      <div key={slot.key} className={`flex items-center gap-3 px-5 py-3 ${isBlocked ? 'bg-velum-50/70' : 'hover:bg-velum-50/40 transition'}`}>
                        <span className={`text-sm font-mono w-24 shrink-0 ${isBlocked ? 'text-velum-400 line-through' : 'text-velum-700 font-medium'}`}>{slot.label}</span>
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-1.5 bg-velum-100 rounded-full overflow-hidden">
                              <div className={`h-full rounded-full transition-all ${isBlocked ? 'bg-velum-300 w-full' : 'bg-velum-900'}`}
                                style={{ width: isBlocked ? '100%' : `${slot.capacity > 0 ? (slot.booked / slot.capacity) * 100 : 0}%` }} />
                            </div>
                            <span className="text-xs text-velum-400 whitespace-nowrap">{slot.booked}/{slot.capacity}</span>
                          </div>
                        </div>
                        <div className="flex gap-2 shrink-0">
                          <button onClick={() => toggleAgendaSlotBlock(slot)} disabled={isAgendaSaving}
                            className={`text-xs px-2.5 py-1 rounded-lg transition ${isBlocked ? 'bg-velum-100 text-velum-700 hover:bg-velum-200' : 'border border-velum-200 text-velum-500 hover:bg-velum-100'}`}>
                            {isBlocked ? 'Desbloquear' : 'Bloquear'}
                          </button>
                          {!isBlocked && slot.available > 0 && (
                            <button onClick={() => handleAgendaCreateAppointment(slot)} disabled={isAgendaSaving || !selectedAgendaMemberId}
                              className="text-xs px-2.5 py-1 rounded-lg bg-velum-900 text-white hover:bg-velum-800 transition disabled:opacity-40">
                              + Cita
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Right: appointments for the day */}
          <div className="space-y-4">
            <div className="bg-white rounded-2xl border border-velum-100 overflow-hidden">
              <div className="px-5 py-4 border-b border-velum-100">
                <p className="text-xs font-bold uppercase tracking-widest text-velum-500">Citas del día</p>
              </div>
              {dayAppointments.length === 0 ? (
                <div className="py-12 text-center text-xs text-velum-400">
                  <CalendarDays size={28} className="mx-auto mb-2 text-velum-200" />No hay citas para este día
                </div>
              ) : (
                <div className="divide-y divide-velum-50">
                  {dayAppointments.map((a) => {
                    const s = apptStatusLabel(a.status);
                    const memberName = resolveAppointmentMember(a);
                    const isCancelConfirm = cancelConfirmApptId === a.id;
                    return (
                      <div key={a.id} className="px-5 py-4 space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-xs font-mono text-velum-500">
                                {new Date(a.startAt).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}
                              </span>
                              <Pill label={s.label} cls={s.cls} />
                            </div>
                            <p className="font-medium text-velum-900 text-sm mt-1 truncate">{memberName}</p>
                            {(a.treatment || a.cabin) && (
                              <p className="text-xs text-velum-400 mt-0.5">{[a.treatment?.name, a.cabin?.name].filter(Boolean).join(' · ')}</p>
                            )}
                          </div>
                        </div>
                        {isCancelConfirm ? (
                          <div className="flex gap-2">
                            <button onClick={() => confirmCancelAppointment(a.id)} disabled={isAgendaSaving}
                              className="flex-1 text-xs bg-red-600 text-white px-3 py-1.5 rounded-lg hover:bg-red-700 transition disabled:opacity-50">
                              Confirmar cancelación
                            </button>
                            <button onClick={() => setCancelConfirmApptId(null)} className="text-xs px-3 py-1.5 rounded-lg border border-velum-200 text-velum-600 hover:bg-velum-50 transition">No</button>
                          </div>
                        ) : (
                          <div className="flex gap-1.5 flex-wrap">
                            {a.status === 'scheduled' && (
                              <button onClick={() => handleAgendaAppointmentAction(a.id, 'confirm', 'Cita confirmada.')} disabled={isAgendaSaving}
                                className="text-xs px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 transition">Confirmar</button>
                            )}
                            {(a.status === 'scheduled' || a.status === 'confirmed') && (
                              <>
                                <button onClick={() => openSessionModalForAppointment(a)} disabled={isAgendaSaving}
                                  className="text-xs px-2.5 py-1 rounded-lg bg-velum-900 text-white hover:bg-velum-800 transition">Completar</button>
                                <button onClick={() => handleAgendaAppointmentAction(a.id, 'mark_no_show', 'Marcado como no-show.')} disabled={isAgendaSaving}
                                  className="text-xs px-2.5 py-1 rounded-lg border border-amber-200 text-amber-700 bg-amber-50 hover:bg-amber-100 transition">No show</button>
                                <button onClick={() => handleAgendaCancelAppointment(a.id)}
                                  className="text-xs px-2.5 py-1 rounded-lg border border-red-200 text-red-600 bg-red-50 hover:bg-red-100 transition">Cancelar</button>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            {/* Report */}
            {agendaSnapshot?.report && (
              <div className="bg-white rounded-2xl border border-velum-100 p-5 space-y-3">
                <p className="text-xs font-bold uppercase tracking-widest text-velum-500">Reporte diario</p>
                <div className="grid grid-cols-2 gap-3 text-xs">
                  {[
                    { label: 'Utilización', value: `${agendaSnapshot.report.utilizationPct.toFixed(0)}%` },
                    { label: 'Productividad', value: `${agendaSnapshot.report.productivityPct.toFixed(0)}%` },
                    { label: 'Completadas', value: agendaSnapshot.report.totals.completed },
                    { label: 'No show', value: agendaSnapshot.report.totals.noShow },
                    { label: 'Canceladas', value: agendaSnapshot.report.totals.canceled },
                    { label: 'Agendadas', value: agendaSnapshot.report.totals.scheduledOrConfirmed }
                  ].map(({ label, value }) => (
                    <div key={label} className="flex justify-between">
                      <span className="text-velum-400">{label}</span>
                      <span className="font-medium text-velum-900">{value}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  // ─── Section: Cobranza ────────────────────────────────────────────────────

  const renderCobranza = () => {
    const queue = analytics.collectionQueue;
    const totalRisk = queue.reduce((acc, m) => acc + (m.amount ?? 0), 0);
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-serif text-velum-900">Cobranza</h1>
          <p className="text-sm text-velum-500 mt-1">Pipeline de recuperación de cuentas</p>
        </div>
        <div className="grid grid-cols-3 gap-4">
          <KpiCard icon={<HandCoins size={18} />} label="Por recuperar" value={queue.length} accent={queue.length > 0 ? 'text-red-600' : 'text-velum-900'} />
          <KpiCard icon={<Wallet size={18} />} label="Monto en riesgo" value={formatMoney(totalRisk)} accent="text-amber-600" />
          <KpiCard icon={<CheckCheck size={18} />} label="Activos" value={analytics.sociosActivos} accent="text-emerald-700" />
        </div>
        <div className="bg-white rounded-2xl border border-velum-100 overflow-hidden">
          {queue.length === 0 ? (
            <div className="py-16 text-center">
              <CheckCircle2 size={32} className="mx-auto text-emerald-300 mb-3" />
              <p className="text-sm text-velum-400">Sin cuentas en cobranza activa</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-velum-100 bg-velum-50/50">
                    {['Socio', 'Estado', 'Plan', 'Monto', 'Riesgo', 'Acciones'].map((h) => (
                      <th key={h} className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-velum-400">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {queue.map((m, i) => {
                    const risk = riskOfMember(m);
                    return (
                      <tr key={m.id} className={`hover:bg-velum-50 transition ${i < queue.length - 1 ? 'border-b border-velum-50' : ''}`}>
                        <td className="px-4 py-3">
                          <p className="font-medium text-velum-900">{m.name}</p>
                          <p className="text-xs text-velum-400">{m.email}</p>
                        </td>
                        <td className="px-4 py-3"><Pill label={statusLabel(m.subscriptionStatus)} cls={statusPill(m.subscriptionStatus)} /></td>
                        <td className="px-4 py-3 text-velum-600">{m.plan ?? '—'}</td>
                        <td className="px-4 py-3 font-medium text-velum-900">{m.amount ? formatMoney(m.amount) : '—'}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${risk === 'critical' ? 'text-red-600' : 'text-amber-600'}`}>
                            <span className={`w-2 h-2 rounded-full ${risk === 'critical' ? 'bg-red-500' : 'bg-amber-400'}`} />
                            {risk === 'critical' ? 'Crítico' : 'Atención'}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex gap-2">
                            <button onClick={() => handleUpdateMember(m.id, 'active')}
                              className="text-xs px-2.5 py-1 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 transition">Regularizar</button>
                            <button onClick={() => handleOpenMemberDrawer(m)}
                              className="text-xs px-2.5 py-1 rounded-lg border border-velum-200 text-velum-600 hover:bg-velum-50 transition">Ver</button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    );
  };

  // ─── Section: Riesgos ─────────────────────────────────────────────────────

  const renderRiesgos = () => {
    const critical = members.filter((m) => riskOfMember(m) === 'critical');
    const warning = members.filter((m) => riskOfMember(m) === 'warning');
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-serif text-velum-900">Riesgos</h1>
          <p className="text-sm text-velum-500 mt-1">Monitoreo de exposición operativa y clínica</p>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard icon={<AlertTriangle size={18} />} label="Críticos" value={critical.length} accent={critical.length > 0 ? 'text-red-600' : 'text-velum-900'} />
          <KpiCard icon={<CircleAlert size={18} />} label="En atención" value={warning.length} accent={warning.length > 0 ? 'text-amber-600' : 'text-velum-900'} />
          <KpiCard icon={<ShieldCheck size={18} />} label="Sin consentimiento" value={members.filter((m) => !m.clinical?.consentFormSigned).length} />
          <KpiCard icon={<Activity size={18} />} label="Eventos fallidos" value={analytics.failedAudits} accent={analytics.failedAudits > 0 ? 'text-red-600' : 'text-velum-900'} />
        </div>
        <div className="bg-white rounded-2xl border border-velum-100 overflow-hidden">
          {critical.length === 0 && warning.length === 0 ? (
            <div className="py-16 text-center">
              <ShieldCheck size={32} className="mx-auto text-emerald-300 mb-3" />
              <p className="text-sm text-velum-400">No hay socios en situación de riesgo</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-velum-100 bg-velum-50/50">
                    {['Socio', 'Estado', 'Consentimiento', 'Expediente', 'Nivel', 'Acciones'].map((h) => (
                      <th key={h} className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-velum-400">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[...critical, ...warning].map((m, i) => {
                    const risk = riskOfMember(m);
                    const intake = intakeStatusLabel(m.intakeStatus);
                    return (
                      <tr key={m.id} className={`hover:bg-velum-50 transition ${i < critical.length + warning.length - 1 ? 'border-b border-velum-50' : ''} ${risk === 'critical' ? 'bg-red-50/30' : ''}`}>
                        <td className="px-4 py-3">
                          <p className="font-medium text-velum-900">{m.name}</p>
                          <p className="text-xs text-velum-400">{m.email}</p>
                        </td>
                        <td className="px-4 py-3"><Pill label={statusLabel(m.subscriptionStatus)} cls={statusPill(m.subscriptionStatus)} /></td>
                        <td className="px-4 py-3">
                          <span className={`text-xs font-medium ${m.clinical?.consentFormSigned ? 'text-emerald-600' : 'text-red-500'}`}>
                            {m.clinical?.consentFormSigned ? 'Firmado' : 'Sin firma'}
                          </span>
                        </td>
                        <td className="px-4 py-3"><Pill label={intake.label} cls={intake.cls} /></td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center gap-1.5 text-xs font-bold ${risk === 'critical' ? 'text-red-600' : 'text-amber-600'}`}>
                            <span className={`w-2 h-2 rounded-full ${risk === 'critical' ? 'bg-red-500' : 'bg-amber-400'}`} />
                            {risk === 'critical' ? 'Crítico' : 'Atención'}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <button onClick={() => handleOpenMemberDrawer(m)} className="text-xs text-velum-600 hover:text-velum-900 transition font-medium">Ver perfil</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    );
  };

  // ─── Section: Cumplimiento ────────────────────────────────────────────────

  const renderCumplimiento = () => (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-serif text-velum-900">Cumplimiento</h1>
          <p className="text-sm text-velum-500 mt-1">Bitácora de auditoría y control de acceso</p>
        </div>
        <button onClick={loadData} className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-velum-200 bg-white text-sm text-velum-600 hover:bg-velum-50 transition">
          <RefreshCw size={14} />Actualizar
        </button>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard icon={<CheckCheck size={18} />} label="Firmas de consentimiento" value={analytics.expedientesFirmados} accent="text-emerald-700" />
        <KpiCard icon={<AlertTriangle size={18} />} label="Eventos fallidos" value={analytics.failedAudits} accent={analytics.failedAudits > 0 ? 'text-red-600' : 'text-velum-900'} />
        <KpiCard icon={<Activity size={18} />} label="Eventos sensibles" value={analytics.sensitiveEvents} />
        <KpiCard icon={<Users size={18} />} label="Usuarios con acceso" value={members.filter((m) => m.role !== 'member').length + 1} />
      </div>
      <div className="bg-white rounded-2xl border border-velum-100 overflow-hidden">
        <div className="px-5 py-4 border-b border-velum-100">
          <p className="text-xs font-bold uppercase tracking-widest text-velum-500">Bitácora de auditoría</p>
        </div>
        {auditLogs.length === 0 ? (
          <div className="py-12 text-center text-xs text-velum-400">Sin registros de auditoría disponibles</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-velum-100 bg-velum-50/50">
                  {['Timestamp', 'Usuario', 'Acción', 'IP', 'Estado'].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-velum-400">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {auditLogs.map((log, i) => (
                  <tr key={log.id ?? i} className={`hover:bg-velum-50 transition ${i < auditLogs.length - 1 ? 'border-b border-velum-50' : ''}`}>
                    <td className="px-4 py-3 text-velum-400 whitespace-nowrap font-mono">
                      {new Date(log.timestamp).toLocaleString('es-MX', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td className="px-4 py-3 text-velum-700 max-w-[140px] truncate">{log.user ?? '—'}</td>
                    <td className="px-4 py-3 text-velum-500 font-mono max-w-[200px] truncate">{log.action}</td>
                    <td className="px-4 py-3 text-velum-400 font-mono">{log.ip ?? '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 text-xs font-medium ${log.status === 'success' ? 'text-emerald-600' : 'text-red-600'}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${log.status === 'success' ? 'bg-emerald-500' : 'bg-red-500'}`} />
                        {log.status === 'success' ? 'OK' : 'ERROR'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );

  // ─── Section: Configuraciones ─────────────────────────────────────────────

  const configTabs: Array<{ id: SettingsCategory; label: string }> = [
    { id: 'agenda',        label: 'Agenda' },
    { id: 'sistema',       label: 'Sistema' },
    { id: 'integraciones', label: 'Integraciones' },
    { id: 'auditoria',     label: 'Auditoría' },
  ];

  const renderAgendaSettings = () => (
    <div className="space-y-8">
      {/* Google Calendar */}
      <AgendaIntegrations
        status={googleIntegrationStatus}
        isLoading={isGoogleIntegrationLoading}
        isSaving={isGoogleIntegrationSaving}
        message={googleIntegrationMessage}
        canManage={canManageGoogleIntegration}
        onConnect={handleGoogleConnect}
        onDisconnect={handleGoogleDisconnect}
        onChangeMode={handleGoogleModeChange}
      />

      {/* Policy */}
      <div className="bg-white rounded-2xl border border-velum-100 p-6 space-y-5">
        <p className="text-xs font-bold uppercase tracking-widest text-velum-500">Política de agenda</p>
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-bold uppercase tracking-widest text-velum-400 mb-2">Zona horaria</label>
            <input value={agendaPolicyDraft.timezone} onChange={(e) => updateAgendaPolicyField('timezone', e.target.value)}
              className="w-full rounded-xl border border-velum-200 px-3 py-2.5 text-sm focus:outline-none focus:border-velum-900 transition" />
          </div>
          <div>
            <label className="block text-xs font-bold uppercase tracking-widest text-velum-400 mb-2">Intervalo de slot (min)</label>
            <select value={agendaPolicyDraft.slotMinutes} onChange={(e) => updateAgendaPolicyField('slotMinutes', Number(e.target.value))}
              className="w-full rounded-xl border border-velum-200 px-3 py-2.5 text-sm focus:outline-none focus:border-velum-900 transition bg-white">
              {[10, 15, 20, 30, 45, 60, 90, 120].map((v) => <option key={v} value={v}>{v} min</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold uppercase tracking-widest text-velum-400 mb-2">Auto-confirmar (horas)</label>
            <input type="number" min="0" max="72" value={agendaPolicyDraft.autoConfirmHours} onChange={(e) => updateAgendaPolicyField('autoConfirmHours', Number(e.target.value))}
              className="w-full rounded-xl border border-velum-200 px-3 py-2.5 text-sm focus:outline-none focus:border-velum-900 transition" />
          </div>
          <div>
            <label className="block text-xs font-bold uppercase tracking-widest text-velum-400 mb-2">Gracia no-show (min)</label>
            <input type="number" min="5" max="240" value={agendaPolicyDraft.noShowGraceMinutes} onChange={(e) => updateAgendaPolicyField('noShowGraceMinutes', Number(e.target.value))}
              className="w-full rounded-xl border border-velum-200 px-3 py-2.5 text-sm focus:outline-none focus:border-velum-900 transition" />
          </div>
          <div>
            <label className="block text-xs font-bold uppercase tracking-widest text-velum-400 mb-2">Anticipación mínima (min)</label>
            <input type="number" min="0" value={agendaPolicyDraft.minAdvanceMinutes} onChange={(e) => updateAgendaPolicyField('minAdvanceMinutes', Number(e.target.value))}
              className="w-full rounded-xl border border-velum-200 px-3 py-2.5 text-sm focus:outline-none focus:border-velum-900 transition" />
          </div>
          <div>
            <label className="block text-xs font-bold uppercase tracking-widest text-velum-400 mb-2">Máx. días de anticipación</label>
            <input type="number" min="1" max="365" value={agendaPolicyDraft.maxAdvanceDays} onChange={(e) => updateAgendaPolicyField('maxAdvanceDays', Number(e.target.value))}
              className="w-full rounded-xl border border-velum-200 px-3 py-2.5 text-sm focus:outline-none focus:border-velum-900 transition" />
          </div>
          <div>
            <label className="block text-xs font-bold uppercase tracking-widest text-velum-400 mb-2">Citas activas/semana</label>
            <input type="number" min="1" max="50" value={agendaPolicyDraft.maxActiveAppointmentsPerWeek} onChange={(e) => updateAgendaPolicyField('maxActiveAppointmentsPerWeek', Number(e.target.value))}
              className="w-full rounded-xl border border-velum-200 px-3 py-2.5 text-sm focus:outline-none focus:border-velum-900 transition" />
          </div>
          <div>
            <label className="block text-xs font-bold uppercase tracking-widest text-velum-400 mb-2">Citas activas/mes</label>
            <input type="number" min="1" max="200" value={agendaPolicyDraft.maxActiveAppointmentsPerMonth} onChange={(e) => updateAgendaPolicyField('maxActiveAppointmentsPerMonth', Number(e.target.value))}
              className="w-full rounded-xl border border-velum-200 px-3 py-2.5 text-sm focus:outline-none focus:border-velum-900 transition" />
          </div>
        </div>
      </div>

      {/* Cabins */}
      <div className="bg-white rounded-2xl border border-velum-100 p-6 space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-xs font-bold uppercase tracking-widest text-velum-500">Cabinas</p>
          <button onClick={addCabinDraft} className="text-xs px-3 py-1.5 rounded-lg bg-velum-900 text-white hover:bg-velum-800 transition">+ Agregar</button>
        </div>
        {agendaCabinsDraft.length === 0 ? (
          <p className="text-xs text-velum-400 text-center py-4">Sin cabinas configuradas</p>
        ) : (
          <div className="space-y-3">
            {agendaCabinsDraft.map((cabin) => (
              <div key={cabin.id} className="flex items-center gap-3 p-3 rounded-xl bg-velum-50 border border-velum-100">
                <input value={cabin.name} onChange={(e) => updateCabinDraftField(cabin.id, { name: e.target.value })}
                  className="flex-1 rounded-lg border border-velum-200 px-3 py-2 text-sm focus:outline-none focus:border-velum-900 transition bg-white" placeholder="Nombre de la cabina" />
                <label className="flex items-center gap-1.5 text-xs text-velum-600 cursor-pointer">
                  <input type="checkbox" checked={cabin.isActive} onChange={(e) => updateCabinDraftField(cabin.id, { isActive: e.target.checked })} className="rounded" />
                  Activa
                </label>
                <button onClick={() => removeCabinDraft(cabin.id)} className="p-1.5 rounded-lg text-velum-400 hover:text-red-600 hover:bg-red-50 transition"><Trash2 size={14} /></button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Treatments */}
      <div className="bg-white rounded-2xl border border-velum-100 p-6 space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-xs font-bold uppercase tracking-widest text-velum-500">Tratamientos</p>
          <button onClick={addTreatmentDraft} className="text-xs px-3 py-1.5 rounded-lg bg-velum-900 text-white hover:bg-velum-800 transition">+ Agregar</button>
        </div>
        {agendaTreatmentsDraft.length === 0 ? (
          <p className="text-xs text-velum-400 text-center py-4">Sin tratamientos configurados</p>
        ) : (
          <div className="space-y-4">
            {agendaTreatmentsDraft.map((t) => (
              <div key={t.id} className="p-4 rounded-xl bg-velum-50 border border-velum-100 space-y-3">
                <div className="flex items-center gap-3">
                  <input value={t.name} onChange={(e) => updateTreatmentDraftField(t.id, { name: e.target.value })}
                    className="flex-1 rounded-lg border border-velum-200 px-3 py-2 text-sm bg-white focus:outline-none focus:border-velum-900 transition" placeholder="Nombre del tratamiento" />
                  <input value={t.code} onChange={(e) => updateTreatmentDraftField(t.id, { code: e.target.value.toLowerCase() })}
                    className="w-32 rounded-lg border border-velum-200 px-3 py-2 text-sm font-mono bg-white focus:outline-none focus:border-velum-900 transition" placeholder="codigo" />
                  <label className="flex items-center gap-1.5 text-xs text-velum-600 cursor-pointer shrink-0">
                    <input type="checkbox" checked={t.isActive} onChange={(e) => updateTreatmentDraftField(t.id, { isActive: e.target.checked })} className="rounded" />
                    Activo
                  </label>
                  <button onClick={() => removeTreatmentDraft(t.id)} className="p-1.5 rounded-lg text-velum-400 hover:text-red-600 hover:bg-red-50 transition"><Trash2 size={14} /></button>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[10px] text-velum-400 mb-1 font-bold uppercase tracking-wider">Duración (min)</label>
                    <input type="number" min="10" step="5" value={t.durationMinutes} onChange={(e) => updateTreatmentDraftField(t.id, { durationMinutes: Number(e.target.value) })}
                      className="w-full rounded-lg border border-velum-200 px-3 py-2 text-sm bg-white focus:outline-none focus:border-velum-900 transition" />
                  </div>
                  <div>
                    <label className="block text-[10px] text-velum-400 mb-1 font-bold uppercase tracking-wider">Buffer prep (min)</label>
                    <input type="number" min="0" value={t.prepBufferMinutes ?? 0} onChange={(e) => updateTreatmentDraftField(t.id, { prepBufferMinutes: Number(e.target.value) })}
                      className="w-full rounded-lg border border-velum-200 px-3 py-2 text-sm bg-white focus:outline-none focus:border-velum-900 transition" />
                  </div>
                  <div>
                    <label className="block text-[10px] text-velum-400 mb-1 font-bold uppercase tracking-wider">Buffer limpieza (min)</label>
                    <input type="number" min="0" value={t.cleanupBufferMinutes ?? 0} onChange={(e) => updateTreatmentDraftField(t.id, { cleanupBufferMinutes: Number(e.target.value) })}
                      className="w-full rounded-lg border border-velum-200 px-3 py-2 text-sm bg-white focus:outline-none focus:border-velum-900 transition" />
                  </div>
                </div>
                {agendaCabinsDraft.length > 0 && (
                  <div>
                    <label className="flex items-center gap-2 text-xs text-velum-600 cursor-pointer mb-2">
                      <input type="checkbox" checked={t.requiresSpecificCabin} onChange={(e) => updateTreatmentDraftField(t.id, { requiresSpecificCabin: e.target.checked })} className="rounded" />
                      Requiere cabina específica
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {agendaCabinsDraft.map((cabin) => (
                        <label key={cabin.id} className="flex items-center gap-1.5 text-xs text-velum-600 cursor-pointer">
                          <input type="checkbox" checked={(t.allowedCabinIds ?? []).includes(cabin.id)}
                            onChange={(e) => toggleTreatmentCabinAllowed(t.id, cabin.id, e.target.checked)} className="rounded" />
                          {cabin.name}
                        </label>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Weekly rules */}
      <div className="bg-white rounded-2xl border border-velum-100 p-6 space-y-4">
        <p className="text-xs font-bold uppercase tracking-widest text-velum-500">Horarios semanales</p>
        <div className="space-y-2">
          {agendaWeeklyRulesDraft.map((rule) => (
            <div key={rule.dayOfWeek} className="flex items-center gap-4 py-2 border-b border-velum-50 last:border-0">
              <label className="flex items-center gap-2 w-32 text-sm text-velum-700 cursor-pointer">
                <input type="checkbox" checked={rule.isOpen} onChange={(e) => updateWeeklyRuleField(rule.dayOfWeek, { isOpen: e.target.checked })} className="rounded" />
                {weekDayLabel[rule.dayOfWeek]}
              </label>
              {rule.isOpen && (
                <div className="flex items-center gap-2 text-sm">
                  <input type="number" min="0" max="23" value={rule.startHour} onChange={(e) => updateWeeklyRuleField(rule.dayOfWeek, { startHour: Number(e.target.value) })}
                    className="w-16 rounded-lg border border-velum-200 px-2 py-1.5 text-sm text-center focus:outline-none focus:border-velum-900 transition" />
                  <span className="text-velum-400">—</span>
                  <input type="number" min="1" max="24" value={rule.endHour} onChange={(e) => updateWeeklyRuleField(rule.dayOfWeek, { endHour: Number(e.target.value) })}
                    className="w-16 rounded-lg border border-velum-200 px-2 py-1.5 text-sm text-center focus:outline-none focus:border-velum-900 transition" />
                  <span className="text-xs text-velum-400">hrs</span>
                </div>
              )}
              {!rule.isOpen && <span className="text-xs text-velum-400 italic">Cerrado</span>}
            </div>
          ))}
        </div>
      </div>

      {/* Save */}
      {agendaMessage && (
        <div className={`p-4 rounded-xl text-sm ${agendaMessage.type === 'ok' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
          {agendaMessage.text}
        </div>
      )}
      <button onClick={saveAgendaConfiguration} disabled={isAgendaConfigSaving}
        className="w-full bg-velum-900 text-white rounded-xl py-3 text-sm font-medium hover:bg-velum-800 transition disabled:opacity-50">
        {isAgendaConfigSaving ? 'Guardando configuración...' : 'Guardar configuración de agenda'}
      </button>
    </div>
  );

  const renderConfiguraciones = () => (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-serif text-velum-900">Ajustes</h1>
        <p className="text-sm text-velum-500 mt-1">Configuración del sistema, integraciones y auditoría</p>
      </div>
      {/* Sub-tabs */}
      <div className="flex gap-1 bg-velum-100 p-1 rounded-xl w-fit flex-wrap">
        {configTabs.map((tab) => (
          <button key={tab.id} onClick={() => setSettingsCategory(tab.id)}
            className={`px-4 py-2 rounded-lg text-xs font-medium transition ${settingsCategory === tab.id ? 'bg-white text-velum-900 shadow-sm' : 'text-velum-500 hover:text-velum-700'}`}>
            {tab.label}
          </button>
        ))}
      </div>
      {settingsCategory === 'agenda' && renderAgendaSettings()}
      {settingsCategory === 'sistema' && <AdminUsersPermissions embedded />}
      {settingsCategory === 'integraciones' && (
        <div className="space-y-6">
          <AdminStripeSettings embedded />
          <AdminWhatsAppSettings embedded />
        </div>
      )}
      {settingsCategory === 'auditoria' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-bold uppercase tracking-widest text-velum-400">Bitácora de auditoría</p>
            <button onClick={() => void loadData()} className="flex items-center gap-1.5 text-xs text-velum-400 hover:text-velum-900 transition">
              <RefreshCw size={12} className={isLoadingData ? 'animate-spin' : ''} />Actualizar
            </button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-2">
            {[
              { label: 'Firmas de consentimiento', value: analytics.expedientesFirmados, cls: 'text-emerald-700' },
              { label: 'Eventos fallidos', value: analytics.failedAudits, cls: analytics.failedAudits > 0 ? 'text-red-600' : 'text-velum-900' },
              { label: 'Eventos sensibles', value: analytics.sensitiveEvents, cls: 'text-velum-900' },
              { label: 'Usuarios con acceso', value: members.filter((m) => m.role !== 'member').length + 1, cls: 'text-velum-900' },
            ].map(({ label, value, cls }) => (
              <div key={label} className="bg-white rounded-2xl border border-velum-100 p-4">
                <p className="text-[10px] font-bold uppercase tracking-widest text-velum-400 mb-2">{label}</p>
                <p className={`text-2xl font-serif font-bold ${cls}`}>{value}</p>
              </div>
            ))}
          </div>
          <div className="bg-white rounded-2xl border border-velum-100 overflow-hidden">
            {auditLogs.length === 0 ? (
              <div className="py-12 text-center">
                <Shield size={28} className="mx-auto text-velum-200 mb-3" />
                <p className="text-sm text-velum-400">Sin registros de auditoría</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-velum-100 bg-velum-50/50">
                      {['Fecha', 'Usuario', 'Acción', 'IP', 'Estado'].map((h) => (
                        <th key={h} className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-velum-400">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {auditLogs.map((log, i) => (
                      <tr key={log.id ?? i} className={`${i < auditLogs.length - 1 ? 'border-b border-velum-50' : ''} hover:bg-velum-50/50 transition`}>
                        <td className="px-4 py-2.5 text-velum-400 whitespace-nowrap">
                          {new Date(log.timestamp).toLocaleString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                        </td>
                        <td className="px-4 py-2.5 text-velum-700 font-medium max-w-[140px] truncate">{log.user ?? '—'}</td>
                        <td className="px-4 py-2.5 text-velum-500 font-mono">{log.action}</td>
                        <td className="px-4 py-2.5 text-velum-400 font-mono">{log.ip ?? '—'}</td>
                        <td className="px-4 py-2.5">
                          <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${log.status === 'success' ? 'text-emerald-600' : 'text-red-600'}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${log.status === 'success' ? 'bg-emerald-500' : 'bg-red-500'}`} />
                            {log.status === 'success' ? 'OK' : 'Error'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );

  // ─── Section dispatcher ───────────────────────────────────────────────────

  const renderSection = () => {
    if (isLoadingData) {
      return (
        <div className="space-y-4">
          {[1, 2, 3, 4].map((i) => <div key={i} className="h-24 bg-velum-100 rounded-2xl animate-pulse" />)}
        </div>
      );
    }
    if (dataLoadError) {
      return (
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <div className="w-12 h-12 rounded-2xl bg-red-50 border border-red-200 flex items-center justify-center">
            <AlertTriangle size={22} className="text-red-500" />
          </div>
          <div className="text-center">
            <p className="text-sm font-semibold text-velum-900">Error al cargar datos</p>
            <p className="text-xs text-velum-400 mt-1 max-w-xs">{dataLoadError}</p>
          </div>
          <button onClick={() => void loadData()}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-velum-900 text-white text-sm font-medium hover:bg-velum-800 transition">
            <RefreshCw size={14} />Reintentar
          </button>
        </div>
      );
    }
    switch (activeSection) {
      case 'panel':        return renderPanel();
      case 'socias':       return renderSocios();
      case 'agenda':       return renderAgenda();
      case 'expedientes':  return renderExpedientes();
      case 'ajustes':      return renderConfiguraciones();
      default:             return null;
    }
  };

  // ─── Login form ───────────────────────────────────────────────────────────

  if (isAuthLoading) {
    return (
      <div className="min-h-screen bg-velum-50 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-velum-900 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated || !hasAccess) {
    return (
      <div className="min-h-screen bg-velum-50 flex items-center justify-center p-4">
        <div className="w-full max-w-sm">
          <div className="text-center mb-8">
            <VelumLogo className="h-8 w-auto mx-auto mb-6 opacity-90" />
            <h1 className="text-2xl font-serif text-velum-900">Acceso administrativo</h1>
            <p className="text-sm text-velum-500 mt-2">Solo personal autorizado</p>
          </div>
          <form onSubmit={handleLogin} className="bg-white rounded-2xl border border-velum-100 shadow-sm p-8 space-y-5">
            {loginError && (
              <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">{loginError}</div>
            )}
            <div>
              <label className="block text-xs font-bold uppercase tracking-widest text-velum-500 mb-2">Correo electrónico</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus
                placeholder="admin@velum.mx"
                className="w-full rounded-xl border border-velum-200 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-velum-900/20 focus:border-velum-900 transition" />
            </div>
            <div>
              <label className="block text-xs font-bold uppercase tracking-widest text-velum-500 mb-2">Contraseña</label>
              <PasswordInput value={password} onChange={(e) => setPassword(e.target.value)} required
                className="w-full rounded-xl border border-velum-200 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-velum-900/20 focus:border-velum-900 transition" />
            </div>
            <button type="submit" disabled={isAuthLoading}
              className="w-full bg-velum-900 text-white rounded-xl py-3 text-sm font-medium hover:bg-velum-800 transition disabled:opacity-50">
              {isAuthLoading ? 'Accediendo...' : 'Acceder al panel'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // ─── Main Admin Layout ─────────────────────────────────────────────────────

  const SIDEBAR_FULL = 220;
  const SIDEBAR_MINI = 64;
  const sidebarPx = isSidebarCollapsed ? SIDEBAR_MINI : SIDEBAR_FULL;

  const SidebarContent = () => (
    <>
      {/* Logo */}
      <div className="flex items-center gap-3 px-4 h-14 border-b border-white/10 shrink-0">
        <VelumLogo className="h-5 w-auto shrink-0 brightness-0 invert" />
        {!isSidebarCollapsed && (
          <span className="text-white font-serif text-[15px] leading-tight truncate">
            Velum <span className="text-white/40 font-sans text-[10px] uppercase tracking-widest">Admin</span>
          </span>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-4 px-2 space-y-1">
        {NAV_SECTIONS.map((section) => {
          const meta = sectionMeta[section];
          const Icon = meta.icon;
          const isActive = activeSection === section;
          const badge =
            section === 'expedientes' ? members.filter((m) => m.intakeStatus === 'submitted').length
            : section === 'socias'    ? members.filter((m) => riskOfMember(m) !== 'ok').length
            : 0;
          return (
            <button
              key={section}
              onClick={() => { setActiveSection(section); setSidebarOpen(false); }}
              title={isSidebarCollapsed ? meta.label : undefined}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-medium transition-all duration-150
                ${isActive
                  ? 'bg-white/[0.14] text-white'
                  : 'text-white/50 hover:text-white hover:bg-white/[0.07]'
                }`}
            >
              <div className="relative shrink-0 w-[18px] h-[18px] flex items-center justify-center">
                <Icon size={17} />
                {!isActive && badge > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 min-w-[14px] h-[14px] bg-red-500 rounded-full text-[9px] font-bold text-white flex items-center justify-center px-0.5 leading-none">
                    {badge > 9 ? '9+' : badge}
                  </span>
                )}
              </div>
              {!isSidebarCollapsed && (
                <>
                  <span className="flex-1 truncate text-left">{meta.label}</span>
                  {!isActive && badge > 0 && (
                    <span className="shrink-0 min-w-[20px] h-5 bg-red-500 text-white rounded-full text-[10px] font-bold flex items-center justify-center px-1.5">
                      {badge > 9 ? '9+' : badge}
                    </span>
                  )}
                </>
              )}
            </button>
          );
        })}
      </nav>

      {/* Bottom */}
      <div className="border-t border-white/10 p-2 space-y-1 shrink-0">
        {!isSidebarCollapsed && (
          <div className="px-3 py-2">
            <p className="text-[11px] text-white/60 font-medium truncate">{user?.email}</p>
            <p className="text-[10px] text-white/30">{roleTitle[user?.role as UserRole] ?? user?.role}</p>
          </div>
        )}
        <button
          onClick={logout}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-white/40 hover:text-white hover:bg-white/10 transition text-[13px]"
          title={isSidebarCollapsed ? 'Cerrar sesión' : undefined}
        >
          <LogOut size={15} className="shrink-0" />
          {!isSidebarCollapsed && 'Cerrar sesión'}
        </button>
        <button
          onClick={() => setIsSidebarCollapsed((v) => !v)}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-white/25 hover:text-white/60 transition"
          title={isSidebarCollapsed ? 'Expandir' : 'Colapsar'}
        >
          <ChevronLeft size={15} className={`shrink-0 transition-transform duration-200 ${isSidebarCollapsed ? 'rotate-180' : ''}`} />
          {!isSidebarCollapsed && <span className="text-[11px]">Colapsar</span>}
        </button>
      </div>
    </>
  );

  return (
    <div className="min-h-screen bg-velum-50 flex">

      {/* ── Sidebar desktop (always visible ≥ md) ── */}
      <aside
        style={{ width: sidebarPx }}
        className="hidden md:flex flex-col fixed left-0 top-0 h-screen bg-velum-900 z-30 transition-[width] duration-200 overflow-hidden"
      >
        <SidebarContent />
      </aside>

      {/* ── Sidebar mobile (overlay, shown when sidebarOpen) ── */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}
      <aside
        className={`flex flex-col fixed left-0 top-0 h-screen bg-velum-900 z-50 md:hidden transition-transform duration-200 overflow-hidden
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}
        style={{ width: SIDEBAR_FULL }}
      >
        <SidebarContent />
      </aside>

      {/* ── Main area ── */}
      <div
        className="flex-1 flex flex-col min-h-screen transition-all duration-200"
        style={{ marginLeft: typeof window !== 'undefined' && window.innerWidth >= 768 ? sidebarPx : 0 }}
      >
        {/* Top bar */}
        <header className="sticky top-0 z-20 h-14 bg-white border-b border-velum-100 flex items-center justify-between px-5 shrink-0">
          <div className="flex items-center gap-2">
            {/* Mobile hamburger */}
            <button
              onClick={() => setSidebarOpen((v) => !v)}
              className="p-2 rounded-xl text-velum-400 hover:text-velum-700 hover:bg-velum-50 transition md:hidden"
            >
              <Menu size={18} />
            </button>
            <span className="text-velum-300 text-xs font-medium uppercase tracking-widest hidden sm:block">Admin</span>
            <ChevronRight size={13} className="text-velum-200 hidden sm:block" />
            <span className="text-sm font-semibold text-velum-900">{sectionMeta[activeSection].label}</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => void loadData()}
              className="p-2 rounded-xl text-velum-400 hover:text-velum-700 hover:bg-velum-50 transition"
              title="Actualizar datos"
            >
              <RefreshCw size={15} className={isLoadingData ? 'animate-spin' : ''} />
            </button>
            <div className="w-8 h-8 rounded-full bg-velum-900 flex items-center justify-center text-white text-xs font-bold select-none">
              {user?.email?.[0]?.toUpperCase() ?? 'A'}
            </div>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-y-auto">
          <div className="max-w-6xl mx-auto px-5 py-7">
            {renderSection()}
          </div>
        </main>
      </div>

      {/* Modals */}
      {renderSessionModal()}
      {renderMemberDrawer()}
      {renderIntakeModal()}

      {/* Cancel membership confirmation dialog */}
      {confirmCancelMemberId && (() => {
        const m = members.find((x) => x.id === confirmCancelMemberId);
        return (
          <>
            <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50" onClick={() => setConfirmCancelMemberId(null)} />
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
              <div className="pointer-events-auto w-full max-w-sm bg-white rounded-3xl shadow-2xl p-6 space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-red-50 border border-red-200 flex items-center justify-center shrink-0">
                    <XCircle size={18} className="text-red-500" />
                  </div>
                  <div>
                    <p className="font-semibold text-velum-900 text-sm">Cancelar membresía</p>
                    <p className="text-xs text-velum-500 mt-0.5">Esta acción es reversible desde el panel.</p>
                  </div>
                </div>
                {m && (
                  <div className="bg-velum-50 rounded-xl px-4 py-3">
                    <p className="text-xs font-bold uppercase tracking-widest text-velum-400 mb-0.5">Socio</p>
                    <p className="text-sm font-medium text-velum-900">{m.name || m.email}</p>
                    <p className="text-xs text-velum-500">{m.email}</p>
                  </div>
                )}
                <p className="text-xs text-velum-600">¿Confirmas que deseas cancelar la membresía de este socio? Su acceso quedará suspendido.</p>
                <div className="flex gap-2">
                  <button onClick={() => { setConfirmCancelMemberId(null); void doUpdateMember(confirmCancelMemberId, 'canceled'); }}
                    className="flex-1 bg-red-600 text-white rounded-xl py-2.5 text-sm font-medium hover:bg-red-700 transition">
                    Confirmar cancelación
                  </button>
                  <button onClick={() => setConfirmCancelMemberId(null)}
                    className="px-4 py-2.5 rounded-xl border border-velum-200 text-sm text-velum-600 hover:bg-velum-50 transition">
                    Cancelar
                  </button>
                </div>
              </div>
            </div>
          </>
        );
      })()}
    </div>
  );
};
