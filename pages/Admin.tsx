import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '../components/Button';
import { VelumLogo } from '../components/VelumLogo';
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
  HandCoins
} from 'lucide-react';
import { AuditLogEntry, Member, UserRole } from '../types';
import { useAuth } from '../context/AuthContext';
import { memberService, auditService } from '../services/dataService';

type AdminSection =
  | 'control'
  | 'socios'
  | 'kpis'
  | 'finanzas'
  | 'expedientes'
  | 'agenda'
  | 'cobranza'
  | 'riesgos'
  | 'cumplimiento'
  | 'configuraciones';

type HealthFlag = 'ok' | 'warning' | 'critical';

type ControlAlert = {
  id: string;
  level: HealthFlag;
  title: string;
  detail: string;
  section: AdminSection;
};

const sectionMeta: Record<AdminSection, { label: string; icon: React.ComponentType<any>; group: string }> = {
  control: { label: 'Torre de Control', icon: Activity, group: 'Dirección' },
  socios: { label: 'Socios', icon: Users, group: 'Dirección' },
  kpis: { label: 'KPIs', icon: BarChart3, group: 'Dirección' },
  finanzas: { label: 'Finanzas', icon: Wallet, group: 'Operación' },
  expedientes: { label: 'Expedientes', icon: FolderOpen, group: 'Operación' },
  agenda: { label: 'Agendas', icon: CalendarDays, group: 'Operación' },
  cobranza: { label: 'Cobranza', icon: HandCoins, group: 'Operación' },
  riesgos: { label: 'Riesgos', icon: AlertTriangle, group: 'Gobierno' },
  cumplimiento: { label: 'Cumplimiento', icon: Shield, group: 'Gobierno' },
  configuraciones: { label: 'Configuraciones', icon: Settings, group: 'Gobierno' }
};

const sectionGroups: Array<{ title: string; items: AdminSection[] }> = [
  { title: 'Dirección', items: ['control', 'socios', 'kpis'] },
  { title: 'Operación', items: ['finanzas', 'expedientes', 'agenda', 'cobranza'] },
  { title: 'Gobierno', items: ['riesgos', 'cumplimiento', 'configuraciones'] }
];

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

const riskOfMember = (member: Member): HealthFlag => {
  const status = member.subscriptionStatus;
  const consent = !!member.clinical?.consentFormSigned;
  if ((status === 'past_due' || status === 'canceled' || status === 'inactive') && !consent) return 'critical';
  if (status !== 'active' || !consent) return 'warning';
  return 'ok';
};

export const Admin: React.FC = () => {
  const { login, logout, user, isAuthenticated, isLoading: isAuthLoading } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [activeSection, setActiveSection] = useState<AdminSection>('control');

  const [isLoadingData, setIsLoadingData] = useState(false);
  const [members, setMembers] = useState<Member[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);

  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'issue'>('all');
  const [selectedMember, setSelectedMember] = useState<Member | null>(null);

  const hasAccess = !!user && allowedRoles.includes(user.role);

  const loadData = async () => {
    setIsLoadingData(true);
    try {
      const [membersData, logsData] = await Promise.all([
        memberService.getAll(),
        user?.role === 'admin' || user?.role === 'system' ? auditService.getLogs() : Promise.resolve([])
      ]);
      setMembers(membersData);
      setAuditLogs(logsData);
    } catch (_error) {
      // Keep panel usable if one endpoint fails.
    } finally {
      setIsLoadingData(false);
    }
  };

  useEffect(() => {
    if (isAuthenticated && hasAccess) {
      loadData();
    }
  }, [isAuthenticated, hasAccess, user?.id, user?.role]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');
    try {
      await login(email, password);
    } catch (err: any) {
      setLoginError(err.message ?? 'Error de autenticación');
    }
  };

  const handleUpdateMember = async (id: string, status: string) => {
    try {
      await memberService.updateMembershipStatus(id, status);
      await loadData();
      if (selectedMember?.id === id) {
        setSelectedMember({ ...selectedMember, subscriptionStatus: status });
      }
    } catch (_error) {
      alert('No fue posible actualizar el estatus de la membresía.');
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
        title: 'Socios en riesgo crítico',
        detail: `${analytics.highRiskMembers.length} socios combinan problema de pago + expediente incompleto.`,
        section: 'riesgos'
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
        section: 'cobranza'
      });
    }

    if (analytics.failedAudits > 0) {
      alerts.push({
        id: 'audit-failed',
        level: 'critical',
        title: 'Eventos de seguridad fallidos',
        detail: `${analytics.failedAudits} eventos en bitácora con estatus FAILED.`,
        section: 'cumplimiento'
      });
    }

    if (alerts.length === 0) {
      alerts.push({
        id: 'system-ok',
        level: 'ok',
        title: 'Operación estable',
        detail: 'No hay alertas críticas al momento. Mantén monitoreo continuo.',
        section: 'control'
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

  const alertClass = (level: HealthFlag) => {
    switch (level) {
      case 'ok':
        return 'border-emerald-200 bg-emerald-50 text-emerald-800';
      case 'warning':
        return 'border-amber-200 bg-amber-50 text-amber-800';
      case 'critical':
        return 'border-red-200 bg-red-50 text-red-800';
      default:
        return 'border-zinc-200 bg-zinc-50 text-zinc-800';
    }
  };

  const renderMemberDrawer = () => {
    if (!selectedMember) return null;

    const memberRisk = riskOfMember(selectedMember);

    return (
      <div className="fixed inset-0 z-50 flex justify-end bg-black/30 backdrop-blur-sm">
        <button className="flex-1" onClick={() => setSelectedMember(null)} aria-label="Cerrar detalle" />
        <div className="w-full max-w-2xl bg-white h-full shadow-2xl border-l border-velum-200 overflow-y-auto">
          <div className="p-6 border-b border-velum-200 flex justify-between items-center sticky top-0 bg-white">
            <div>
              <h2 className="text-2xl font-serif text-velum-900">{selectedMember.name}</h2>
              <p className="text-sm text-velum-500">{selectedMember.email}</p>
            </div>
            <button onClick={() => setSelectedMember(null)} className="text-velum-400 hover:text-velum-900" aria-label="Cerrar">
              <X size={22} />
            </button>
          </div>

          <div className="p-6 space-y-6">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div className="p-4 border border-velum-200">
                <p className="text-xs uppercase text-velum-500">Plan</p>
                <p className="font-bold mt-1">{selectedMember.plan ?? 'Sin plan'}</p>
              </div>
              <div className="p-4 border border-velum-200">
                <p className="text-xs uppercase text-velum-500">Estado</p>
                <p className="font-bold mt-1">{statusLabel(selectedMember.subscriptionStatus)}</p>
              </div>
              <div className="p-4 border border-velum-200">
                <p className="text-xs uppercase text-velum-500">Consentimiento</p>
                <p className="font-bold mt-1">{selectedMember.clinical?.consentFormSigned ? 'Firmado' : 'Pendiente'}</p>
              </div>
              <div className="p-4 border border-velum-200">
                <p className="text-xs uppercase text-velum-500">Nivel de riesgo</p>
                <p className="font-bold mt-1">
                  {memberRisk === 'critical' ? 'Crítico' : memberRisk === 'warning' ? 'Atención' : 'Controlado'}
                </p>
              </div>
            </div>

            <div>
              <h3 className="text-xs uppercase tracking-widest text-velum-500 mb-3">Acciones operativas</h3>
              <div className="flex flex-wrap gap-3">
                <Button variant="secondary" size="sm" onClick={() => handleUpdateMember(selectedMember.id, 'active')}>
                  Activar cuenta
                </Button>
                <Button variant="outline" size="sm" onClick={() => handleUpdateMember(selectedMember.id, 'past_due')}>
                  Marcar pago vencido
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-red-700 border-red-300 hover:bg-red-600 hover:text-white"
                  onClick={() => handleUpdateMember(selectedMember.id, 'canceled')}
                >
                  Cancelar membresía
                </Button>
              </div>
            </div>

            <div className="border border-velum-200 p-4">
              <h4 className="text-xs uppercase tracking-widest text-velum-500">Control clínico</h4>
              <p className="text-sm text-velum-700 mt-2">
                Documentos cargados: {selectedMember.clinical?.documents?.length ?? 0}. Alergias registradas:{' '}
                {selectedMember.clinical?.allergies ? 'Sí' : 'No'}.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderControl = () => (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="bg-white border border-velum-200 p-5">
          <p className="text-[10px] uppercase tracking-widest text-velum-500">Socios totales</p>
          <p className="text-3xl font-serif text-velum-900 mt-2">{analytics.totalSocios}</p>
          <p className="text-xs text-velum-500 mt-1">Activos: {analytics.sociosActivos}</p>
        </div>
        <div className="bg-white border border-velum-200 p-5">
          <p className="text-[10px] uppercase tracking-widest text-velum-500">MRR actual</p>
          <p className="text-3xl font-serif text-velum-900 mt-2">{formatMoney(analytics.mrr)}</p>
          <p className="text-xs text-velum-500 mt-1">ARPU: {formatMoney(analytics.arpu)}</p>
        </div>
        <div className="bg-white border border-velum-200 p-5">
          <p className="text-[10px] uppercase tracking-widest text-velum-500">Riesgo operativo</p>
          <p className="text-3xl font-serif text-velum-900 mt-2">{analytics.churnRisk.toFixed(1)}%</p>
          <p className="text-xs text-velum-500 mt-1">Cuentas con incidencia: {analytics.sociosConRiesgo}</p>
        </div>
        <div className="bg-white border border-velum-200 p-5">
          <p className="text-[10px] uppercase tracking-widest text-velum-500">Eventos sensibles</p>
          <p className="text-3xl font-serif text-velum-900 mt-2">{analytics.sensitiveEvents}</p>
          <p className="text-xs text-velum-500 mt-1">Fallidos: {analytics.failedAudits}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="bg-white border border-velum-200 p-5 space-y-4">
          <div className="flex items-center gap-2">
            <AlertTriangle size={16} className="text-velum-700" />
            <h3 className="font-serif text-xl text-velum-900">Centro de alertas críticas</h3>
          </div>
          <div className="space-y-3">
            {controlAlerts.map((alert) => (
              <button
                key={alert.id}
                onClick={() => setActiveSection(alert.section)}
                className={`w-full text-left border p-4 transition-colors hover:border-velum-500 ${alertClass(alert.level)}`}
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold">{alert.title}</p>
                  <ArrowRight size={14} />
                </div>
                <p className="text-xs mt-1 opacity-90">{alert.detail}</p>
              </button>
            ))}
          </div>
        </div>

        <div className="bg-white border border-velum-200 p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Target size={16} className="text-velum-700" />
            <h3 className="font-serif text-xl text-velum-900">Playbook de dirección</h3>
          </div>

          <div className="space-y-3 text-sm">
            <div className="border border-velum-200 p-3">
              <p className="font-semibold text-velum-900">1) Estabilidad diaria</p>
              <p className="text-xs text-velum-600 mt-1">Validar salud de agenda + expedientes pendientes + alertas de cobranza.</p>
            </div>
            <div className="border border-velum-200 p-3">
              <p className="font-semibold text-velum-900">2) Riesgo y cumplimiento</p>
              <p className="text-xs text-velum-600 mt-1">Revisar cambios sensibles de roles y eventos fallidos de seguridad.</p>
            </div>
            <div className="border border-velum-200 p-3">
              <p className="font-semibold text-velum-900">3) Rentabilidad</p>
              <p className="text-xs text-velum-600 mt-1">Controlar MRR, ARPU, renovaciones próximas y acciones de recuperación.</p>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white border border-velum-200 p-5">
        <h3 className="font-serif text-xl text-velum-900 mb-4">Últimos eventos de auditoría</h3>
        <div className="space-y-2">
          {auditLogs.slice(0, 8).map((log) => (
            <div key={log.id} className="border border-velum-200 p-3 flex flex-col md:flex-row md:items-center md:justify-between gap-2 text-sm">
              <div>
                <p className="font-semibold text-velum-900">{log.action} · {log.resource}</p>
                <p className="text-xs text-velum-500">{log.timestamp} · {log.user} ({log.role})</p>
              </div>
              <span className={`text-[10px] uppercase tracking-widest px-2 py-1 border ${log.status === 'failed' ? 'bg-red-50 border-red-200 text-red-700' : 'bg-emerald-50 border-emerald-200 text-emerald-700'}`}>
                {log.status}
              </span>
            </div>
          ))}
          {auditLogs.length === 0 && <p className="text-sm text-velum-500">Sin eventos por mostrar.</p>}
        </div>
      </div>
    </div>
  );

  const renderSocios = () => (
    <div className="bg-white border border-velum-200 shadow-sm">
      <div className="p-4 border-b border-velum-200 flex flex-col md:flex-row gap-3 md:items-center md:justify-between">
        <div className="flex items-center gap-2 w-full md:max-w-lg">
          <Search size={16} className="text-velum-400" />
          <input
            className="w-full outline-none text-sm bg-transparent"
            placeholder="Buscar socio por nombre o email..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as 'all' | 'active' | 'issue')}
          className="border border-velum-300 bg-velum-50 text-xs uppercase tracking-widest px-3 py-2"
        >
          <option value="all">Todos</option>
          <option value="active">Activos</option>
          <option value="issue">Con incidencia</option>
        </select>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead className="bg-velum-50 text-[10px] uppercase font-bold text-velum-600">
            <tr>
              <th className="p-4">Socio</th>
              <th className="p-4">Plan</th>
              <th className="p-4">Estado</th>
              <th className="p-4">Expediente</th>
              <th className="p-4">Riesgo</th>
              <th className="p-4">Acción</th>
            </tr>
          </thead>
          <tbody>
            {filteredMembers.map((member) => {
              const risk = riskOfMember(member);
              return (
                <tr key={member.id} className="border-b border-velum-100 hover:bg-velum-50">
                  <td className="p-4">
                    <p className="font-bold text-sm">{member.name}</p>
                    <p className="text-xs text-velum-500">{member.email}</p>
                  </td>
                  <td className="p-4 text-sm">{member.plan ?? 'Plan Velum'}</td>
                  <td className="p-4">
                    <span className={`inline-flex text-[10px] uppercase tracking-widest border px-2 py-1 ${statusPill(member.subscriptionStatus)}`}>
                      {statusLabel(member.subscriptionStatus)}
                    </span>
                  </td>
                  <td className="p-4 text-xs uppercase tracking-widest">
                    {member.clinical?.consentFormSigned ? 'Completo' : 'Pendiente'}
                  </td>
                  <td className="p-4 text-xs uppercase tracking-widest">
                    {risk === 'critical' ? 'Crítico' : risk === 'warning' ? 'Atención' : 'OK'}
                  </td>
                  <td className="p-4">
                    <Button size="sm" variant="outline" onClick={() => setSelectedMember(member)}>
                      Ver detalle
                    </Button>
                  </td>
                </tr>
              );
            })}
            {filteredMembers.length === 0 && (
              <tr>
                <td colSpan={6} className="p-6 text-sm text-velum-500 text-center">
                  No hay socios con los filtros seleccionados.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );

  const renderKpis = () => (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="bg-white border border-velum-200 p-5">
          <p className="text-[10px] uppercase tracking-widest text-velum-500">Socios activos</p>
          <p className="text-3xl font-serif text-velum-900 mt-2">{analytics.sociosActivos}</p>
        </div>
        <div className="bg-white border border-velum-200 p-5">
          <p className="text-[10px] uppercase tracking-widest text-velum-500">Pendientes de activación</p>
          <p className="text-3xl font-serif text-velum-900 mt-2">{analytics.sociosPendientes}</p>
        </div>
        <div className="bg-white border border-velum-200 p-5">
          <p className="text-[10px] uppercase tracking-widest text-velum-500">Renovaciones en 7 días</p>
          <p className="text-3xl font-serif text-velum-900 mt-2">{analytics.renewalsIn7Days}</p>
        </div>
        <div className="bg-white border border-velum-200 p-5">
          <p className="text-[10px] uppercase tracking-widest text-velum-500">Riesgo (churn)</p>
          <p className="text-3xl font-serif text-velum-900 mt-2">{analytics.churnRisk.toFixed(1)}%</p>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="bg-white border border-velum-200 p-5">
          <h3 className="font-serif text-xl text-velum-900 mb-4">Distribución por plan</h3>
          <div className="space-y-3">
            {planBreakdown.map((plan) => (
              <div key={plan.plan} className="border border-velum-200 p-3">
                <div className="flex items-center justify-between text-sm">
                  <p className="font-semibold text-velum-900">{plan.plan}</p>
                  <p className="text-velum-700">{formatMoney(plan.revenue)}</p>
                </div>
                <p className="text-xs text-velum-500 mt-1">{plan.members} socios</p>
              </div>
            ))}
            {planBreakdown.length === 0 && <p className="text-sm text-velum-500">Sin datos de planes.</p>}
          </div>
        </div>

        <div className="bg-white border border-velum-200 p-5">
          <h3 className="font-serif text-xl text-velum-900 mb-4">Salud operativa</h3>
          <div className="space-y-3 text-sm">
            <div className="flex items-center justify-between border border-velum-200 p-3">
              <span className="flex items-center gap-2"><CheckCircle2 size={14} /> Expedientes firmados</span>
              <strong>{analytics.expedientesFirmados}</strong>
            </div>
            <div className="flex items-center justify-between border border-velum-200 p-3">
              <span className="flex items-center gap-2"><CircleAlert size={14} /> Expedientes pendientes</span>
              <strong>{analytics.expedientesPendientes}</strong>
            </div>
            <div className="flex items-center justify-between border border-velum-200 p-3">
              <span className="flex items-center gap-2"><Clock3 size={14} /> Cuentas por recuperación</span>
              <strong>{analytics.collectionQueue.length}</strong>
            </div>
            <div className="flex items-center justify-between border border-velum-200 p-3">
              <span className="flex items-center gap-2"><Shield size={14} /> Eventos sensibles</span>
              <strong>{analytics.sensitiveEvents}</strong>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  const renderFinanzas = () => (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white border border-velum-200 p-5">
          <p className="text-[10px] uppercase tracking-widest text-velum-500">MRR</p>
          <p className="text-3xl font-serif text-velum-900 mt-2">{formatMoney(analytics.mrr)}</p>
        </div>
        <div className="bg-white border border-velum-200 p-5">
          <p className="text-[10px] uppercase tracking-widest text-velum-500">ARPU</p>
          <p className="text-3xl font-serif text-velum-900 mt-2">{formatMoney(analytics.arpu)}</p>
        </div>
        <div className="bg-white border border-velum-200 p-5">
          <p className="text-[10px] uppercase tracking-widest text-velum-500">Cuentas en cobranza</p>
          <p className="text-3xl font-serif text-velum-900 mt-2">{analytics.collectionQueue.length}</p>
        </div>
      </div>

      <div className="bg-white border border-velum-200">
        <div className="p-5 border-b border-velum-200 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-serif text-velum-900">Radar financiero</h3>
            <p className="text-xs text-velum-500 uppercase tracking-widest mt-1">Top cuentas que impactan flujo</p>
          </div>
          <Button size="sm" variant="outline" onClick={() => setActiveSection('cobranza')}>Ir a cobranza</Button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-velum-50 text-[10px] uppercase font-bold text-velum-600">
              <tr>
                <th className="p-4">Socio</th>
                <th className="p-4">Plan</th>
                <th className="p-4">Monto</th>
                <th className="p-4">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-velum-100">
              {members.slice(0, 25).map((member) => (
                <tr key={member.id}>
                  <td className="p-4">{member.name}</td>
                  <td className="p-4">{member.plan ?? 'Plan Velum'}</td>
                  <td className="p-4">{formatMoney(member.amount ?? 0)}</td>
                  <td className="p-4">
                    <span className={`inline-flex text-[10px] uppercase tracking-widest border px-2 py-1 ${statusPill(member.subscriptionStatus)}`}>
                      {statusLabel(member.subscriptionStatus)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );

  const renderExpedientes = () => (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        <div className="bg-white border border-velum-200 p-5">
          <p className="text-[10px] uppercase tracking-widest text-velum-500">Expedientes firmados</p>
          <p className="text-3xl font-serif text-velum-900 mt-2">{analytics.expedientesFirmados}</p>
        </div>
        <div className="bg-white border border-velum-200 p-5">
          <p className="text-[10px] uppercase tracking-widest text-velum-500">Pendientes</p>
          <p className="text-3xl font-serif text-velum-900 mt-2">{analytics.expedientesPendientes}</p>
        </div>
        <div className="bg-white border border-velum-200 p-5">
          <p className="text-[10px] uppercase tracking-widest text-velum-500">Alto riesgo clínico</p>
          <p className="text-3xl font-serif text-velum-900 mt-2">{analytics.highRiskMembers.length}</p>
        </div>
      </div>

      <div className="bg-white border border-velum-200 shadow-sm overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="bg-velum-50 text-[10px] uppercase font-bold text-velum-600">
            <tr>
              <th className="p-4">Socio</th>
              <th className="p-4">Consentimiento</th>
              <th className="p-4">Documentos</th>
              <th className="p-4">Observación clínica</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-velum-100">
            {members.map((member) => (
              <tr key={member.id}>
                <td className="p-4">
                  <p className="font-semibold">{member.name}</p>
                  <p className="text-xs text-velum-500">{member.email}</p>
                </td>
                <td className="p-4 text-xs uppercase tracking-widest">
                  {member.clinical?.consentFormSigned ? 'Firmado' : 'Pendiente'}
                </td>
                <td className="p-4">{member.clinical?.documents?.length ?? 0}</td>
                <td className="p-4 text-xs text-velum-600">
                  {member.clinical?.allergies || member.clinical?.medications ? 'Requiere revisión médica' : 'Sin alertas registradas'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );

  const renderAgenda = () => (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white border border-velum-200 p-5">
          <p className="text-[10px] uppercase tracking-widest text-velum-500">Carga operativa</p>
          <p className="text-3xl font-serif text-velum-900 mt-2">{analytics.totalSocios}</p>
          <p className="text-xs text-velum-500 mt-1">Socios bajo administración</p>
        </div>
        <div className="bg-white border border-velum-200 p-5">
          <p className="text-[10px] uppercase tracking-widest text-velum-500">Bloqueos de agenda</p>
          <p className="text-3xl font-serif text-velum-900 mt-2">{analytics.expedientesPendientes}</p>
          <p className="text-xs text-velum-500 mt-1">Sin expediente completo</p>
        </div>
        <div className="bg-white border border-velum-200 p-5">
          <p className="text-[10px] uppercase tracking-widest text-velum-500">Activaciones pendientes</p>
          <p className="text-3xl font-serif text-velum-900 mt-2">{analytics.sociosPendientes}</p>
          <p className="text-xs text-velum-500 mt-1">Onboarding operativo</p>
        </div>
      </div>

      <div className="bg-white border border-velum-200 p-6">
        <h3 className="text-lg font-serif text-velum-900">Planificador operativo de cabina</h3>
        <p className="text-sm text-velum-600 mt-2">
          Usa la agenda para gestión detallada de slots, bloqueos, confirmaciones y reprogramaciones.
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <Link to="/agenda"><Button>Ir a agenda</Button></Link>
          <Button variant="outline" onClick={() => setActiveSection('socios')}>Revisar socios pendientes</Button>
        </div>
      </div>
    </div>
  );

  const renderCobranza = () => (
    <div className="bg-white border border-velum-200 shadow-sm">
      <div className="p-5 border-b border-velum-200">
        <h3 className="text-lg font-serif text-velum-900">Pipeline de cobranza</h3>
        <p className="text-xs text-velum-500 uppercase tracking-widest mt-1">Recuperación y normalización de cuentas</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="bg-velum-50 text-[10px] uppercase font-bold text-velum-600">
            <tr>
              <th className="p-4">Socio</th>
              <th className="p-4">Estado</th>
              <th className="p-4">Monto</th>
              <th className="p-4">Riesgo</th>
              <th className="p-4">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-velum-100">
            {analytics.collectionQueue.map((member) => {
              const risk = riskOfMember(member);
              return (
                <tr key={member.id}>
                  <td className="p-4">
                    <p className="font-semibold">{member.name}</p>
                    <p className="text-xs text-velum-500">{member.email}</p>
                  </td>
                  <td className="p-4">
                    <span className={`inline-flex text-[10px] uppercase tracking-widest border px-2 py-1 ${statusPill(member.subscriptionStatus)}`}>
                      {statusLabel(member.subscriptionStatus)}
                    </span>
                  </td>
                  <td className="p-4">{formatMoney(member.amount ?? 0)}</td>
                  <td className="p-4 text-xs uppercase tracking-widest">
                    {risk === 'critical' ? 'Crítico' : risk === 'warning' ? 'Atención' : 'OK'}
                  </td>
                  <td className="p-4">
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" variant="secondary" onClick={() => handleUpdateMember(member.id, 'active')}>
                        Regularizar
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setSelectedMember(member)}>
                        Abrir
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {analytics.collectionQueue.length === 0 && (
              <tr>
                <td colSpan={5} className="p-6 text-center text-sm text-velum-500">No hay cuentas en cobranza activa.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );

  const renderRiesgos = () => (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white border border-velum-200 p-5">
          <p className="text-[10px] uppercase tracking-widest text-velum-500">Críticos</p>
          <p className="text-3xl font-serif text-velum-900 mt-2">{analytics.highRiskMembers.length}</p>
        </div>
        <div className="bg-white border border-velum-200 p-5">
          <p className="text-[10px] uppercase tracking-widest text-velum-500">Auditorías fallidas</p>
          <p className="text-3xl font-serif text-velum-900 mt-2">{analytics.failedAudits}</p>
        </div>
        <div className="bg-white border border-velum-200 p-5">
          <p className="text-[10px] uppercase tracking-widest text-velum-500">Eventos sensibles</p>
          <p className="text-3xl font-serif text-velum-900 mt-2">{analytics.sensitiveEvents}</p>
        </div>
      </div>

      <div className="bg-white border border-velum-200 p-5">
        <h3 className="font-serif text-xl text-velum-900 mb-4">Matriz de riesgos</h3>
        <div className="space-y-3">
          {analytics.highRiskMembers.map((member) => (
            <div key={member.id} className="border border-red-200 bg-red-50 p-4 text-sm">
              <p className="font-semibold text-red-800">{member.name}</p>
              <p className="text-xs text-red-700 mt-1">
                Estado: {statusLabel(member.subscriptionStatus)} · Consentimiento: {member.clinical?.consentFormSigned ? 'Firmado' : 'Pendiente'}
              </p>
              <div className="mt-3 flex gap-2">
                <Button size="sm" variant="outline" className="border-red-300 text-red-700 hover:bg-red-700 hover:text-white" onClick={() => setSelectedMember(member)}>
                  Tomar acción
                </Button>
              </div>
            </div>
          ))}
          {analytics.highRiskMembers.length === 0 && <p className="text-sm text-velum-500">Sin riesgos críticos detectados.</p>}
        </div>
      </div>
    </div>
  );

  const renderCumplimiento = () => (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="bg-white border border-velum-200 p-5">
          <p className="text-[10px] uppercase tracking-widest text-velum-500">Firmas de consentimiento</p>
          <p className="text-3xl font-serif text-velum-900 mt-2">{analytics.expedientesFirmados}</p>
        </div>
        <div className="bg-white border border-velum-200 p-5">
          <p className="text-[10px] uppercase tracking-widest text-velum-500">Pendientes regulatorios</p>
          <p className="text-3xl font-serif text-velum-900 mt-2">{analytics.expedientesPendientes}</p>
        </div>
        <div className="bg-white border border-velum-200 p-5">
          <p className="text-[10px] uppercase tracking-widest text-velum-500">Eventos fallidos</p>
          <p className="text-3xl font-serif text-velum-900 mt-2">{analytics.failedAudits}</p>
        </div>
        <div className="bg-white border border-velum-200 p-5">
          <p className="text-[10px] uppercase tracking-widest text-velum-500">Usuarios con acceso</p>
          <p className="text-3xl font-serif text-velum-900 mt-2">{allowedRoles.length}</p>
        </div>
      </div>

      <div className="bg-white border border-velum-200 shadow-sm">
        <div className="p-5 border-b border-velum-200 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-serif text-velum-900">Bitácora de cumplimiento</h3>
            <p className="text-xs text-velum-500 uppercase tracking-widest mt-1">Trazabilidad y evidencia</p>
          </div>
          <Button variant="outline" size="sm" onClick={loadData} className="gap-2">
            <RefreshCw size={14} />
            Actualizar
          </Button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-velum-50 text-[10px] uppercase font-bold text-velum-600">
              <tr>
                <th className="p-3">Timestamp</th>
                <th className="p-3">Usuario</th>
                <th className="p-3">Acción</th>
                <th className="p-3">IP</th>
                <th className="p-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-velum-100">
              {auditLogs.slice(0, 200).map((log) => (
                <tr key={log.id} className="hover:bg-velum-50">
                  <td className="p-3 text-xs text-velum-500">{log.timestamp}</td>
                  <td className="p-3 text-xs">{log.user} ({log.role})</td>
                  <td className="p-3 text-xs">{log.action} - {log.resource}</td>
                  <td className="p-3 text-xs text-velum-500">{log.ip}</td>
                  <td className="p-3 text-xs uppercase">
                    <span className={`inline-flex px-2 py-1 border ${log.status === 'failed' ? 'bg-red-50 border-red-200 text-red-700' : 'bg-emerald-50 border-emerald-200 text-emerald-700'}`}>
                      {log.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );

  const renderConfiguraciones = () => (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        <div className="bg-white border border-velum-200 p-5">
          <p className="text-[10px] uppercase tracking-widest text-velum-500">Política de acceso</p>
          <p className="text-sm font-semibold text-velum-900 mt-2">RBAC activo</p>
          <p className="text-xs text-velum-500 mt-1">Control por roles admin/staff/system.</p>
        </div>
        <div className="bg-white border border-velum-200 p-5">
          <p className="text-[10px] uppercase tracking-widest text-velum-500">Controles de auditoría</p>
          <p className="text-sm font-semibold text-velum-900 mt-2">Bitácora trazable</p>
          <p className="text-xs text-velum-500 mt-1">Registro de acciones sensibles habilitado.</p>
        </div>
        <div className="bg-white border border-velum-200 p-5">
          <p className="text-[10px] uppercase tracking-widest text-velum-500">Operación clínica</p>
          <p className="text-sm font-semibold text-velum-900 mt-2">Checklist activo</p>
          <p className="text-xs text-velum-500 mt-1">Expediente + consentimiento antes de sesión.</p>
        </div>
      </div>

      <div className="bg-white border border-velum-200 p-5">
        <h3 className="font-serif text-xl text-velum-900 mb-4">Configuración avanzada sugerida</h3>
        <div className="space-y-3 text-sm">
          <div className="border border-velum-200 p-3 flex items-center justify-between">
            <span className="flex items-center gap-2"><ShieldCheck size={14} /> Rotación obligatoria de contraseña admin</span>
            <span className="text-xs uppercase tracking-widest text-velum-500">Recomendado</span>
          </div>
          <div className="border border-velum-200 p-3 flex items-center justify-between">
            <span className="flex items-center gap-2"><FileText size={14} /> Política de retención documental clínica</span>
            <span className="text-xs uppercase tracking-widest text-velum-500">Recomendado</span>
          </div>
          <div className="border border-velum-200 p-3 flex items-center justify-between">
            <span className="flex items-center gap-2"><Activity size={14} /> Monitoreo semanal de riesgo operacional</span>
            <span className="text-xs uppercase tracking-widest text-velum-500">Recomendado</span>
          </div>
        </div>
      </div>
    </div>
  );

  const renderSection = () => {
    switch (activeSection) {
      case 'control':
        return renderControl();
      case 'socios':
        return renderSocios();
      case 'kpis':
        return renderKpis();
      case 'finanzas':
        return renderFinanzas();
      case 'expedientes':
        return renderExpedientes();
      case 'agenda':
        return renderAgenda();
      case 'cobranza':
        return renderCobranza();
      case 'riesgos':
        return renderRiesgos();
      case 'cumplimiento':
        return renderCumplimiento();
      case 'configuraciones':
        return renderConfiguraciones();
      default:
        return renderControl();
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-velum-50 px-4">
        <div className="max-w-md w-full bg-white p-10 border border-velum-200 shadow-2xl animate-fade-in-up">
          <div className="flex justify-center mb-8">
            <VelumLogo className="h-16 w-auto text-velum-900" />
          </div>
          <div className="text-center mb-8">
            <h2 className="font-serif text-2xl text-velum-900 italic">Portal Corporativo</h2>
            <p className="text-xs text-velum-500 uppercase tracking-widest mt-2">CRM + ERP Clínico Empresarial</p>
          </div>
          <form onSubmit={handleLogin} className="space-y-6">
            <div>
              <label className="block text-xs uppercase tracking-widest text-velum-600 mb-2 font-bold">ID Administrativo</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full p-3 border border-velum-300 bg-velum-50 focus:border-velum-900 outline-none transition-colors text-sm"
                placeholder="admin@velum.mx"
              />
            </div>
            <div>
              <label className="block text-xs uppercase tracking-widest text-velum-600 mb-2 font-bold">Clave de Seguridad</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full p-3 border border-velum-300 bg-velum-50 focus:border-velum-900 outline-none transition-colors text-sm"
                placeholder="••••••••"
              />
            </div>
            {loginError && (
              <div className="text-red-700 bg-red-50 p-3 text-xs border border-red-100">
                {loginError}
              </div>
            )}
            <Button type="submit" className="w-full py-4" isLoading={isAuthLoading}>
              Autenticar
            </Button>
          </form>
        </div>
      </div>
    );
  }

  if (!hasAccess) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-velum-50 px-4">
        <div className="max-w-lg w-full bg-white p-10 border border-velum-200 shadow-xl text-center">
          <ShieldCheck className="mx-auto mb-4 text-velum-900" size={34} />
          <h2 className="text-2xl font-serif text-velum-900 mb-2">No autorizado</h2>
          <p className="text-sm text-velum-600 mb-6">Tu cuenta no tiene permisos para acceder al panel administrativo.</p>
          <Button onClick={logout}>Cerrar sesión</Button>
        </div>
      </div>
    );
  }

  const ActiveSectionIcon = sectionMeta[activeSection].icon;

  return (
    <div className="min-h-screen bg-velum-50 text-velum-900 relative">
      {selectedMember && renderMemberDrawer()}

      <div className="flex min-h-screen">
        <aside className={`fixed md:static top-0 left-0 z-40 h-screen w-72 ${isSidebarCollapsed ? 'md:w-24' : 'md:w-72'} bg-velum-900 text-velum-100 border-r border-velum-800 transform transition-all duration-300 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}>
          <div className="h-full flex flex-col">
            <div className={`p-5 border-b border-velum-800 transition-all ${isSidebarCollapsed ? 'md:px-3' : 'md:px-6'}`}>
              <div className={`flex items-start ${isSidebarCollapsed ? 'justify-center md:justify-between' : 'justify-between'} gap-3`}>
                <VelumLogo className={isSidebarCollapsed ? 'h-10 w-10 rounded-md object-cover' : 'h-10 w-auto'} />
                <button
                  onClick={() => setIsSidebarCollapsed((current) => !current)}
                  className="hidden md:inline-flex items-center justify-center h-8 w-8 border border-velum-600 text-velum-200 hover:text-white hover:border-velum-300 transition-colors"
                  aria-label={isSidebarCollapsed ? 'Expandir menú' : 'Contraer menú'}
                >
                  {isSidebarCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
                </button>
              </div>
              {!isSidebarCollapsed && (
                <div className="mt-4">
                  <p className="text-xs uppercase tracking-widest text-velum-300">Administrador</p>
                  <p className="text-sm font-semibold mt-1">{user?.name || user?.email}</p>
                  <p className="text-xs text-velum-400 uppercase mt-1">Puesto: {roleTitle[user?.role ?? 'staff']}</p>
                </div>
              )}
              {isSidebarCollapsed && (
                <p className="hidden md:block mt-3 text-center text-[10px] uppercase tracking-widest text-velum-400">
                  ERP
                </p>
              )}
            </div>

            <nav className="flex-1 p-3 space-y-4 overflow-y-auto">
              {sectionGroups.map((group) => (
                <div key={group.title} className="space-y-1">
                  {!isSidebarCollapsed && <p className="px-3 text-[10px] uppercase tracking-widest text-velum-400">{group.title}</p>}
                  {group.items.map((sectionKey) => {
                    const meta = sectionMeta[sectionKey];
                    const Icon = meta.icon;
                    const isActive = sectionKey === activeSection;
                    return (
                      <button
                        key={sectionKey}
                        onClick={() => {
                          setActiveSection(sectionKey);
                          setSidebarOpen(false);
                        }}
                        className={`w-full flex items-center ${isSidebarCollapsed ? 'md:justify-center' : 'justify-start'} gap-3 px-3 py-3 text-sm rounded transition-colors ${isActive ? 'bg-velum-700 text-white' : 'text-velum-300 hover:bg-velum-800 hover:text-white'}`}
                        title={meta.label}
                      >
                        <Icon size={16} />
                        {!isSidebarCollapsed && <span>{meta.label}</span>}
                      </button>
                    );
                  })}
                </div>
              ))}
            </nav>

            <div className="p-4 border-t border-velum-800 space-y-3">
              <Button
                variant="outline"
                size="sm"
                className={`border-velum-500 text-velum-100 hover:bg-velum-700 gap-2 ${isSidebarCollapsed ? 'w-full md:w-auto md:px-3 md:justify-center' : 'w-full'}`}
                onClick={logout}
                title="Cerrar sesión"
              >
                <LogOut size={14} />
                {!isSidebarCollapsed && 'Cerrar sesión'}
              </Button>
            </div>
          </div>
        </aside>

        {sidebarOpen && (
          <button
            className="fixed inset-0 bg-black/40 z-30 md:hidden"
            onClick={() => setSidebarOpen(false)}
            aria-label="Cerrar menú"
          />
        )}

        <section className="flex-1 md:ml-0 min-w-0">
          <header className="sticky top-0 z-20 bg-velum-50/95 backdrop-blur border-b border-velum-200 px-4 md:px-8 py-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button className="md:hidden text-velum-900 p-2 border border-velum-300" onClick={() => setSidebarOpen(true)} aria-label="Abrir menú">
                <Menu size={18} />
              </button>
              <div className="flex items-center gap-2">
                <ActiveSectionIcon size={16} className="text-velum-700" />
                <div>
                  <p className="text-[10px] uppercase tracking-widest text-velum-500">CRM + ERP Empresarial</p>
                  <h1 className="text-xl md:text-2xl font-serif">{sectionMeta[activeSection].label}</h1>
                </div>
              </div>
            </div>
            <Button variant="outline" size="sm" className="gap-2" onClick={loadData} disabled={isLoadingData}>
              <RefreshCw size={14} className={isLoadingData ? 'animate-spin' : ''} />
              Actualizar
            </Button>
          </header>

          <main className="p-4 md:p-8">
            {renderSection()}
          </main>
        </section>
      </div>
    </div>
  );
};
