import React from 'react';
import { CalendarDays, Activity, ArrowRight, AlertTriangle, CircleAlert, Users, ClipboardList } from 'lucide-react';
import { AuditLogEntry } from '../types';
import { apptStatusLabel } from './adminUtils';
import { Card, Badge, EmptyState, PageHeader, Tooltip, type BadgeIntent } from '../components/ui';

type HealthFlag = 'ok' | 'warning' | 'critical';
type AdminSection = 'panel' | 'socias' | 'agenda' | 'expedientes' | 'pagos' | 'kpis' | 'finanzas' | 'riesgos' | 'cumplimiento' | 'ajustes';

interface ControlAlert {
  id: string;
  level: HealthFlag;
  title: string;
  detail: string;
  section: AdminSection;
}

interface DayAppt {
  id: string;
  startAt: string;
  status: string;
  userId?: string | null;
}

interface Analytics {
  sociosActivos: number;
  totalSocios: number;
  expedientesPendientes: number;
}

interface AgendaSummary {
  appointmentsToday: number;
  completedToday: number;
}

interface Props {
  userName: string;
  analytics: Analytics;
  agendaSummary: AgendaSummary;
  controlAlerts: ControlAlert[];
  dayAppointments: DayAppt[];
  memberById: Map<string, { name?: string; email?: string }>;
  auditLogs: AuditLogEntry[];
  onNavigate: (section: AdminSection) => void;
  onNavigateToAudit: () => void;
}

// ── Helpers ──────────────────────────────────────────────────────────────────
const alertIntent = (level: HealthFlag): BadgeIntent =>
  level === 'critical' ? 'danger' : level === 'warning' ? 'warning' : 'success';

// ── Componente principal ─────────────────────────────────────────────────────
export const AdminPanelSection: React.FC<Props> = ({
  userName,
  analytics,
  agendaSummary,
  controlAlerts,
  dayAppointments,
  memberById,
  auditLogs,
  onNavigate,
  onNavigateToAudit,
}) => {
  const todayLabel = new Date().toLocaleDateString('es-MX', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
  const actionAlerts = controlAlerts.filter((a) => a.level !== 'ok');

  // KPI primarios — cada uno navegable a su sección con tooltip explicativo
  const primaryKpis = [
    {
      label: 'Socias activas',
      value: analytics.sociosActivos,
      sub: `de ${analytics.totalSocios} registradas`,
      tooltip: 'Miembros con membresía activa o en grace period.',
      icon: <Users size={16} />,
      section: 'socias' as AdminSection,
      tone: 'neutral' as const,
    },
    {
      label: 'Citas hoy',
      value: agendaSummary.appointmentsToday,
      sub: `${agendaSummary.completedToday} completadas`,
      tooltip: 'Citas confirmadas o asistidas para el día actual.',
      icon: <CalendarDays size={16} />,
      section: 'agenda' as AdminSection,
      tone: 'neutral' as const,
    },
    {
      label: 'Expedientes pendientes',
      value: analytics.expedientesPendientes,
      sub: 'requieren revisión clínica',
      tooltip: 'Pacientes con expediente médico pendiente de aprobación.',
      icon: <ClipboardList size={16} />,
      section: 'expedientes' as AdminSection,
      tone: (analytics.expedientesPendientes > 0 ? 'warning' : 'success') as 'warning' | 'success',
    },
  ];

  return (
    <div className="space-y-8">
      {/* ── Page header con greeting y fecha ───────────────────────────────── */}
      <PageHeader
        eyebrow={todayLabel}
        title={`Hola, ${userName}`}
        description="Resumen operativo en tiempo real — atajos a todas las secciones del panel."
        bordered={false}
      />

      {/* ── KPIs primarios — interactive cards ─────────────────────────────── */}
      <section aria-labelledby="kpis-heading">
        <h2 id="kpis-heading" className="sr-only">Métricas clave</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {primaryKpis.map((kpi) => (
            <Tooltip key={kpi.label} content={kpi.tooltip} placement="bottom" delay={500}>
              <Card
                variant="bordered"
                padding="md"
                interactive
                onClick={() => onNavigate(kpi.section)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onNavigate(kpi.section);
                  }
                }}
                role="button"
                aria-label={`${kpi.label}: ${kpi.value}. ${kpi.sub}. Ir a ${kpi.label}`}
                className="group"
              >
                <div className="flex items-start justify-between mb-3">
                  <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-velum-500">
                    {kpi.label}
                  </p>
                  <span
                    className={[
                      'flex items-center justify-center h-7 w-7 rounded-full transition-colors duration-base ease-standard',
                      kpi.tone === 'warning'
                        ? 'bg-warning-50 text-warning-700'
                        : kpi.tone === 'success'
                          ? 'bg-success-50 text-success-700'
                          : 'bg-velum-100 text-velum-700 group-hover:bg-velum-200',
                    ].join(' ')}
                  >
                    {kpi.icon}
                  </span>
                </div>
                <p
                  className={[
                    'font-sans font-bold tabular-nums text-4xl leading-none tracking-[-0.025em]',
                    kpi.tone === 'warning' ? 'text-warning-700' : kpi.tone === 'success' ? 'text-success-700' : 'text-velum-900 dark:text-velum-50',
                  ].join(' ')}
                >
                  {kpi.value}
                </p>
                <p className="text-xs text-velum-500 mt-3 flex items-center gap-1.5 group-hover:text-velum-900 transition-colors duration-base ease-standard">
                  {kpi.sub}
                  <ArrowRight
                    size={11}
                    className="transition-transform duration-base ease-standard group-hover:translate-x-0.5"
                  />
                </p>
              </Card>
            </Tooltip>
          ))}
        </div>
      </section>

      {/* ── Action alerts ──────────────────────────────────────────────────── */}
      {actionAlerts.length > 0 && (
        <section aria-labelledby="alerts-heading">
          <div className="flex items-center justify-between mb-3">
            <h2 id="alerts-heading" className="text-[10px] font-bold uppercase tracking-[0.18em] text-velum-500">
              Requieren atención
            </h2>
            <Badge intent={actionAlerts.some((a) => a.level === 'critical') ? 'danger' : 'warning'} dot>
              {actionAlerts.length}
            </Badge>
          </div>
          <div className="space-y-2">
            {actionAlerts.map((alert) => {
              const intent = alertIntent(alert.level);
              const isWarning = alert.level === 'warning';
              return (
                <div
                  key={alert.id}
                  className={[
                    'flex items-center gap-3 px-4 py-3.5 rounded-lg border transition-all duration-base ease-standard',
                    isWarning
                      ? 'bg-warning-50 border-warning-100 hover:border-warning-500/40'
                      : 'bg-danger-50 border-danger-100 hover:border-danger-500/40',
                  ].join(' ')}
                >
                  <div
                    className={[
                      'shrink-0 flex items-center justify-center h-8 w-8 rounded-full',
                      isWarning ? 'bg-warning-100 text-warning-700' : 'bg-danger-100 text-danger-700',
                    ].join(' ')}
                    aria-hidden="true"
                  >
                    {isWarning ? <CircleAlert size={15} /> : <AlertTriangle size={15} />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p
                      className={[
                        'text-sm font-semibold leading-tight',
                        isWarning ? 'text-warning-700' : 'text-danger-700',
                      ].join(' ')}
                    >
                      {alert.title}
                    </p>
                    <p
                      className={[
                        'text-xs mt-0.5 leading-relaxed',
                        isWarning ? 'text-warning-700/80' : 'text-danger-700/80',
                      ].join(' ')}
                    >
                      {alert.detail}
                    </p>
                  </div>
                  {alert.section !== 'panel' && (
                    <button
                      onClick={() => {
                        if (alert.section === 'ajustes') onNavigateToAudit();
                        else onNavigate(alert.section);
                      }}
                      className={[
                        'group shrink-0 inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest px-3 py-1.5 rounded-full transition-all duration-base ease-standard',
                        'focus:outline-none focus-visible:shadow-focus',
                        isWarning
                          ? 'bg-warning-100 text-warning-700 hover:bg-warning-500 hover:text-white'
                          : 'bg-danger-100 text-danger-700 hover:bg-danger-500 hover:text-white',
                      ].join(' ')}
                    >
                      Ver
                      <ArrowRight
                        size={11}
                        className="transition-transform duration-base ease-standard group-hover:translate-x-0.5"
                      />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* ── Agenda + Actividad reciente (2-col) ────────────────────────────── */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Agenda hoy */}
        <section aria-labelledby="agenda-heading">
          <div className="flex items-center justify-between mb-3">
            <h2 id="agenda-heading" className="text-[10px] font-bold uppercase tracking-[0.18em] text-velum-500">
              Agenda de hoy
            </h2>
            <button
              onClick={() => onNavigate('agenda')}
              className="group inline-flex items-center gap-1 text-xs text-velum-500 hover:text-velum-900 transition-colors duration-base ease-standard focus:outline-none focus-visible:shadow-focus rounded px-1 py-0.5"
            >
              Ver agenda
              <ArrowRight
                size={11}
                className="transition-transform duration-base ease-standard group-hover:translate-x-0.5"
              />
            </button>
          </div>
          <Card variant="bordered" padding="none">
            {dayAppointments.length === 0 ? (
              <EmptyState
                icon={<CalendarDays />}
                title="Sin citas hoy"
                description="No hay citas programadas para el día actual."
                size="comfortable"
              />
            ) : (
              <div className="divide-y divide-velum-50">
                {dayAppointments.slice(0, 6).map((appt) => {
                  const m = memberById.get(appt.userId ?? '');
                  const s = apptStatusLabel(appt.status);
                  return (
                    <div
                      key={appt.id}
                      className="flex items-center gap-3 px-4 py-3 hover:bg-velum-50/50 transition-colors duration-base ease-standard"
                    >
                      <p className="text-xs font-mono text-velum-700 w-12 shrink-0 font-medium">
                        {new Date(appt.startAt).toLocaleTimeString('es-MX', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </p>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-velum-900 truncate">
                          {m?.name || m?.email || 'Paciente'}
                        </p>
                      </div>
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${s.cls}`}
                      >
                        {s.label}
                      </span>
                    </div>
                  );
                })}
                {dayAppointments.length > 6 && (
                  <button
                    onClick={() => onNavigate('agenda')}
                    className="w-full py-3 text-xs text-velum-500 hover:text-velum-900 hover:bg-velum-50 transition-colors duration-base ease-standard font-medium border-t border-velum-100"
                  >
                    +{dayAppointments.length - 6} más → Ver agenda completa
                  </button>
                )}
              </div>
            )}
          </Card>
        </section>

        {/* Actividad reciente */}
        <section aria-labelledby="audit-heading">
          <div className="flex items-center justify-between mb-3">
            <h2 id="audit-heading" className="text-[10px] font-bold uppercase tracking-[0.18em] text-velum-500">
              Actividad reciente
            </h2>
            <button
              onClick={onNavigateToAudit}
              className="group inline-flex items-center gap-1 text-xs text-velum-500 hover:text-velum-900 transition-colors duration-base ease-standard focus:outline-none focus-visible:shadow-focus rounded px-1 py-0.5"
            >
              Ver todo
              <ArrowRight
                size={11}
                className="transition-transform duration-base ease-standard group-hover:translate-x-0.5"
              />
            </button>
          </div>
          <Card variant="bordered" padding="none">
            {auditLogs.length === 0 ? (
              <EmptyState
                icon={<Activity />}
                title="Sin actividad"
                description="Las acciones del equipo aparecerán aquí en tiempo real."
                size="comfortable"
              />
            ) : (
              <div className="divide-y divide-velum-50">
                {auditLogs.slice(0, 6).map((log, i) => (
                  <div
                    key={log.id ?? i}
                    className="flex items-center gap-3 px-4 py-2.5 hover:bg-velum-50/50 transition-colors duration-base ease-standard"
                  >
                    <span
                      className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                        log.status === 'success' ? 'bg-success-500' : 'bg-danger-500'
                      }`}
                      aria-label={log.status === 'success' ? 'Exitoso' : 'Falló'}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-mono text-velum-700 truncate">{log.action}</p>
                      <p className="text-[10px] text-velum-500">{log.user ?? '—'}</p>
                    </div>
                    <p className="text-[10px] text-velum-400 shrink-0 whitespace-nowrap font-mono">
                      {new Date(log.timestamp).toLocaleTimeString('es-MX', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </section>
      </div>
    </div>
  );
};
