import React, { useMemo } from 'react';
import { Download, Wallet, HandCoins, CheckCheck, Users, AlertTriangle, CheckCircle2, Search, Loader2, BarChart3, FileText } from 'lucide-react';
import { Member } from '../types';
import { KpiCard, Pill } from './adminSharedComponents';
import { statusLabel, statusPill, riskOfMember } from './adminUtils';
import { DataTable, type Column, PageHeader, SectionHeading, SectionNav, type SectionNavItem } from '../components/ui';

const formatMoney = (amount: number) =>
  new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(amount);

interface ServerReports {
  users: number;
  activeMemberships: number;
  pastDueMemberships: number;
  pendingDocuments: number;
}

interface Analytics {
  collectionQueue: Member[];
  sociosActivos: number;
}

interface HistPayment {
  id: string;
  createdAt: string;
  user?: { email?: string };
  amount?: number;
  currency?: string;
  status: string;
  paidAt?: string | null;
}

interface Props {
  analytics: Analytics;
  serverReports: ServerReports | null;
  histPayments: HistPayment[];
  histTotal: number;
  histPage: number;
  histPages: number;
  histLoading: boolean;
  histLoaded: boolean;
  histError: string;
  histDateFrom: string;
  histDateTo: string;
  histStatus: string;
  onDateFromChange: (v: string) => void;
  onDateToChange: (v: string) => void;
  onStatusChange: (v: string) => void;
  onSearch: (page: number) => void;
  onDownloadCSV: () => void;
  onOpenMember: (m: Member) => void;
  onRegularize: (id: string, status: 'active') => void;
}

export const AdminPagosSection: React.FC<Props> = ({
  analytics, serverReports,
  histPayments, histTotal, histPage, histPages, histLoading, histLoaded, histError,
  histDateFrom, histDateTo, histStatus,
  onDateFromChange, onDateToChange, onStatusChange, onSearch, onDownloadCSV,
  onOpenMember, onRegularize,
}) => {
  const queue = analytics.collectionQueue;
  const totalRisk = queue.reduce((acc, m) => acc + (m.amount ?? 0), 0);

  // Anchor nav — solo se muestra cuando hay >1 sección visible.
  const navItems: SectionNavItem[] = [
    ...(serverReports ? [{ id: 'resumen', label: 'Resumen sistema', icon: <BarChart3 size={11} /> }] : []),
    { id: 'cobranza', label: 'Cola de cobranza', icon: <HandCoins size={11} /> },
    { id: 'historial', label: 'Historial', icon: <Wallet size={11} /> },
  ];

  // ─── Columnas: cola de cobranza ─────────────────────────────────────────
  const queueColumns = useMemo<Column<Member>[]>(
    () => [
      {
        id: 'socio',
        header: 'Socio',
        accessor: (m) => m.name ?? m.email ?? '',
        sortable: true,
        cell: (m) => (
          <div>
            <p className="font-medium text-velum-900">{m.name}</p>
            <p className="text-xs text-velum-400">{m.email}</p>
          </div>
        ),
      },
      {
        id: 'estado',
        header: 'Estado',
        accessor: (m) => m.subscriptionStatus ?? '',
        sortable: true,
        cell: (m) => (
          <Pill label={statusLabel(m.subscriptionStatus)} cls={statusPill(m.subscriptionStatus)} />
        ),
      },
      {
        id: 'plan',
        header: 'Plan',
        accessor: (m) => m.plan ?? '',
        sortable: true,
        cell: (m) => <span className="text-velum-600">{m.plan ?? '—'}</span>,
      },
      {
        id: 'monto',
        header: 'Monto',
        accessor: (m) => m.amount ?? 0,
        sortable: true,
        align: 'right',
        cell: (m) => (
          <span className="font-medium text-velum-900">
            {m.amount ? formatMoney(m.amount) : '—'}
          </span>
        ),
      },
      {
        id: 'riesgo',
        header: 'Riesgo',
        accessor: (m) => (riskOfMember(m) === 'critical' ? 0 : 1),
        sortable: true,
        cell: (m) => {
          const risk = riskOfMember(m);
          return (
            <span
              className={`inline-flex items-center gap-1.5 text-xs font-medium ${risk === 'critical' ? 'text-red-600' : 'text-amber-600'}`}
            >
              <span
                className={`w-2 h-2 rounded-full ${risk === 'critical' ? 'bg-red-500' : 'bg-amber-400'}`}
              />
              {risk === 'critical' ? 'Crítico' : 'Atención'}
            </span>
          );
        },
      },
      {
        id: 'acciones',
        header: 'Acciones',
        accessor: () => null,
        cell: (m) => (
          <div className="flex gap-2">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onRegularize(m.id, 'active');
              }}
              className="text-xs px-2.5 py-1 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 transition"
            >
              Regularizar
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onOpenMember(m);
              }}
              className="text-xs px-2.5 py-1 rounded-lg border border-velum-200 text-velum-600 hover:bg-velum-50 transition"
            >
              Ver
            </button>
          </div>
        ),
      },
    ],
    [onOpenMember, onRegularize],
  );

  // ─── Columnas: historial de pagos ───────────────────────────────────────
  const histColumns = useMemo<Column<HistPayment>[]>(
    () => [
      {
        id: 'fecha',
        header: 'Fecha',
        accessor: (p) => new Date(p.createdAt).getTime(),
        sortable: true,
        cell: (p) => (
          <span className="text-velum-500 text-xs">
            {new Date(p.createdAt).toLocaleDateString('es-MX')}
          </span>
        ),
      },
      {
        id: 'usuario',
        header: 'Usuario',
        accessor: (p) => p.user?.email ?? '',
        sortable: true,
        cell: (p) => <span className="font-medium text-velum-900 text-xs">{p.user?.email ?? '—'}</span>,
      },
      {
        id: 'monto',
        header: 'Monto',
        accessor: (p) => p.amount ?? 0,
        sortable: true,
        align: 'right',
        cell: (p) => (
          <span className="font-semibold text-velum-900">
            {p.amount != null ? formatMoney(p.amount) : '—'}
          </span>
        ),
      },
      {
        id: 'currency',
        header: 'Divisa',
        accessor: (p) => p.currency ?? '',
        sortable: true,
        cell: (p) => <span className="text-velum-500 uppercase text-xs">{p.currency ?? '—'}</span>,
      },
      {
        id: 'status',
        header: 'Estado',
        accessor: (p) => p.status,
        sortable: true,
        cell: (p) => (
          <span
            className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
              p.status === 'paid'
                ? 'bg-emerald-50 text-emerald-700'
                : p.status === 'failed'
                  ? 'bg-red-50 text-red-600'
                  : p.status === 'refunded'
                    ? 'bg-blue-50 text-blue-600'
                    : 'bg-amber-50 text-amber-700'
            }`}
          >
            {p.status}
          </span>
        ),
      },
      {
        id: 'paidAt',
        header: 'Pagado en',
        accessor: (p) => (p.paidAt ? new Date(p.paidAt).getTime() : 0),
        sortable: true,
        cell: (p) => (
          <span className="text-velum-500 text-xs">
            {p.paidAt ? new Date(p.paidAt).toLocaleDateString('es-MX') : '—'}
          </span>
        ),
      },
    ],
    [],
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Pagos"
        description="Estado de cuentas y cobranza"
        bordered={false}
        actions={
          <button onClick={onDownloadCSV}
            className="flex items-center gap-2 px-3 py-2 rounded-xl border border-velum-200 text-velum-600 text-xs font-medium hover:bg-velum-50 transition">
            <Download size={13} />
            Exportar CSV
          </button>
        }
      />

      <SectionNav items={navItems} />

      {/* Server reports */}
      {serverReports && (
        <div>
          <SectionHeading id="resumen" icon={<BarChart3 size={11} />}>
            Resumen del sistema
          </SectionHeading>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <KpiCard icon={<Users size={18} />} label="Total usuarios" value={serverReports.users} />
            <KpiCard icon={<CheckCircle2 size={18} />} label="Membresías activas" value={serverReports.activeMemberships} accent="text-emerald-700" />
            <KpiCard icon={<AlertTriangle size={18} />} label="Pago vencido" value={serverReports.pastDueMemberships} accent={serverReports.pastDueMemberships > 0 ? 'text-red-600' : 'text-velum-900'} />
            <KpiCard icon={<FileText size={18} />} label="Docs. pendientes" value={serverReports.pendingDocuments} accent={serverReports.pendingDocuments > 0 ? 'text-amber-600' : 'text-velum-900'} />
          </div>
        </div>
      )}

      {/* Collection queue */}
      <div>
        <SectionHeading id="cobranza" icon={<HandCoins size={11} />}>
          Cola de cobranza
        </SectionHeading>
        <div className="grid grid-cols-3 gap-4">
          <KpiCard icon={<HandCoins size={18} />} label="Por recuperar" value={queue.length} accent={queue.length > 0 ? 'text-red-600' : 'text-velum-900'} />
          <KpiCard icon={<Wallet size={18} />} label="Monto en riesgo" value={formatMoney(totalRisk)} accent="text-amber-600" />
          <KpiCard icon={<CheckCheck size={18} />} label="Activos" value={analytics.sociosActivos} accent="text-emerald-700" />
        </div>
      </div>
      <DataTable
        aria-label="Cola de cobranza"
        data={queue}
        columns={queueColumns}
        rowKey={(m) => m.id}
        defaultSort={{ id: 'monto', dir: 'desc' }}
        empty={{
          title: 'Sin cuentas en cobranza',
          description: 'Todas las membresías activas están al corriente.',
        }}
      />

      {/* Payment history */}
      <div>
        <SectionHeading id="historial" icon={<Wallet size={11} />}>
          Historial de pagos
        </SectionHeading>
        <div className="bg-white rounded-2xl border border-velum-100 p-4 space-y-3">
          <div className="flex flex-wrap gap-2 items-end">
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-semibold text-velum-400 uppercase tracking-widest">Desde</label>
              <input type="date" value={histDateFrom} onChange={e => onDateFromChange(e.target.value)}
                className="rounded-xl border border-velum-200 px-3 py-1.5 text-sm text-velum-800 focus:outline-none focus:border-velum-400" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-semibold text-velum-400 uppercase tracking-widest">Hasta</label>
              <input type="date" value={histDateTo} onChange={e => onDateToChange(e.target.value)}
                className="rounded-xl border border-velum-200 px-3 py-1.5 text-sm text-velum-800 focus:outline-none focus:border-velum-400" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-semibold text-velum-400 uppercase tracking-widest">Estado</label>
              <select value={histStatus} onChange={e => onStatusChange(e.target.value)}
                className="rounded-xl border border-velum-200 px-3 py-1.5 text-sm text-velum-800 focus:outline-none focus:border-velum-400">
                <option value="">Todos</option>
                <option value="paid">Pagado</option>
                <option value="pending">Pendiente</option>
                <option value="failed">Fallido</option>
                <option value="refunded">Reembolsado</option>
              </select>
            </div>
            <button onClick={() => onSearch(1)} disabled={histLoading}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-velum-900 text-white text-xs font-semibold hover:bg-velum-800 transition disabled:opacity-50">
              {histLoading ? <Loader2 size={13} className="animate-spin" /> : <Search size={13} />}
              Buscar
            </button>
          </div>

          {!histLoaded && !histError ? (
            <p className="text-center text-sm text-velum-400 py-6">Aplica filtros y presiona Buscar</p>
          ) : (
            <>
              <DataTable
                aria-label="Historial de pagos"
                data={histPayments}
                columns={histColumns}
                rowKey={(p) => p.id}
                isLoading={histLoading}
                error={histError || null}
                empty={{
                  title: 'Sin pagos en el rango seleccionado',
                  description: 'Ajusta los filtros y vuelve a buscar.',
                }}
              />
              {histPages > 1 && (
                <div className="flex items-center justify-between mt-3 px-1">
                  <p className="text-[11px] text-velum-400">
                    {histTotal} registro{histTotal !== 1 ? 's' : ''} · página {histPage} de {histPages}
                  </p>
                  <div className="flex gap-1">
                    <button onClick={() => onSearch(histPage - 1)} disabled={histPage <= 1 || histLoading}
                      className="px-2.5 py-1 rounded-lg border border-velum-200 text-xs text-velum-600 hover:bg-velum-50 disabled:opacity-40 transition">‹ Anterior</button>
                    <button onClick={() => onSearch(histPage + 1)} disabled={histPage >= histPages || histLoading}
                      className="px-2.5 py-1 rounded-lg border border-velum-200 text-xs text-velum-600 hover:bg-velum-50 disabled:opacity-40 transition">Siguiente ›</button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
