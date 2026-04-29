import React, { useState, useCallback, useMemo } from 'react';
import { RefreshCw, CheckCheck, AlertTriangle, Activity, Users, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { AuditLogEntry } from '../types';
import { KpiCard } from './adminSharedComponents';
import { apiFetch } from '../services/apiClient';
import { DataTable, type Column, PageHeader, SectionHeading } from '../components/ui';

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

  const auditColumns = useMemo<Column<AuditLogEntry>[]>(
    () => [
      {
        id: 'timestamp',
        header: 'Timestamp',
        accessor: (log) => new Date(log.timestamp).getTime(),
        sortable: true,
        cell: (log) => (
          <span className="text-velum-400 whitespace-nowrap font-mono">
            {new Date(log.timestamp).toLocaleString('es-MX', {
              day: '2-digit',
              month: '2-digit',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </span>
        ),
      },
      {
        id: 'usuario',
        header: 'Usuario',
        accessor: (log) => log.user ?? '',
        sortable: true,
        cell: (log) => (
          <span className="text-velum-700 max-w-[140px] truncate inline-block">
            {log.user ?? '—'}
          </span>
        ),
      },
      {
        id: 'accion',
        header: 'Acción',
        accessor: (log) => log.action,
        sortable: true,
        cell: (log) => (
          <span className="text-velum-500 font-mono max-w-[200px] truncate inline-block">
            {log.action}
          </span>
        ),
      },
      {
        id: 'ip',
        header: 'IP',
        accessor: (log) => log.ip ?? '',
        sortable: true,
        cell: (log) => <span className="text-velum-400 font-mono">{log.ip ?? '—'}</span>,
      },
      {
        id: 'estado',
        header: 'Estado',
        accessor: (log) => log.status,
        sortable: true,
        cell: (log) => (
          <span
            className={`inline-flex items-center gap-1 text-xs font-medium ${log.status === 'success' ? 'text-success-700' : 'text-danger-700'}`}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${log.status === 'success' ? 'bg-success-500' : 'bg-danger-500'}`}
            />
            {log.status === 'success' ? 'OK' : 'ERROR'}
          </span>
        ),
      },
    ],
    [],
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Cumplimiento"
        description="Bitácora de auditoría y control de acceso"
        bordered={false}
        actions={
          <button onClick={handleRefresh} className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-velum-200 bg-white text-sm text-velum-600 hover:bg-velum-50 transition">
            <RefreshCw size={14} />Actualizar
          </button>
        }
      />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard icon={<CheckCheck size={18} />} label="Firmas de consentimiento" value={expedientesFirmados} accent="text-success-700" />
        <KpiCard icon={<AlertTriangle size={18} />} label="Eventos fallidos" value={failedAudits} accent={failedAudits > 0 ? 'text-danger-700' : 'text-velum-900'} />
        <KpiCard icon={<Activity size={18} />} label="Eventos sensibles" value={sensitiveEvents} />
        <KpiCard icon={<Users size={18} />} label="Usuarios con acceso" value={staffCount} />
      </div>
      {/* Bitácora */}
      <div className="space-y-3">
        <SectionHeading
          actions={
            <>
              {!loaded && (
                <button onClick={() => void loadLogs(1)}
                  className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-xl bg-velum-900 text-white hover:bg-velum-800 transition">
                  <Activity size={11} /> Cargar bitácora
                </button>
              )}
              {loading && <Loader2 size={14} className="animate-spin text-velum-400" />}
            </>
          }
        >
          Bitácora de auditoría
        </SectionHeading>

        {!loaded && !error ? (
          <div className="bg-white rounded-2xl border border-velum-100 py-12 text-center text-xs text-velum-400">
            Presiona &ldquo;Cargar bitácora&rdquo; para ver los registros
          </div>
        ) : (
          <>
            <DataTable
              aria-label="Bitácora de auditoría"
              data={logs}
              columns={auditColumns}
              rowKey={(log) => log.id ?? `${log.timestamp}-${log.action}`}
              isLoading={loading && logs.length === 0}
              error={error || null}
              defaultSort={{ id: 'timestamp', dir: 'desc' }}
              empty={{
                title: 'Sin registros',
                description: 'No hay eventos de auditoría disponibles para mostrar.',
              }}
            />
            {pages > 1 && (
              <div className="flex items-center justify-between">
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
