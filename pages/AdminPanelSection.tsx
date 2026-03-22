import React from 'react';
import { CalendarDays, Activity, ArrowRight, AlertTriangle, CircleAlert } from 'lucide-react';
import { AuditLogEntry } from '../types';
import { apptStatusLabel } from './adminUtils';

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

export const AdminPanelSection: React.FC<Props> = ({
  userName, analytics, agendaSummary, controlAlerts,
  dayAppointments, memberById, auditLogs, onNavigate, onNavigateToAudit,
}) => {
  const todayLabel = new Date().toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' });
  const actionAlerts = controlAlerts.filter((a) => a.level !== 'ok');

  return (
    <div className="space-y-8">
      {/* Greeting */}
      <div>
        <p className="text-xs text-velum-400 capitalize">{todayLabel}</p>
        <h1 className="text-2xl font-serif text-velum-900 mt-0.5">Hola, {userName}</h1>
      </div>

      {/* 3 primary metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { label: 'Socias activas', value: analytics.sociosActivos, sub: `de ${analytics.totalSocios} registradas`, accent: 'text-velum-900', section: 'socias' as AdminSection },
          { label: 'Citas hoy', value: agendaSummary.appointmentsToday, sub: `${agendaSummary.completedToday} completadas`, accent: 'text-velum-900', section: 'agenda' as AdminSection },
          { label: 'Expedientes pendientes', value: analytics.expedientesPendientes, sub: 'requieren revisión clínica', accent: analytics.expedientesPendientes > 0 ? 'text-amber-600' : 'text-emerald-600', section: 'expedientes' as AdminSection },
        ].map(({ label, value, sub, accent, section }) => (
          <button key={label} onClick={() => onNavigate(section)}
            className="bg-white rounded-2xl border border-velum-100 p-5 text-left hover:border-velum-300 hover:shadow-sm transition group">
            <p className="text-[10px] font-bold uppercase tracking-widest text-velum-400 mb-2">{label}</p>
            <p className={`text-4xl font-serif font-bold ${accent}`}>{value}</p>
            <p className="text-xs text-velum-400 mt-1.5 group-hover:text-velum-600 transition flex items-center gap-1">
              {sub} <ArrowRight size={11} />
            </p>
          </button>
        ))}
      </div>

      {/* Action alerts */}
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
                    if (alert.section === 'ajustes') { onNavigateToAudit(); } else { onNavigate(alert.section); }
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

      {/* Two-column: agenda + actividad */}
      <div className="grid lg:grid-cols-2 gap-6">
        <div>
          <div className="flex items-center justify-between mb-3">
            <p className="text-[10px] font-bold uppercase tracking-widest text-velum-400">Agenda de hoy</p>
            <button onClick={() => onNavigate('agenda')} className="text-xs text-velum-400 hover:text-velum-900 transition flex items-center gap-1">
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
                  <button onClick={() => onNavigate('agenda')}
                    className="w-full py-2.5 text-xs text-velum-400 hover:text-velum-700 hover:bg-velum-50 transition">
                    +{dayAppointments.length - 6} más → Ver agenda completa
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-3">
            <p className="text-[10px] font-bold uppercase tracking-widest text-velum-400">Actividad reciente</p>
            <button onClick={onNavigateToAudit}
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
