import React, { useState, useCallback } from 'react';
import { RefreshCw, CheckCheck, AlertTriangle, Activity, Users, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { AuditLogEntry } from '../types';
import { KpiCard } from './adminSharedComponents';
import { apiFetch } from '../services/apiClient';

interface Props {
  expedientesFirmados: number;
  failedAudits: number;
  sensitiveEvents: number;
  staffCount: number;
  onRefresh: () => void;
}

const AUDIT_LIMIT = 50;

export const AdminCumplimientoSection: React.FC<Props> = ({
  expedientesFirmados,
  failedAudits,
  sensitiveEvents,
  staffCount,
  onRefresh,
}) => {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');

  const loadLogs = useCallback(async (p: number) => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ limit: String(AUDIT_LIMIT), page: String(p) });
      const data = await apiFetch<any>(`/v1/audit-logs?${params}`);
      setLogs(data?.logs ?? []);
      setTotal(data?.total ?? 0);
      setPages(data?.pages ?? 1);
      setPage(p);
      setLoaded(true);
    } catch (e: any) {
      setError(e?.message ?? 'No se pudo cargar la bitácora');
    } finally {
      setLoading(false);
    }
  }, []);

  const handleRefresh = () => {
    onRefresh();
    void loadLogs(page);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-serif text-velum-900">Cumplimiento</h1>
          <p className="text-sm text-velum-500 mt-1">Bitácora de auditoría y control de acceso</p>
        </div>
        <button onClick={handleRefresh} className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-velum-200 bg-white text-sm text-velum-600 hover:bg-velum-50 transition">
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
        <div className="px-5 py-4 border-b border-velum-100 flex items-center justify-between">
          <p className="text-xs font-bold uppercase tracking-widest text-velum-500">Bitácora de auditoría</p>
          {!loaded && (
            <button onClick={() => void loadLogs(1)}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-xl bg-velum-900 text-white hover:bg-velum-800 transition">
              <Activity size={11} /> Cargar bitácora
            </button>
          )}
          {loading && <Loader2 size={14} className="animate-spin text-velum-400" />}
        </div>
        {error && (
          <div className="flex items-center gap-2 m-4 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs">
            <AlertTriangle size={13} /> {error}
          </div>
        )}
        {!loaded && !error ? (
          <div className="py-12 text-center text-xs text-velum-400">Presiona "Cargar bitácora" para ver los registros</div>
        ) : loaded && logs.length === 0 ? (
          <div className="py-12 text-center text-xs text-velum-400">Sin registros de auditoría disponibles</div>
        ) : loaded && (
          <>
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
                  {logs.map((log, i) => (
                    <tr key={log.id ?? i} className={`hover:bg-velum-50 transition ${i < logs.length - 1 ? 'border-b border-velum-50' : ''}`}>
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
            {pages > 1 && (
              <div className="flex items-center justify-between px-5 py-3 border-t border-velum-100">
                <p className="text-[11px] text-velum-400">{total} registros · página {page} de {pages}</p>
                <div className="flex gap-1">
                  <button onClick={() => void loadLogs(page - 1)} disabled={page <= 1 || loading}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg border border-velum-200 text-xs text-velum-600 hover:bg-velum-50 disabled:opacity-40 transition">
                    <ChevronLeft size={12} /> Anterior
                  </button>
                  <button onClick={() => void loadLogs(page + 1)} disabled={page >= pages || loading}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg border border-velum-200 text-xs text-velum-600 hover:bg-velum-50 disabled:opacity-40 transition">
                    Siguiente <ChevronRight size={12} />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};
