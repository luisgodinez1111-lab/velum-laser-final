import React from 'react';
import { RefreshCw, CheckCheck, AlertTriangle, Activity, Users } from 'lucide-react';
import { AuditLogEntry } from '../types';
import { KpiCard } from './adminSharedComponents';

interface Props {
  expedientesFirmados: number;
  failedAudits: number;
  sensitiveEvents: number;
  staffCount: number;
  auditLogs: AuditLogEntry[];
  onRefresh: () => void;
}

export const AdminCumplimientoSection: React.FC<Props> = ({
  expedientesFirmados,
  failedAudits,
  sensitiveEvents,
  staffCount,
  auditLogs,
  onRefresh,
}) => (
  <div className="space-y-6">
    <div className="flex items-center justify-between">
      <div>
        <h1 className="text-2xl font-serif text-velum-900">Cumplimiento</h1>
        <p className="text-sm text-velum-500 mt-1">Bitácora de auditoría y control de acceso</p>
      </div>
      <button onClick={onRefresh} className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-velum-200 bg-white text-sm text-velum-600 hover:bg-velum-50 transition">
        <RefreshCw size={14} />Actualizar
      </button>
    </div>
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <KpiCard icon={<CheckCheck size={18} />} label="Firmas de consentimiento" value={expedientesFirmados} accent="text-emerald-700" />
      <KpiCard icon={<AlertTriangle size={18} />} label="Eventos fallidos" value={failedAudits} accent={failedAudits > 0 ? 'text-red-600' : 'text-velum-900'} />
      <KpiCard icon={<Activity size={18} />} label="Eventos sensibles" value={sensitiveEvents} />
      <KpiCard icon={<Users size={18} />} label="Usuarios con acceso" value={staffCount} />
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
