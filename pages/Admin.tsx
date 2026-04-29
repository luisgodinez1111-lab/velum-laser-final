import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { PasswordInput } from '../components/PasswordInput';
import { VelumLogo } from '../components/VelumLogo';
import { AgendaIntegrations } from './settings/AgendaIntegrations';
import {
  CalendarDays,
  Menu,
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
  CheckCheck,
  XCircle,
  Plus,
  Download,
  BarChart3,
  Loader2,
  LogOut,
  User as UserIcon,
} from 'lucide-react';
import { AuditLogEntry, Member, UserRole } from '../types';
import { AdminSection, HealthFlag, AgendaPolicyDraft, AgendaTemplatePreset, SettingsCategory, ControlAlert } from './admin/adminTypes';
import { AdminSidebarContent, riskOfMember, sectionMeta, weekDayLabel, allowedRoles, NAV_SECTIONS } from './admin/AdminSidebar';
import { AdminErrorBoundary } from '../components/AdminErrorBoundary';
import { DensityProvider } from '../context/DensityContext';
import {
  DensityToggle,
  CommandPaletteProvider,
  CommandPalette,
  useCommandPalette,
  type CommandItem,
} from '../components/ui';
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
import { TotpRequiredError } from "../services/authService";
import { AdminMemberDrawer } from "../components/AdminMemberDrawer";
import { AdminIntakeModal } from "../components/AdminIntakeModal";
import { TotpSetup } from "../components/TotpSetup";
import { SectionErrorBoundary } from "../components/SectionErrorBoundary";
import { ExportButton } from "../components/ExportButton";
import { SessionModal, SessionForm } from "../components/admin/SessionModal";
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
import { parseMxDate, toLocalDateKey, plusDays, weekDayForDateKey } from '../utils/date';
import { usePaymentHistory, HIST_LIMIT } from './admin/hooks/usePaymentHistory';
import { useIntegrationJobs } from './admin/hooks/useIntegrationJobs';
import { useAdminData } from './admin/hooks/useAdminData';
import { useAgendaConfig } from './admin/hooks/useAgendaConfig';

// ─── CmdKButton ──────────────────────────────────────────────────────────────
// Trigger del CommandPalette en la top bar. Definido fuera de Admin para
// evitar que React lo trate como tipo nuevo en cada render. Usa el hook —
// requiere estar dentro de <CommandPaletteProvider>.
const CmdKButton: React.FC = () => {
  const { open } = useCommandPalette();
  // Detecta plataforma sólo para mostrar el kbd correcto.
  const isMac =
    typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
  const shortcut = isMac ? '⌘K' : 'Ctrl+K';
  return (
    <button
      type="button"
      onClick={open}
      aria-label={`Buscar (${shortcut})`}
      className="hidden md:inline-flex items-center gap-2 px-2.5 py-1.5 rounded-lg border border-velum-200 bg-velum-50/60 text-velum-500 text-xs hover:bg-velum-100 hover:text-velum-700 transition-colors duration-base ease-standard focus:outline-none focus-visible:shadow-focus"
    >
      <Search size={13} aria-hidden="true" />
      <span>Buscar</span>
      <kbd className="ml-2 px-1.5 py-0.5 text-[10px] font-mono font-semibold tracking-wide text-velum-500 bg-white border border-velum-200 rounded">
        {shortcut}
      </kbd>
    </button>
  );
};

// Versión mobile (icono solo) — el desktop muestra el botón completo.
const CmdKButtonMobile: React.FC = () => {
  const { open } = useCommandPalette();
  return (
    <button
      type="button"
      onClick={open}
      aria-label="Buscar"
      className="md:hidden p-2 rounded-xl text-velum-400 hover:text-velum-700 hover:bg-velum-50 transition"
    >
      <Search size={18} />
    </button>
  );
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
  const [loginRequiresTotp, setLoginRequiresTotp] = useState(false);
  const [loginTotpCode, setLoginTotpCode] = useState('');

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [activeSection, setActiveSection] = useState<AdminSection>('panel');
  const [settingsCategory, setSettingsCategory] = useState<SettingsCategory>('agenda');
  const [totpEnabled, setTotpEnabled] = useState(false);
  const [totpStatusLoaded, setTotpStatusLoaded] = useState(false);

  // ── Hooks de datos ────────────────────────────────────────────────────────
  const {
    members, setMembers, membersTotal, auditLogs, serverReports,
    isLoadingData, dataLoadError, loadData,
  } = useAdminData();

  const {
    histPayments, histLoading, histLoaded, histError,
    histDateFrom, setHistDateFrom, histDateTo, setHistDateTo,
    histStatus, setHistStatus, histPage, histTotal, histPages,
    loadHistPayments, handleDownloadHistCSV,
  } = usePaymentHistory();

  const {
    integrationJobs, integrationJobsLoading, integrationJobsLoaded,
    integrationJobsStatus, setIntegrationJobsStatus, integrationJobsError,
    webhookEvents, webhookEventsLoading, webhookEventsLoaded, webhookEventsError,
    loadIntegrationJobs, loadWebhookEvents,
  } = useIntegrationJobs();

  const agenda = useAgendaConfig(members);
  // Aliases planos para compatibilidad con el JSX existente
  const {
    agendaDate, setAgendaDate, agendaConfig, agendaSnapshot,
    agendaPolicyDraft, agendaCabinsDraft, agendaTreatmentsDraft,
    agendaWeeklyRulesDraft, agendaSpecialDateRulesDraft,
    selectedAgendaMemberId, setSelectedAgendaMemberId,
    selectedAgendaCabinId, setSelectedAgendaCabinId,
    selectedAgendaTreatmentId, setSelectedAgendaTreatmentId,
    templateRangeStart, setTemplateRangeStart,
    templateRangeEnd, setTemplateRangeEnd,
    templatePreset, setTemplatePreset, templateDaysOfWeek,
    weekBulkAction, setWeekBulkAction, weekBulkScope, setWeekBulkScope,
    weekBulkSelectedDays, setWeekBulkSelectedDays,
    weekBulkPreset, setWeekBulkPreset,
    weekBulkStart, setWeekBulkStart, weekBulkEnd, setWeekBulkEnd,
    weekBulkNote, setWeekBulkNote,
    isAgendaSaving, isAgendaConfigSaving, agendaMessage, setAgendaMessage,
    cancelConfirmApptId, setCancelConfirmApptId,
    googleIntegrationStatus, isGoogleIntegrationSaving,
    googleIntegrationMessage, setGoogleIntegrationMessage,
    // Funciones de edición de draft
    updateAgendaPolicyField, updateWeeklyRuleField,
    updateCabinDraftField, removeCabinDraft, addCabinDraft,
    updateTreatmentDraftField, addTreatmentDraft, removeTreatmentDraft,
    toggleTreatmentCabinAllowed, moveTreatmentCabinPriority,
    toggleTemplateDay, applySpecialTemplate,
    setSpecialRuleForDate, clearSpecialRuleForDate,
    // Acciones de agenda
    applyWeekBulk, saveAgendaConfiguration, toggleAgendaSlotBlock,
    handleAgendaCreateAppointment, handleAgendaAppointmentAction,
    handleAgendaCancelAppointment, confirmCancelAppointment,
    // Acciones de Google Calendar
    handleGoogleConnect: handleGoogleConnectBase,
    handleGoogleDisconnect: handleGoogleDisconnectBase,
    handleGoogleModeChange: handleGoogleModeChangeBase,
  } = agenda;

  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'issue'>('all');
  const [tablePage, setTablePage] = useState(1);
  const [serverSearchResults, setServerSearchResults] = useState<Member[] | null>(null);
  const [isSearchingServer, setIsSearchingServer] = useState(false);
  const [auditStatusFilter, setAuditStatusFilter] = useState<'all' | 'success' | 'failed'>('all');
  const [selectedMember, setSelectedMember] = useState<Member | null>(null);

  // Session registration
  const [sessionModalMember, setSessionModalMember] = useState<Member | null>(null);
  const [sessionForm, setSessionForm] = useState<SessionForm>({ appointmentId: '', zona: '', fluencia: '', frecuencia: '', spot: '', passes: '', notes: '', adverseEvents: '' });
  const [isSessionSaving, setIsSessionSaving] = useState(false);
  const [confirmCancelMemberId, setConfirmCancelMemberId] = useState<string | null>(null);
  const [patientDrawerOpen, setPatientDrawerOpen] = useState(false);

  // Drawer history (shared between modal and drawer)
  const [memberSessions, setMemberSessions] = useState<SessionTreatment[]>([]);
  const [isLoadingSessions, setIsLoadingSessions] = useState(false);
  const [memberAppointments, setMemberAppointments] = useState<Appointment[]>([]);
  const [memberPayments, setMemberPayments] = useState<any[]>([]);
  const [isLoadingMemberHistory, setIsLoadingMemberHistory] = useState(false);
  const [memberHistoryError, setMemberHistoryError] = useState<string | null>(null);
  const [isUpdatingMember, setIsUpdatingMember] = useState(false);

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

  // Wrappers de Google Calendar — inyectan canManageGoogleIntegration
  const handleGoogleConnect = () => handleGoogleConnectBase(canManageGoogleIntegration);
  const handleGoogleDisconnect = () => handleGoogleDisconnectBase(canManageGoogleIntegration);
  const handleGoogleModeChange = (mode: GoogleEventFormatMode) => handleGoogleModeChangeBase(mode, canManageGoogleIntegration);

  // Helper para llamar loadData con los parámetros actuales
  const triggerLoadData = () => loadData({
    agendaDate,
    userRole: user?.role,
    selectedAgendaMemberId,
    onAgendaConfigLoaded: agenda.applyConfigData,
    onAgendaDayLoaded: agenda.applyDayData,
    onGoogleStatusLoaded: agenda.applyGoogleStatus,
    onFirstMemberIdLoaded: setSelectedAgendaMemberId,
  });

  useEffect(() => {
    if (isAuthenticated && hasAccess) {
      void triggerLoadData();
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
      void triggerLoadData();
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
        if (!cancelled) agenda.applyDayData(data);
      } catch (_error) {
        // Keep admin panel usable even if agenda endpoint fails.
      }
    };
    void loadDaySnapshot();
    return () => { cancelled = true; };
  }, [agendaDate, isAuthenticated, hasAccess]);


  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');
    try {
      await login(email, password, loginRequiresTotp ? loginTotpCode : undefined);
      setLoginRequiresTotp(false);
      setLoginTotpCode('');
    } catch (err: any) {
      if (err instanceof TotpRequiredError) {
        setLoginRequiresTotp(true);
        setLoginError(err.message);
        return;
      }
      setLoginError(err.message ?? 'Error de autenticación');
    }
  };

  const doUpdateMember = async (id: string, status: string) => {
    setIsUpdatingMember(true);
    try {
      await memberService.updateMembershipStatus(id, status);
      await triggerLoadData();
      setSelectedMember((prev) => prev?.id === id ? { ...prev, subscriptionStatus: status } : prev);
      toast.success('Membresía actualizada.');
    } catch {
      toast.error('No fue posible actualizar el estatus de la membresía.');
    } finally {
      setIsUpdatingMember(false);
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
    setMemberHistoryError(null);
    try {
      const resp = await apiFetch<{ sessions: any[]; appointments: any[]; payments: any[] }>(
        `/admin/users/${encodeURIComponent(member.id)}/history`
      );
      const toArr = (v: unknown): any[] => Array.isArray(v) ? v : [];
      setMemberSessions(toArr(resp?.sessions));
      setMemberAppointments(toArr(resp?.appointments));
      setMemberPayments(toArr(resp?.payments));
    } catch {
      setMemberSessions([]);
      setMemberAppointments([]);
      setMemberPayments([]);
      setMemberHistoryError("No se pudo cargar el historial. Intenta cerrar y abrir el perfil.");
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
    setMemberHistoryError(null);
    void loadMemberHistory(member);
  };

  const handleDrawerDeactivate = async (memberId: string) => {
    setDrawerDeactivating(true);
    try {
      const out = await apiFetch<any>(`/v1/admin/access/users/${memberId}/deactivate`, { method: 'PATCH' });
      toast.success(out?.message ?? 'Usuario desactivado y suscripción cancelada');
      setSelectedMember(null);
      await triggerLoadData();
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
      await triggerLoadData();
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
      await triggerLoadData();
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
      await triggerLoadData();
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


  // ─── Session Modal ────────────────────────────────────────────────────────
  // renderSessionModal → extraído a components/admin/SessionModal.tsx

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

  // renderPagos → AdminPagosSection

  // renderRiesgos y renderCumplimiento → AdminRiesgosSection / AdminCumplimientoSection

  // ─── Section: Configuraciones ─────────────────────────────────────────────

  const configTabs: Array<{ id: SettingsCategory; label: string }> = [
    { id: 'agenda',        label: 'Agenda' },
    { id: 'sistema',       label: 'Sistema' },
    { id: 'integraciones', label: 'Integraciones' },
    { id: 'auditoria',     label: 'Auditoría' },
    { id: 'seguridad',     label: 'Seguridad' },
  ];

  const loadTotpStatus = async () => {
    try {
      const r = await apiFetch<{ totpEnabled?: boolean }>('/v1/users/me/profile');
      if ('totpEnabled' in r) {
        setTotpEnabled(r.totpEnabled ?? false);
      }
    } catch {
      // si el endpoint no expone totpEnabled aún, asumimos false
      setTotpEnabled(false);
    } finally {
      setTotpStatusLoaded(true);
    }
  };

  const renderAgendaSettings = () => (
    <div className="space-y-8">
      {/* Google Calendar */}
      <AgendaIntegrations
        status={googleIntegrationStatus}
        isLoading={isGoogleIntegrationSaving}
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
            <p className="mt-1 text-[11px] text-velum-400">0 – 72 horas</p>
          </div>
          <div>
            <label className="block text-xs font-bold uppercase tracking-widest text-velum-400 mb-2">Gracia no-show (min)</label>
            <input type="number" min="5" max="240" value={agendaPolicyDraft.noShowGraceMinutes} onChange={(e) => updateAgendaPolicyField('noShowGraceMinutes', Number(e.target.value))}
              className="w-full rounded-xl border border-velum-200 px-3 py-2.5 text-sm focus:outline-none focus:border-velum-900 transition" />
            <p className="mt-1 text-[11px] text-velum-400">5 – 240 minutos</p>
          </div>
          <div>
            <label className="block text-xs font-bold uppercase tracking-widest text-velum-400 mb-2">Anticipación mínima (min)</label>
            <input type="number" min="0" value={agendaPolicyDraft.minAdvanceMinutes} onChange={(e) => updateAgendaPolicyField('minAdvanceMinutes', Number(e.target.value))}
              className="w-full rounded-xl border border-velum-200 px-3 py-2.5 text-sm focus:outline-none focus:border-velum-900 transition" />
            <p className="mt-1 text-[11px] text-velum-400">mín. 0 minutos</p>
          </div>
          <div>
            <label className="block text-xs font-bold uppercase tracking-widest text-velum-400 mb-2">Máx. días de anticipación</label>
            <input type="number" min="1" max="365" value={agendaPolicyDraft.maxAdvanceDays} onChange={(e) => updateAgendaPolicyField('maxAdvanceDays', Number(e.target.value))}
              className="w-full rounded-xl border border-velum-200 px-3 py-2.5 text-sm focus:outline-none focus:border-velum-900 transition" />
            <p className="mt-1 text-[11px] text-velum-400">1 – 365 días</p>
          </div>
          <div>
            <label className="block text-xs font-bold uppercase tracking-widest text-velum-400 mb-2">Citas activas/semana</label>
            <input type="number" min="1" max="50" value={agendaPolicyDraft.maxActiveAppointmentsPerWeek} onChange={(e) => updateAgendaPolicyField('maxActiveAppointmentsPerWeek', Number(e.target.value))}
              className="w-full rounded-xl border border-velum-200 px-3 py-2.5 text-sm focus:outline-none focus:border-velum-900 transition" />
            <p className="mt-1 text-[11px] text-velum-400">1 – 50 citas</p>
          </div>
          <div>
            <label className="block text-xs font-bold uppercase tracking-widest text-velum-400 mb-2">Citas activas/mes</label>
            <input type="number" min="1" max="200" value={agendaPolicyDraft.maxActiveAppointmentsPerMonth} onChange={(e) => updateAgendaPolicyField('maxActiveAppointmentsPerMonth', Number(e.target.value))}
              className="w-full rounded-xl border border-velum-200 px-3 py-2.5 text-sm focus:outline-none focus:border-velum-900 transition" />
            <p className="mt-1 text-[11px] text-velum-400">1 – 200 citas</p>
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
            <button onClick={() => void triggerLoadData()} className="flex items-center gap-1.5 text-xs text-velum-400 hover:text-velum-900 transition">
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
                    {filteredAuditLogs.map((log, i) => {
                      const d = new Date(log.timestamp);
                      const dateStr = !isNaN(d.getTime())
                        ? d.toLocaleString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
                        : '—';
                      const userEmail = (log.user && log.user !== 'system') ? log.user : '—';
                      const isOk = log.status === 'success';
                      return (
                        <tr key={log.id ?? i} className={`${i < filteredAuditLogs.length - 1 ? 'border-b border-velum-50' : ''} hover:bg-velum-50/50 transition`}>
                          <td className="px-4 py-2.5 text-velum-400 whitespace-nowrap">{dateStr}</td>
                          <td className="px-4 py-2.5 text-velum-700 font-medium max-w-[140px] truncate">{userEmail}</td>
                          <td className="px-4 py-2.5 text-velum-500 font-mono">{log.action}</td>
                          <td className="px-4 py-2.5 text-velum-400 font-mono">{log.ip}</td>
                          <td className="px-4 py-2.5">
                            <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${isOk ? 'text-emerald-600' : 'text-red-600'}`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${isOk ? 'bg-emerald-500' : 'bg-red-500'}`} />
                              {isOk ? 'OK' : 'Error'}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
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
          <button onClick={() => void triggerLoadData()}
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
      case 'agenda':       return (
        <SectionErrorBoundary section="Agenda">
          {renderAgenda()}
        </SectionErrorBoundary>
      );
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
          <div className="space-y-4">
            <div className="flex justify-end">
              <ExportButton
                endpoint="/api/v1/admin/export/payments"
                label="Exportar pagos CSV"
                params={{ from: histDateFrom, to: histDateTo }}
              />
            </div>
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
          </div>
        </SectionErrorBoundary>
      );
      case 'kpis':         return (
        <SectionErrorBoundary section="KPIs">
          <AdminKPIsSection analytics={analytics} planBreakdown={planBreakdown} />
        </SectionErrorBoundary>
      );
      case 'finanzas':     return (
        <SectionErrorBoundary section="Finanzas">
          <div className="space-y-4">
            <div className="flex justify-end">
              <ExportButton
                endpoint="/api/v1/admin/export/payments"
                label="Exportar pagos CSV"
              />
            </div>
            <AdminFinanzasSection members={members} analytics={analytics} onOpenMember={handleOpenMemberDrawer} />
          </div>
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
            onRefresh={() => void triggerLoadData()}
          />
        </SectionErrorBoundary>
      );
      case 'ajustes':      return (
        <SectionErrorBoundary section="Ajustes">
          {renderConfiguraciones()}
        </SectionErrorBoundary>
      );
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
              <input type="email" value={email} onChange={(e) => {
                  setEmail(e.target.value);
                  setLoginRequiresTotp(false);
                  setLoginTotpCode('');
                }} required autoFocus
                placeholder="admin@velum.mx"
                className="w-full rounded-xl border border-velum-200 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-velum-900/20 focus:border-velum-900 transition" />
            </div>
            <div>
              <label className="block text-xs font-bold uppercase tracking-widest text-velum-500 mb-2">Contraseña</label>
              <PasswordInput value={password} onChange={(e) => {
                  setPassword(e.target.value);
                  setLoginRequiresTotp(false);
                  setLoginTotpCode('');
                }} required
                className="w-full rounded-xl border border-velum-200 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-velum-900/20 focus:border-velum-900 transition" />
            </div>
            {loginRequiresTotp && (
              <div>
                <label className="block text-xs font-bold uppercase tracking-widest text-velum-500 mb-2">Código 2FA</label>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="\d{6}"
                  maxLength={6}
                  value={loginTotpCode}
                  onChange={(e) => setLoginTotpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  required
                  autoFocus
                  placeholder="000000"
                  className="w-full rounded-xl border border-velum-200 px-4 py-3 text-sm tracking-[0.35em] focus:outline-none focus:ring-2 focus:ring-velum-900/20 focus:border-velum-900 transition"
                />
              </div>
            )}
            <button type="submit" disabled={isActionLoading || (loginRequiresTotp && loginTotpCode.length !== 6)}
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

  // ─── Comandos del CommandPalette (Cmd+K) ──────────────────────────────────
  // Tres grupos: Secciones (10), Pacientes (top 100), Acciones globales.
  // Memoizado por members + activeSection para evitar reconstruir en cada
  // render (members cambia rara vez).
  const paletteCommands = useMemo<CommandItem[]>(() => {
    const sectionCmds: CommandItem[] = NAV_SECTIONS.map((section) => ({
      id: `section:${section}`,
      label: `Ir a ${sectionMeta[section].label}`,
      hint: sectionMeta[section].description,
      group: 'Secciones',
      icon: sectionMeta[section].icon,
      keywords: [section, sectionMeta[section].label.toLowerCase()],
      perform: () => {
        setActiveSection(section);
        setSidebarOpen(false);
      },
    }));

    // Pacientes — limitado a 100 para no saturar la lista. El usuario puede
    // refinar con texto antes de que aparezcan más. Si en el futuro hay
    // miles, considerar virtualizar la lista o paginar el filtrado.
    const memberCmds: CommandItem[] = members.slice(0, 100).map((m) => ({
      id: `member:${m.id}`,
      label: m.name || m.email || 'Sin nombre',
      hint: m.name ? m.email : undefined,
      group: 'Pacientes',
      icon: UserIcon,
      keywords: [m.email, m.id, m.name].filter(Boolean) as string[],
      perform: () => {
        setActiveSection('socias');
        setSelectedMember(m);
      },
    }));

    const actionCmds: CommandItem[] = [
      {
        id: 'action:refresh',
        label: 'Actualizar datos',
        hint: 'Recarga miembros, citas y métricas',
        group: 'Acciones',
        icon: RefreshCw,
        keywords: ['refresh', 'recargar', 'sync'],
        perform: () => triggerLoadData(),
      },
      {
        id: 'action:logout',
        label: 'Cerrar sesión',
        group: 'Acciones',
        icon: LogOut,
        keywords: ['salir', 'logout', 'sign out'],
        perform: () => logout(),
      },
    ];

    return [...sectionCmds, ...memberCmds, ...actionCmds];
    // triggerLoadData y logout se referencian via closure — son estables
    // (definidos en el componente). No se incluyen en deps porque cambian
    // referencia en cada render y causarían rebuild innecesario.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [members]);

  return (
    <DensityProvider>
    <CommandPaletteProvider>
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
            <CmdKButton />
            <CmdKButtonMobile />
            <DensityToggle />
            <button
              onClick={() => void triggerLoadData()}
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
      {sessionModalMember && (
        <SessionModal
          member={sessionModalMember}
          appointments={memberAppointments}
          form={sessionForm}
          isSaving={isSessionSaving}
          onFormChange={setSessionForm}
          onSubmit={handleSubmitSession}
          onClose={() => setSessionModalMember(null)}
        />
      )}
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
          isUpdatingMember={isUpdatingMember}
          isLoadingMemberHistory={isLoadingMemberHistory}
          memberHistoryError={memberHistoryError}
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
        onCreated={() => { setPatientDrawerOpen(false); void triggerLoadData(); }}
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

      {/* Cmd+K — paleta global de comandos. Montada una vez al final. */}
      <CommandPalette commands={paletteCommands} />
    </div>
    </CommandPaletteProvider>
    </DensityProvider>
  );
};
