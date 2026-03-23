import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { PasswordInput } from '../components/PasswordInput';
import { VelumLogo } from '../components/VelumLogo';
import { AgendaIntegrations } from './settings/AgendaIntegrations';
import {
  CalendarDays,
  Menu,
  X,
  ChevronLeft,
  ChevronRight,
  Search,
  RefreshCw,
  AlertTriangle,
  FileText,
  ArrowRight,
  CheckCircle2,
  CircleAlert,
  Shield,
  HandCoins,
  Trash2,
  Zap,
  CheckCheck,
  XCircle,
  Plus,
  Download,
  BarChart3,
  Loader2
} from 'lucide-react';
import { AuditLogEntry, Member, UserRole } from '../types';
import { AdminSection, HealthFlag, AgendaPolicyDraft, AgendaTemplatePreset, SettingsCategory, ControlAlert } from './admin/adminTypes';
import { AdminSidebarContent, riskOfMember, sectionMeta, weekDayLabel, allowedRoles } from './admin/AdminSidebar';
import { AdminErrorBoundary } from '../components/AdminErrorBoundary';
import { useAuth } from '../context/AuthContext';
import { memberService, auditService } from '../services/dataService';
import { SessionTreatment, SessionCreatePayload, MedicalIntake } from '../services/clinicalService';
import { AdminUsersPermissions } from "./AdminUsersPermissions";
import { AdminCreatePatientDrawer } from "../components/AdminCreatePatientDrawer";
import { AdminStripeSettings } from "./AdminStripeSettings";
import { AdminWhatsAppSettings } from "./AdminWhatsAppSettings";
import { AdminRiesgosSection } from "./AdminRiesgosSection";
import { AdminCumplimientoSection } from "./AdminCumplimientoSection";
import { AdminKPIsSection } from "./AdminKPIsSection";
import { AdminFinanzasSection } from "./AdminFinanzasSection";
import { AdminPanelSection } from "./AdminPanelSection";
import { AdminSociasSection } from "./AdminSociasSection";
import { AdminExpedientesSection } from "./AdminExpedientesSection";
import { AdminPagosSection } from "./AdminPagosSection";
import { useToast } from "../context/ToastContext";
import { apiFetch } from "../services/apiClient";
import { AdminMemberDrawer } from "../components/AdminMemberDrawer";
import { AdminIntakeModal } from "../components/AdminIntakeModal";
import { SectionErrorBoundary } from "../components/SectionErrorBoundary";
import {
  formatMoney, statusLabel, statusPill, intakeStatusLabel, apptStatusLabel, Pill
} from "./adminShared";
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



const parseMxDate = (value?: string) => {
  if (!value) return null;
  // Strings ISO de solo fecha ("YYYY-MM-DD") se parsean en UTC si no tienen hora,
  // lo que puede mostrar el día anterior en zona horaria local. Forzamos hora local.
  const direct = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? new Date(`${value}T00:00:00`)
    : new Date(value);
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


export const Admin: React.FC = () => {
  const { login, logout, user, isAuthenticated, isSessionLoading: isAuthLoading, isActionLoading } = useAuth();
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
  const [tablePage, setTablePage] = useState(1);
  const [membersTotal, setMembersTotal] = useState(0);
  const [serverSearchResults, setServerSearchResults] = useState<Member[] | null>(null);
  const [isSearchingServer, setIsSearchingServer] = useState(false);
  const [auditStatusFilter, setAuditStatusFilter] = useState<'all' | 'success' | 'failed'>('all');
  const [selectedMember, setSelectedMember] = useState<Member | null>(null);

  // Session registration
  const [sessionModalMember, setSessionModalMember] = useState<Member | null>(null);
  const [sessionForm, setSessionForm] = useState({ appointmentId: '', zona: '', fluencia: '', frecuencia: '', spot: '', passes: '', notes: '', adverseEvents: '' });
  const [isSessionSaving, setIsSessionSaving] = useState(false);
  const [cancelConfirmApptId, setCancelConfirmApptId] = useState<string | null>(null);
  const [confirmCancelMemberId, setConfirmCancelMemberId] = useState<string | null>(null);
  const [patientDrawerOpen, setPatientDrawerOpen] = useState(false);

  // Drawer history (shared between modal and drawer)
  const [memberSessions, setMemberSessions] = useState<SessionTreatment[]>([]);
  const [isLoadingSessions, setIsLoadingSessions] = useState(false);
  const [memberAppointments, setMemberAppointments] = useState<Appointment[]>([]);
  const [memberPayments, setMemberPayments] = useState<any[]>([]);
  const [isLoadingMemberHistory, setIsLoadingMemberHistory] = useState(false);
  const [serverReports, setServerReports] = useState<{ users: number; activeMemberships: number; pastDueMemberships: number; pendingDocuments: number } | null>(null);

  // Payment history with filters + pagination
  const [histPayments, setHistPayments] = useState<any[]>([]);
  const [histLoading, setHistLoading] = useState(false);
  const [histDateFrom, setHistDateFrom] = useState('');
  const [histDateTo, setHistDateTo] = useState('');
  const [histStatus, setHistStatus] = useState('');
  const [histLoaded, setHistLoaded] = useState(false);
  const [histError, setHistError] = useState('');
  const [histPage, setHistPage] = useState(1);
  const [histTotal, setHistTotal] = useState(0);
  const [histPages, setHistPages] = useState(1);
  const HIST_LIMIT = 50;

  const loadHistPayments = async (page = 1) => {
    setHistLoading(true);
    setHistError('');
    try {
      const params = new URLSearchParams();
      if (histDateFrom) params.set('dateFrom', histDateFrom);
      if (histDateTo) params.set('dateTo', histDateTo);
      if (histStatus) params.set('status', histStatus);
      params.set('page', String(page));
      params.set('limit', String(HIST_LIMIT));
      const data = await apiFetch<any>(`/v1/payments?${params.toString()}`);
      setHistPayments(data?.payments ?? []);
      setHistTotal(data?.total ?? 0);
      setHistPages(data?.pages ?? 1);
      setHistPage(page);
      setHistLoaded(true);
    } catch (e: any) {
      setHistError(e?.message ?? 'No se pudo cargar el historial');
    } finally {
      setHistLoading(false);
    }
  };

  // Integration jobs monitoring
  const [integrationJobs, setIntegrationJobs] = useState<any[]>([]);
  const [integrationJobsLoading, setIntegrationJobsLoading] = useState(false);
  const [integrationJobsLoaded, setIntegrationJobsLoaded] = useState(false);
  const [integrationJobsStatus, setIntegrationJobsStatus] = useState('');

  const [integrationJobsError, setIntegrationJobsError] = useState('');

  const loadIntegrationJobs = async (status?: string) => {
    setIntegrationJobsLoading(true);
    setIntegrationJobsError('');
    try {
      const params = new URLSearchParams();
      if (status) params.set('status', status);
      const data = await apiFetch<any>(`/v1/admin/integrations/jobs?${params.toString()}`);
      setIntegrationJobs(data?.jobs ?? []);
      setIntegrationJobsLoaded(true);
    } catch (e: any) {
      setIntegrationJobsError(e?.message ?? 'No se pudo cargar los trabajos');
    } finally {
      setIntegrationJobsLoading(false);
    }
  };

  // Webhook events
  const [webhookEvents, setWebhookEvents] = useState<any[]>([]);
  const [webhookEventsLoading, setWebhookEventsLoading] = useState(false);
  const [webhookEventsLoaded, setWebhookEventsLoaded] = useState(false);

  const [webhookEventsError, setWebhookEventsError] = useState('');

  const loadWebhookEvents = async () => {
    setWebhookEventsLoading(true);
    setWebhookEventsError('');
    try {
      const data = await apiFetch<any>('/v1/admin/stripe/webhook-events');
      setWebhookEvents(data?.events ?? []);
      setWebhookEventsLoaded(true);
    } catch (e: any) {
      setWebhookEventsError(e?.message ?? 'No se pudo cargar los eventos');
    } finally {
      setWebhookEventsLoading(false);
    }
  };

  // Drawer: deactivate / delete with OTP
  const [criticalActionsOpen, setCriticalActionsOpen] = useState(false);
  const [drawerDeactivating, setDrawerDeactivating] = useState(false);
  const [drawerDeleteStep, setDrawerDeleteStep] = useState<'idle' | 'otp-send' | 'otp-confirm'>('idle');
  const [drawerDeleteOtp, setDrawerDeleteOtp] = useState('');
  const [drawerDeleteMsg, setDrawerDeleteMsg] = useState('');
  const [drawerDeleteSending, setDrawerDeleteSending] = useState(false);
  const [drawerDeleting, setDrawerDeleting] = useState(false);
  const drawerOtpRef = useRef<HTMLInputElement>(null);

  const closeCriticalActions = () => {
    setCriticalActionsOpen(false);
    setDrawerDeleteStep('idle');
    setDrawerDeleteOtp('');
    setDrawerDeleteMsg('');
  };

  // Intake approval
  const [isApprovingIntake, setIsApprovingIntake] = useState<string | null>(null);
  const [intakeToApprove, setIntakeToApprove] = useState<string | null>(null);
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
  const [weekBulkAction, setWeekBulkAction] = useState<'open' | 'close' | 'clear'>('open');
  const [weekBulkScope, setWeekBulkScope] = useState<'week' | 'workdays' | 'weekend' | 'custom'>('week');
  const [weekBulkSelectedDays, setWeekBulkSelectedDays] = useState<number[]>([1,2,3,4,5,6,0]);
  const [weekBulkPreset, setWeekBulkPreset] = useState<'morning' | 'afternoon' | 'full' | 'custom'>('full');
  const [weekBulkStart, setWeekBulkStart] = useState(8);
  const [weekBulkEnd, setWeekBulkEnd] = useState(20);
  const [weekBulkNote, setWeekBulkNote] = useState('');
  const [isAgendaSaving, setIsAgendaSaving] = useState(false);
  const [isAgendaConfigSaving, setIsAgendaConfigSaving] = useState(false);
  const [agendaMessage, setAgendaMessage] = useState<{ type: 'ok' | 'error'; text: string } | null>(null);
  const [googleIntegrationStatus, setGoogleIntegrationStatus] = useState<GoogleCalendarIntegrationStatus | null>(null);
  const [isGoogleIntegrationLoading, setIsGoogleIntegrationLoading] = useState(false);
  const [isGoogleIntegrationSaving, setIsGoogleIntegrationSaving] = useState(false);
  const [googleIntegrationMessage, setGoogleIntegrationMessage] = useState<{ type: 'ok' | 'error'; text: string } | null>(null);

  const hasAccess = !!user && allowedRoles.includes(user.role);
  const canManageGoogleIntegration = user?.role === 'admin' || user?.role === 'system';

  // Detecta desktop con resize listener para el marginLeft de la sidebar
  const [isDesktop, setIsDesktop] = useState(() =>
    typeof window !== 'undefined' && window.innerWidth >= 768
  );
  useEffect(() => {
    const update = () => setIsDesktop(window.innerWidth >= 768);
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  const normalizeTreatmentDrafts = (items: AgendaTreatment[]) =>
    items.map((treatment) => ({
      ...treatment,
      prepBufferMinutes: treatment.prepBufferMinutes ?? 0,
      cleanupBufferMinutes: treatment.cleanupBufferMinutes ?? 0,
      allowedCabinIds: treatment.allowedCabinIds ?? (treatment.cabinId ? [treatment.cabinId] : [])
    }));

  const loadData = async () => {
    setIsLoadingData(true);
    setDataLoadError('');
    try {
      const [membersResult, logsData, configData, dayData, integrationData, reportsData] = await Promise.all([
        memberService.getAll({ limit: 200 }),
        user?.role === 'admin' || user?.role === 'system'
          ? auditService.getLogs().catch(() => [] as AuditLogEntry[])
          : Promise.resolve([] as AuditLogEntry[]),
        clinicalService.getAdminAgendaConfig().catch(() => null),
        clinicalService.getAdminAgendaDay(agendaDate).catch(() => null),
        user?.role === 'admin' || user?.role === 'system'
          ? googleCalendarIntegrationService.getStatus().catch(() => null)
          : Promise.resolve(null),
        apiFetch<any>('/admin/reports').catch(() => null),
      ]);
      setMembers(membersResult.members);
      setMembersTotal(membersResult.total);
      setAuditLogs(logsData);
      setGoogleIntegrationStatus(integrationData);
      if (reportsData) setServerReports(reportsData);
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

      if (!selectedAgendaMemberId && membersResult.members.length > 0) {
        setSelectedAgendaMemberId(membersResult.members[0].id);
      }
    } catch (err: any) {
      setDataLoadError(err?.message || 'No se pudo cargar los datos del panel.');
    } finally {
      setIsLoadingData(false);
    }
  };

  useEffect(() => {
    if (isAuthenticated && hasAccess) {
      loadData();
    }
  }, [isAuthenticated, hasAccess, user?.id, user?.role]);

  // Server-side search: debounce 400 ms, fires when search > 1 char
  useEffect(() => {
    if (!searchTerm || searchTerm.length < 2) {
      setServerSearchResults(null);
      setTablePage(1);
      return;
    }
    const timer = setTimeout(async () => {
      setIsSearchingServer(true);
      try {
        const result = await memberService.getAll({ search: searchTerm, limit: 100 });
        setServerSearchResults(result.members);
      } catch { setServerSearchResults(null); }
      finally { setIsSearchingServer(false); }
    }, 400);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  useEffect(() => { setTablePage(1); }, [statusFilter, searchTerm]);

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
      const [sessionsResp, appointmentsResp, paymentsResp] = await Promise.all([
        apiFetch<any>(`/v1/sessions/admin?userId=${encodeURIComponent(member.id)}`).catch(() => null),
        apiFetch<any>(`/v1/appointments?userId=${encodeURIComponent(member.id)}`).catch(() => null),
        apiFetch<any>(`/v1/payments?userId=${encodeURIComponent(member.id)}`).catch(() => null),
      ]);
      // All three endpoints may return paginated objects — extract arrays defensively
      const sessionsData: any[] = Array.isArray(sessionsResp) ? sessionsResp : (sessionsResp?.sessions ?? sessionsResp?.data ?? []);
      const appointmentsData: any[] = Array.isArray(appointmentsResp) ? appointmentsResp : (appointmentsResp?.appointments ?? appointmentsResp?.data ?? []);
      const paymentsData: any[] = Array.isArray(paymentsResp) ? paymentsResp : (paymentsResp?.payments ?? paymentsResp?.data ?? []);
      setMemberSessions(sessionsData);
      setMemberAppointments(appointmentsData);
      setMemberPayments(paymentsData);
    } catch {
      setMemberSessions([]);
      setMemberAppointments([]);
      setMemberPayments([]);
    } finally {
      setIsLoadingMemberHistory(false);
    }
  };

  const handleOpenMemberDrawer = (member: Member) => {
    setSelectedMember(member);
    setDrawerDeleteStep('idle');
    setDrawerDeleteOtp('');
    setDrawerDeleteMsg('');
    setMemberSessions([]);
    setMemberAppointments([]);
    setMemberPayments([]);
    void loadMemberHistory(member);
  };

  const handleDrawerDeactivate = async (memberId: string) => {
    setDrawerDeactivating(true);
    try {
      const out = await apiFetch<any>(`/v1/admin/access/users/${memberId}/deactivate`, { method: 'PATCH' });
      toast.success(out?.message ?? 'Usuario desactivado y suscripción cancelada');
      setSelectedMember(null);
      await loadData();
    } catch (e: any) {
      toast.error(e?.message ?? 'No se pudo desactivar el usuario');
    } finally {
      setDrawerDeactivating(false);
    }
  };

  const handleDrawerRequestOtp = async (memberId: string) => {
    setDrawerDeleteSending(true);
    setDrawerDeleteMsg('');
    try {
      const out = await apiFetch<any>(`/v1/admin/access/users/${memberId}/request-delete-otp`, { method: 'POST' });
      setDrawerDeleteStep('otp-confirm');
      setDrawerDeleteMsg(out?.message ?? 'Código enviado');
      setTimeout(() => drawerOtpRef.current?.focus(), 100);
    } catch (e: any) {
      setDrawerDeleteMsg(e?.message ?? 'No se pudo enviar el código OTP');
    } finally {
      setDrawerDeleteSending(false);
    }
  };

  const handleDrawerConfirmDelete = async (memberId: string, memberEmail: string) => {
    if (!drawerDeleteOtp.trim()) return;
    setDrawerDeleting(true);
    setDrawerDeleteMsg('');
    try {
      const out = await apiFetch<any>(`/v1/admin/access/users/${memberId}`, {
        method: 'DELETE',
        body: JSON.stringify({ otp: drawerDeleteOtp.trim() }),
      });
      toast.success(out?.message ?? `${memberEmail} eliminado`);
      setSelectedMember(null);
      setCriticalActionsOpen(false);
      setDrawerDeleteStep('idle');
      setDrawerDeleteOtp('');
      await loadData();
    } catch (e: any) {
      setDrawerDeleteMsg(e?.message ?? 'Código incorrecto o expirado');
    } finally {
      setDrawerDeleting(false);
    }
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
      setIntakeToApprove(null);
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
    const base = serverSearchResults !== null ? serverSearchResults : members;
    return base.filter((member) => {
      const matchesSearch = serverSearchResults !== null
        ? true
        : (!term || member.name.toLowerCase().includes(term) || member.email.toLowerCase().includes(term));
      const matchesStatus =
        statusFilter === 'all'
          ? true
          : statusFilter === 'active'
            ? member.subscriptionStatus === 'active'
            : member.subscriptionStatus !== 'active';
      return matchesSearch && matchesStatus;
    });
  }, [members, serverSearchResults, searchTerm, statusFilter]);

  const TABLE_PAGE_SIZE = 50;
  const displayedMembers = useMemo(
    () => filteredMembers.slice((tablePage - 1) * TABLE_PAGE_SIZE, tablePage * TABLE_PAGE_SIZE),
    [filteredMembers, tablePage]
  );
  const tablePageCount = Math.ceil(filteredMembers.length / TABLE_PAGE_SIZE);

  const filteredAuditLogs = useMemo(
    () => auditStatusFilter === 'all' ? auditLogs : auditLogs.filter((l) => l.status === auditStatusFilter),
    [auditLogs, auditStatusFilter]
  );

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

  // ── Acciones masivas de agenda — aplica Y guarda en una sola operación ──
  const applyWeekBulk = async () => {
    const ref = new Date(agendaDate + 'T12:00:00');
    const dow = ref.getDay();
    const offsetToMonday = (dow === 0 ? -6 : 1 - dow);
    const monday = plusDays(ref, offsetToMonday);

    let targetDays: number[];
    if (weekBulkScope === 'week') targetDays = [1,2,3,4,5,6,0];
    else if (weekBulkScope === 'workdays') targetDays = [1,2,3,4,5];
    else if (weekBulkScope === 'weekend') targetDays = [6,0];
    else targetDays = weekBulkSelectedDays;

    const note = weekBulkNote.trim() ||
      (weekBulkAction === 'open' ? `Abierto ${weekBulkStart}:00–${weekBulkEnd}:00` :
       weekBulkAction === 'close' ? 'Cerrado' : 'Horario base');

    // Calcular nuevas reglas directamente (sin depender del estado stale)
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
          note
        });
      }
    }
    const newSpecialRules = [...byDate.values()].sort((a, b) => a.dateKey.localeCompare(b.dateKey));
    setAgendaSpecialDateRulesDraft(newSpecialRules);

    // Guardar inmediatamente con las reglas recién calculadas
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
        cabins: agendaCabinsDraft.map((c, i) => ({
          id: c.id.startsWith('draft-') ? undefined : c.id,
          name: c.name, isActive: c.isActive, sortOrder: c.sortOrder ?? i + 1
        })),
        treatments: agendaTreatmentsDraft.map((t, i) => ({
          id: t.id.startsWith('draft-treatment-') ? undefined : t.id,
          name: t.name.trim(), code: t.code.trim().toLowerCase(),
          description: t.description ?? null,
          durationMinutes: t.durationMinutes,
          prepBufferMinutes: t.prepBufferMinutes ?? 0,
          cleanupBufferMinutes: t.cleanupBufferMinutes ?? 0,
          cabinId: (t.allowedCabinIds ?? [])[0] ?? t.cabinId ?? null,
          allowedCabinIds: t.allowedCabinIds ?? [],
          requiresSpecificCabin: t.requiresSpecificCabin,
          isActive: t.isActive, sortOrder: t.sortOrder ?? i + 1
        })),
        weeklyRules: agendaWeeklyRulesDraft.map((r) => ({
          dayOfWeek: r.dayOfWeek, isOpen: r.isOpen, startHour: r.startHour, endHour: r.endHour
        })),
        specialDateRules: newSpecialRules.map((r) => ({
          dateKey: r.dateKey, isOpen: r.isOpen,
          startHour: r.startHour ?? null, endHour: r.endHour ?? null, note: r.note ?? null
        }))
      };
      const updatedConfig = await clinicalService.updateAdminAgendaConfig(payload);
      setAgendaConfig(updatedConfig);
      setAgendaWeeklyRulesDraft(updatedConfig.weeklyRules);
      setAgendaSpecialDateRulesDraft(updatedConfig.specialDateRules);
      const snapshot = await clinicalService.getAdminAgendaDay(agendaDate);
      setAgendaSnapshot(snapshot);

      const scopeLabel = weekBulkScope === 'week' ? 'toda la semana' : weekBulkScope === 'workdays' ? 'Lun–Vie' : weekBulkScope === 'weekend' ? 'Sáb–Dom' : `${targetDays.length} días`;
      const actionLabel = weekBulkAction === 'open' ? `abierto ${weekBulkStart}:00–${weekBulkEnd}:00` : weekBulkAction === 'close' ? 'cerrado' : 'horario base restaurado';
      setAgendaMessage({ type: 'ok', text: `✓ Guardado: ${scopeLabel} → ${actionLabel}` });
    } catch (error: any) {
      setAgendaMessage({ type: 'error', text: error?.message ?? 'No fue posible guardar la configuración.' });
    } finally {
      setIsAgendaConfigSaving(false);
    }
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
            <button onClick={() => setSessionModalMember(null)} aria-label="Cerrar registro clínico" className="text-velum-400 hover:text-velum-900 p-1 rounded-xl hover:bg-velum-50 transition"><X size={20} /></button>
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

  // renderPanel → AdminPanelSection
  // renderSocios → AdminSociasSection

  // renderExpedientes → AdminExpedientesSection

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
              aria-label="Día anterior" className="p-2.5 hover:bg-velum-50 text-velum-600 transition"><ChevronLeft size={16} /></button>
            <span className="px-3 py-2 text-sm font-medium text-velum-900 min-w-[140px] text-center">
              {new Date(agendaDate + 'T12:00:00').toLocaleDateString('es-MX', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })}
            </span>
            <button onClick={() => setAgendaDate(toLocalDateKey(plusDays(new Date(agendaDate + 'T12:00:00'), 1)))}
              aria-label="Día siguiente" className="p-2.5 hover:bg-velum-50 text-velum-600 transition"><ChevronRight size={16} /></button>
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

        {/* Gestión masiva de agenda */}
        {(() => {
          const ref = new Date(agendaDate + 'T12:00:00');
          const dow = ref.getDay();
          const offsetToMonday = (dow === 0 ? -6 : 1 - dow);
          const monday = plusDays(ref, offsetToMonday);
          const sunday = plusDays(monday, 6);
          const fmtShort = (d: Date) => d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short' });
          const DAY_LABELS = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
          const DAY_ORDER  = [1,2,3,4,5,6,0];

          const toggleCustomDay = (d: number) =>
            setWeekBulkSelectedDays((prev) => prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]);

          const applyPreset = (preset: typeof weekBulkPreset) => {
            setWeekBulkPreset(preset);
            if (preset === 'morning')   { setWeekBulkStart(8);  setWeekBulkEnd(14); }
            if (preset === 'afternoon') { setWeekBulkStart(14); setWeekBulkEnd(20); }
            if (preset === 'full')      { setWeekBulkStart(8);  setWeekBulkEnd(20); }
          };

          return (
            <div className="bg-white rounded-2xl border border-velum-100 overflow-hidden">
              <div className="px-5 py-4 border-b border-velum-100 flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold uppercase tracking-widest text-velum-500">Gestión masiva de agenda</p>
                  <p className="text-[11px] text-velum-400 mt-0.5">Semana {fmtShort(monday)} — {fmtShort(sunday)}</p>
                </div>
              </div>
              <div className="p-5 space-y-5">

                {/* Acción */}
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-velum-400 mb-2">1. Acción</p>
                  <div className="grid grid-cols-3 gap-2">
                    {([
                      { id: 'open',  label: '✓ Abrir',           cls: weekBulkAction === 'open'  ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100' },
                      { id: 'close', label: '✕ Cerrar',          cls: weekBulkAction === 'close' ? 'bg-red-600 text-white border-red-600'         : 'bg-red-50 text-red-700 border-red-200 hover:bg-red-100' },
                      { id: 'clear', label: '↺ Restaurar base',  cls: weekBulkAction === 'clear' ? 'bg-velum-900 text-white border-velum-900'     : 'bg-velum-50 text-velum-700 border-velum-200 hover:bg-velum-100' },
                    ] as const).map(({ id, label, cls }) => (
                      <button key={id} onClick={() => setWeekBulkAction(id)}
                        className={`py-2.5 rounded-xl border text-xs font-semibold transition ${cls}`}>
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Horario — solo si Abrir */}
                {weekBulkAction === 'open' && (
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-velum-400 mb-2">2. Horario</p>
                    <div className="flex flex-wrap gap-2 mb-3">
                      {([
                        { id: 'morning',   label: 'Mañana 8–14' },
                        { id: 'afternoon', label: 'Tarde 14–20' },
                        { id: 'full',      label: 'Completo 8–20' },
                        { id: 'custom',    label: 'Personalizado' },
                      ] as const).map(({ id, label }) => (
                        <button key={id} onClick={() => applyPreset(id)}
                          className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition ${weekBulkPreset === id ? 'bg-velum-900 text-white border-velum-900' : 'bg-velum-50 text-velum-600 border-velum-200 hover:bg-velum-100'}`}>
                          {label}
                        </button>
                      ))}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-velum-500">De</span>
                      <input type="number" min="0" max="23" value={weekBulkStart}
                        onChange={(e) => { setWeekBulkPreset('custom'); setWeekBulkStart(Number(e.target.value)); }}
                        className="w-16 rounded-lg border border-velum-200 px-2 py-1.5 text-sm text-center focus:outline-none focus:border-velum-900 transition" />
                      <span className="text-xs text-velum-400">hrs a</span>
                      <input type="number" min="1" max="24" value={weekBulkEnd}
                        onChange={(e) => { setWeekBulkPreset('custom'); setWeekBulkEnd(Number(e.target.value)); }}
                        className="w-16 rounded-lg border border-velum-200 px-2 py-1.5 text-sm text-center focus:outline-none focus:border-velum-900 transition" />
                      <span className="text-xs text-velum-400">hrs</span>
                    </div>
                  </div>
                )}

                {/* Días */}
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-velum-400 mb-2">{weekBulkAction === 'open' ? '3' : '2'}. Días a afectar</p>
                  <div className="flex flex-wrap gap-2 mb-3">
                    {([
                      { id: 'week',     label: 'Toda la semana' },
                      { id: 'workdays', label: 'Lun – Vie' },
                      { id: 'weekend',  label: 'Sáb – Dom' },
                      { id: 'custom',   label: 'Personalizado' },
                    ] as const).map(({ id, label }) => (
                      <button key={id} onClick={() => setWeekBulkScope(id)}
                        className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition ${weekBulkScope === id ? 'bg-velum-900 text-white border-velum-900' : 'bg-velum-50 text-velum-600 border-velum-200 hover:bg-velum-100'}`}>
                        {label}
                      </button>
                    ))}
                  </div>
                  {weekBulkScope === 'custom' && (
                    <div className="flex gap-2 flex-wrap">
                      {DAY_ORDER.map((d) => (
                        <button key={d} onClick={() => toggleCustomDay(d)}
                          className={`w-10 h-10 rounded-xl border text-xs font-semibold transition ${weekBulkSelectedDays.includes(d) ? 'bg-velum-900 text-white border-velum-900' : 'bg-velum-50 text-velum-500 border-velum-200 hover:bg-velum-100'}`}>
                          {DAY_LABELS[d]}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Nota */}
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-velum-400 mb-2">{weekBulkAction === 'open' ? '4' : '3'}. Nota (opcional)</p>
                  <input
                    type="text"
                    value={weekBulkNote}
                    onChange={(e) => setWeekBulkNote(e.target.value)}
                    placeholder="Ej: Semana de capacitación, Vacaciones, Temporada alta..."
                    className="w-full rounded-xl border border-velum-200 px-3 py-2.5 text-sm focus:outline-none focus:border-velum-900 transition"
                  />
                </div>

                {/* Apply + Save */}
                <button onClick={applyWeekBulk} disabled={isAgendaConfigSaving}
                  className={`w-full py-3 rounded-xl text-sm font-semibold transition disabled:opacity-50 ${
                    weekBulkAction === 'open'  ? 'bg-emerald-600 text-white hover:bg-emerald-700' :
                    weekBulkAction === 'close' ? 'bg-red-600 text-white hover:bg-red-700' :
                    'bg-velum-900 text-white hover:bg-velum-800'
                  }`}>
                  {isAgendaConfigSaving ? 'Guardando...' :
                   weekBulkAction === 'open'  ? `Aplicar y guardar — Abrir ${weekBulkStart}:00–${weekBulkEnd}:00` :
                   weekBulkAction === 'close' ? 'Aplicar y guardar — Cerrar días' :
                   'Aplicar y guardar — Restaurar horario base'}
                </button>
              </div>
            </div>
          );
        })()}

        {/* Save week config shortcut */}
        <button
          onClick={saveAgendaConfiguration}
          disabled={isAgendaConfigSaving}
          className="w-full bg-velum-900 text-white rounded-xl py-3 text-sm font-medium hover:bg-velum-800 transition disabled:opacity-50"
        >
          {isAgendaConfigSaving ? 'Guardando...' : 'Guardar configuración de agenda'}
        </button>
      </div>
    );
  };

  // ─── Section: Pagos ───────────────────────────────────────────────────────

  const handleDownloadHistCSV = async () => {
    try {
      const params = new URLSearchParams();
      if (histDateFrom) params.set('dateFrom', histDateFrom);
      if (histDateTo) params.set('dateTo', histDateTo);
      if (histStatus) params.set('status', histStatus);
      const resp = await fetch(`/api/v1/payments/export?${params.toString()}`, { credentials: 'include' });
      if (!resp.ok) throw new Error('Error al exportar');
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `pagos-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error('No se pudo descargar el CSV');
    }
  };

  // renderPagos → AdminPagosSection

  // renderRiesgos y renderCumplimiento → AdminRiesgosSection / AdminCumplimientoSection

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

          {/* Integration Jobs Monitor */}
          <div className="bg-white rounded-2xl border border-velum-100 p-5 space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold uppercase tracking-widest text-velum-500">Monitor de trabajos — Google Calendar</p>
              <div className="flex items-center gap-2">
                <select value={integrationJobsStatus} onChange={e => { setIntegrationJobsStatus(e.target.value); void loadIntegrationJobs(e.target.value || undefined); }}
                  className="rounded-xl border border-velum-200 px-2 py-1 text-xs text-velum-700 focus:outline-none focus:border-velum-400 bg-white">
                  <option value="">Todos</option>
                  <option value="pending">Pendientes</option>
                  <option value="running">Corriendo</option>
                  <option value="done">Completados</option>
                  <option value="failed">Fallidos</option>
                </select>
                <button onClick={() => void loadIntegrationJobs(integrationJobsStatus || undefined)} disabled={integrationJobsLoading}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-xl border border-velum-200 text-velum-600 text-xs font-medium hover:bg-velum-50 transition disabled:opacity-50">
                  {integrationJobsLoading ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                  Actualizar
                </button>
              </div>
            </div>
            {integrationJobsError && (
              <div className="flex items-center gap-2 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs">
                <AlertTriangle size={13} /> {integrationJobsError}
              </div>
            )}
            {!integrationJobsLoaded && !integrationJobsError ? (
              <p className="text-center text-xs text-velum-400 py-6">Presiona Actualizar para cargar los trabajos</p>
            ) : !integrationJobsError && integrationJobs.length === 0 ? (
              <p className="text-center text-xs text-velum-400 py-6">Sin trabajos en la cola</p>
            ) : !integrationJobsError && (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-velum-100 bg-velum-50/50">
                      {['Tipo', 'Estado', 'Intentos', 'Programado', 'Finalizado', 'Último error'].map(h => (
                        <th key={h} className="px-3 py-2.5 text-left text-[10px] font-bold uppercase tracking-widest text-velum-400">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {integrationJobs.map((job: any, i: number) => (
                      <tr key={job.id} className={`hover:bg-velum-50 transition ${i < integrationJobs.length - 1 ? 'border-b border-velum-50' : ''}`}>
                        <td className="px-3 py-2.5 font-mono text-velum-700">{job.type}</td>
                        <td className="px-3 py-2.5">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            job.status === 'done' ? 'bg-emerald-50 text-emerald-700' :
                            job.status === 'failed' ? 'bg-red-50 text-red-600' :
                            job.status === 'running' ? 'bg-blue-50 text-blue-600' :
                            'bg-amber-50 text-amber-700'
                          }`}>{job.status}</span>
                        </td>
                        <td className="px-3 py-2.5 text-velum-500">{job.attempts}/{job.maxAttempts}</td>
                        <td className="px-3 py-2.5 text-velum-400 whitespace-nowrap">{new Date(job.runAt).toLocaleString('es-MX', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' })}</td>
                        <td className="px-3 py-2.5 text-velum-400 whitespace-nowrap">{job.finishedAt ? new Date(job.finishedAt).toLocaleString('es-MX', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' }) : '—'}</td>
                        <td className="px-3 py-2.5 text-red-500 font-mono max-w-[200px] truncate" title={job.lastError ?? ''}>{job.lastError ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="text-[11px] text-velum-400 text-right mt-2 pr-1">{integrationJobs.length} trabajo{integrationJobs.length !== 1 ? 's' : ''}</p>
              </div>
            )}
          </div>
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
          {/* Audit filter */}
          <div className="flex gap-2">
            {(['all', 'success', 'failed'] as const).map((f) => (
              <button key={f} onClick={() => setAuditStatusFilter(f)}
                className={`px-3 py-1.5 rounded-xl text-xs font-medium transition ${auditStatusFilter === f ? 'bg-velum-900 text-white' : 'bg-white border border-velum-200 text-velum-600 hover:bg-velum-50'}`}>
                {f === 'all' ? 'Todos' : f === 'success' ? 'Exitosos' : 'Fallidos'}
              </button>
            ))}
            {auditStatusFilter !== 'all' && (
              <span className="ml-2 text-xs text-velum-400 self-center">{filteredAuditLogs.length} registros</span>
            )}
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
            {filteredAuditLogs.length === 0 ? (
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
                    {filteredAuditLogs.map((log, i) => (
                      <tr key={log.id ?? i} className={`${i < filteredAuditLogs.length - 1 ? 'border-b border-velum-50' : ''} hover:bg-velum-50/50 transition`}>
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

          {/* Webhook Events */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-bold uppercase tracking-widest text-velum-400">Eventos Stripe procesados</p>
              <button onClick={() => void loadWebhookEvents()} disabled={webhookEventsLoading}
                className="flex items-center gap-1.5 text-xs text-velum-400 hover:text-velum-900 transition disabled:opacity-50">
                <RefreshCw size={12} className={webhookEventsLoading ? 'animate-spin' : ''} />Cargar
              </button>
            </div>
            {webhookEventsError && (
              <div className="flex items-center gap-2 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs">
                <AlertTriangle size={13} /> {webhookEventsError}
              </div>
            )}
            {!webhookEventsLoaded && !webhookEventsError ? (
              <div className="bg-white rounded-2xl border border-velum-100 py-10 text-center">
                <p className="text-xs text-velum-400">Presiona "Cargar" para ver los webhooks procesados</p>
              </div>
            ) : !webhookEventsError && webhookEvents.length === 0 ? (
              <div className="bg-white rounded-2xl border border-velum-100 py-10 text-center">
                <p className="text-xs text-velum-400">Sin eventos registrados aún</p>
              </div>
            ) : (
              <div className="bg-white rounded-2xl border border-velum-100 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-velum-100 bg-velum-50/50">
                        {['Fecha', 'Evento Stripe', 'Tipo', 'Procesado en'].map(h => (
                          <th key={h} className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-velum-400">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {webhookEvents.map((ev: any, i: number) => (
                        <tr key={ev.id} className={`hover:bg-velum-50/50 transition ${i < webhookEvents.length - 1 ? 'border-b border-velum-50' : ''}`}>
                          <td className="px-4 py-2.5 text-velum-400 whitespace-nowrap">{new Date(ev.createdAt).toLocaleString('es-MX', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' })}</td>
                          <td className="px-4 py-2.5 font-mono text-velum-600 text-[10px]">{ev.stripeEventId}</td>
                          <td className="px-4 py-2.5 font-mono text-velum-700">{ev.type}</td>
                          <td className="px-4 py-2.5 text-velum-400 whitespace-nowrap">{new Date(ev.processedAt).toLocaleString('es-MX', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' })}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p className="text-[11px] text-velum-400 text-right mt-2 pr-3 pb-2">{webhookEvents.length} evento{webhookEvents.length !== 1 ? 's' : ''}</p>
                </div>
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
      case 'panel':        return (
        <SectionErrorBoundary section="Panel">
          <AdminPanelSection
            userName={user?.name || user?.email?.split('@')[0] || 'Admin'}
            analytics={analytics}
            agendaSummary={agendaSummary}
            controlAlerts={controlAlerts}
            dayAppointments={dayAppointments}
            memberById={memberById}
            auditLogs={auditLogs}
            onNavigate={(section) => setActiveSection(section)}
            onNavigateToAudit={() => { setActiveSection('ajustes'); setSettingsCategory('auditoria'); }}
          />
        </SectionErrorBoundary>
      );
      case 'socias':       return (
        <SectionErrorBoundary section="Socias">
          <AdminSociasSection
            members={members}
            displayedMembers={displayedMembers}
            filteredMembers={filteredMembers}
            membersTotal={membersTotal}
            tablePage={tablePage}
            tablePageCount={tablePageCount}
            tablePageSize={TABLE_PAGE_SIZE}
            searchTerm={searchTerm}
            statusFilter={statusFilter}
            isSearchingServer={isSearchingServer}
            onSearch={(term) => setSearchTerm(term)}
            onFilter={(f) => setStatusFilter(f)}
            onPageChange={(p) => setTablePage(p)}
            onOpenMember={handleOpenMemberDrawer}
            onNewPatient={() => setPatientDrawerOpen(true)}
          />
        </SectionErrorBoundary>
      );
      case 'agenda':       return renderAgenda();
      case 'expedientes':  return (
        <SectionErrorBoundary section="Expedientes">
          <AdminExpedientesSection
            members={members}
            intakeToReject={intakeToReject}
            intakeRejectReason={intakeRejectReason}
            isApprovingIntake={isApprovingIntake}
            onOpenIntake={openIntakeModal}
            onApprove={handleApproveIntake}
            onOpenMember={handleOpenMemberDrawer}
            onSetReject={setIntakeToReject}
            onSetRejectReason={setIntakeRejectReason}
          />
        </SectionErrorBoundary>
      );
      case 'pagos':        return (
        <SectionErrorBoundary section="Pagos">
          <AdminPagosSection
            analytics={analytics}
            serverReports={serverReports}
            histPayments={histPayments}
            histTotal={histTotal}
            histPage={histPage}
            histPages={histPages}
            histLoading={histLoading}
            histLoaded={histLoaded}
            histError={histError}
            histDateFrom={histDateFrom}
            histDateTo={histDateTo}
            histStatus={histStatus}
            onDateFromChange={setHistDateFrom}
            onDateToChange={setHistDateTo}
            onStatusChange={setHistStatus}
            onSearch={(page) => void loadHistPayments(page)}
            onDownloadCSV={() => void handleDownloadHistCSV()}
            onOpenMember={handleOpenMemberDrawer}
            onRegularize={(id, status) => handleUpdateMember(id, status)}
          />
        </SectionErrorBoundary>
      );
      case 'kpis':         return (
        <SectionErrorBoundary section="KPIs">
          <AdminKPIsSection analytics={analytics} planBreakdown={planBreakdown} />
        </SectionErrorBoundary>
      );
      case 'finanzas':     return (
        <SectionErrorBoundary section="Finanzas">
          <AdminFinanzasSection members={members} analytics={analytics} onOpenMember={handleOpenMemberDrawer} />
        </SectionErrorBoundary>
      );
      case 'riesgos':      return (
        <SectionErrorBoundary section="Riesgos">
          <AdminRiesgosSection
            members={members}
            failedAudits={analytics.failedAudits}
            onOpenMember={handleOpenMemberDrawer}
          />
        </SectionErrorBoundary>
      );
      case 'cumplimiento': return (
        <SectionErrorBoundary section="Cumplimiento">
          <AdminCumplimientoSection
            expedientesFirmados={analytics.expedientesFirmados}
            failedAudits={analytics.failedAudits}
            sensitiveEvents={analytics.sensitiveEvents}
            staffCount={members.filter((m) => m.role !== 'member').length + 1}
            onRefresh={() => void loadData()}
          />
        </SectionErrorBoundary>
      );
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
            <button type="submit" disabled={isActionLoading}
              className="w-full bg-velum-900 text-white rounded-xl py-3 text-sm font-medium hover:bg-velum-800 transition disabled:opacity-50">
              {isActionLoading ? 'Accediendo...' : 'Acceder al panel'}
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

  // SidebarContent ahora es AdminSidebarContent (definido fuera del componente)
  // para evitar que React lo trate como tipo nuevo en cada render.

  return (
    <div className="min-h-screen bg-velum-50 flex">

      {/* ── Sidebar desktop (always visible ≥ md) ── */}
      <aside
        style={{ width: sidebarPx }}
        className="hidden md:flex flex-col fixed left-0 top-0 h-screen bg-velum-900 z-30 transition-[width] duration-200 overflow-hidden"
      >
        <AdminSidebarContent
          isSidebarCollapsed={isSidebarCollapsed}
          activeSection={activeSection}
          members={members}
          user={user}
          onSectionChange={(section) => { setActiveSection(section); setSidebarOpen(false); }}
          onToggleCollapse={() => setIsSidebarCollapsed((v) => !v)}
          onLogout={logout}
        />
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
        <AdminSidebarContent
          isSidebarCollapsed={isSidebarCollapsed}
          activeSection={activeSection}
          members={members}
          user={user}
          onSectionChange={(section) => { setActiveSection(section); setSidebarOpen(false); }}
          onToggleCollapse={() => setIsSidebarCollapsed((v) => !v)}
          onLogout={logout}
        />
      </aside>

      {/* ── Main area ── */}
      <div
        className="flex-1 flex flex-col min-h-screen transition-all duration-200"
        style={{ marginLeft: isDesktop ? sidebarPx : 0 }}
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
            <AdminErrorBoundary>
              {renderSection()}
            </AdminErrorBoundary>
          </div>
        </main>
      </div>

      {/* Modals */}
      {renderSessionModal()}
      {selectedMember && (
        <SectionErrorBoundary section="Perfil">
        <AdminMemberDrawer
          member={selectedMember}
          onClose={() => { setSelectedMember(null); setIntakeToApprove(null); }}
          intakeToApprove={intakeToApprove}
          intakeToReject={intakeToReject}
          intakeRejectReason={intakeRejectReason}
          isApprovingIntake={isApprovingIntake}
          onSetIntakeToApprove={setIntakeToApprove}
          onSetIntakeToReject={setIntakeToReject}
          onSetIntakeRejectReason={setIntakeRejectReason}
          onApproveIntake={handleApproveIntake}
          criticalActionsOpen={criticalActionsOpen}
          onSetCriticalActionsOpen={setCriticalActionsOpen}
          onCloseCriticalActions={closeCriticalActions}
          drawerDeactivating={drawerDeactivating}
          drawerDeleteStep={drawerDeleteStep}
          drawerDeleteOtp={drawerDeleteOtp}
          drawerDeleteMsg={drawerDeleteMsg}
          drawerDeleteSending={drawerDeleteSending}
          drawerDeleting={drawerDeleting}
          drawerOtpRef={drawerOtpRef}
          onSetDrawerDeleteStep={setDrawerDeleteStep}
          onSetDrawerDeleteOtp={setDrawerDeleteOtp}
          onSetDrawerDeleteMsg={setDrawerDeleteMsg}
          onDrawerDeactivate={handleDrawerDeactivate}
          onRequestOtp={handleDrawerRequestOtp}
          onConfirmDelete={handleDrawerConfirmDelete}
          onOpenSessionModal={(m) => { openSessionModal(m); setSelectedMember(null); }}
          onOpenIntakeModal={(m) => { void openIntakeModal(m); setSelectedMember(null); }}
          onUpdateMember={handleUpdateMember}
          isLoadingMemberHistory={isLoadingMemberHistory}
          memberAppointments={memberAppointments}
          memberPayments={memberPayments}
          memberSessions={memberSessions}
        />
        </SectionErrorBoundary>
      )}
      <AdminIntakeModal
        intakeModal={intakeModal}
        intakeModalLoading={intakeModalLoading}
        intakeToReject={intakeToReject}
        intakeRejectReason={intakeRejectReason}
        isApprovingIntake={isApprovingIntake}
        onClose={() => setIntakeModal(null)}
        onSetReject={setIntakeToReject}
        onSetRejectReason={setIntakeRejectReason}
        onApprove={handleApproveIntake}
      />

      <AdminCreatePatientDrawer
        open={patientDrawerOpen}
        onClose={() => setPatientDrawerOpen(false)}
        onCreated={() => { setPatientDrawerOpen(false); void loadData(); }}
        actorEmail={user?.email}
      />

      {/* Cancel membership confirmation dialog */}
      {confirmCancelMemberId && (() => {
        const m = members.find((x) => x.id === confirmCancelMemberId);
        return (
          <>
            <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50" onClick={() => setConfirmCancelMemberId(null)} />
            <div
              className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none"
              role="dialog"
              aria-modal="true"
              aria-labelledby="cancel-membership-title"
            >
              <div className="pointer-events-auto w-full max-w-sm bg-white rounded-3xl shadow-2xl p-6 space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-red-50 border border-red-200 flex items-center justify-center shrink-0">
                    <XCircle size={18} className="text-red-500" />
                  </div>
                  <div>
                    <p id="cancel-membership-title" className="font-semibold text-velum-900 text-sm">Cancelar membresía</p>
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
