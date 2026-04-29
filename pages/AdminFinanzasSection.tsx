import React, { useMemo } from 'react';
import { Wallet, Target, Users, AlertTriangle } from 'lucide-react';
import { Member } from '../types';
import { KpiCard, Pill } from './adminSharedComponents';
import { statusLabel, statusPill } from './adminUtils';
import { DataTable, type Column, PageHeader, SectionHeading } from '../components/ui';

const formatMoney = (amount: number) =>
  new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(amount);

interface Analytics {
  mrr: number;
  arpu: number;
  sociosActivos: number;
  collectionQueue: Member[];
}

interface Props {
  members: Member[];
  analytics: Analytics;
  onOpenMember: (m: Member) => void;
}

export const AdminFinanzasSection: React.FC<Props> = ({ members, analytics, onOpenMember }) => {
  const topMembers = useMemo(
    () => [...members].sort((a, b) => (b.amount ?? 0) - (a.amount ?? 0)).slice(0, 20),
    [members],
  );

  // Columnas memoizadas — DataTable las consume estable y evita re-sort.
  const columns = useMemo<Column<Member>[]>(
    () => [
      {
        id: 'idx',
        header: '#',
        accessor: () => null, // index visual, no se ordena
        width: '48px',
        cell: () => null, // sobrescrito abajo con renderIndex
        sortable: false,
      },
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
        id: 'estado',
        header: 'Estado',
        accessor: (m) => m.subscriptionStatus ?? '',
        sortable: true,
        cell: (m) => (
          <Pill label={statusLabel(m.subscriptionStatus)} cls={statusPill(m.subscriptionStatus)} />
        ),
      },
    ],
    [],
  );

  // El index visual se inyecta como cell override por fila — necesitamos saber
  // la posición tras sort, así que en lugar de columna fija usamos un wrapper.
  // Solución simple: dejamos columna #, pero con cell que mapea por id.
  const rankByMember = useMemo(() => {
    const map = new Map<string, number>();
    topMembers.forEach((m, i) => map.set(m.id, i + 1));
    return map;
  }, [topMembers]);

  const finalColumns = useMemo<Column<Member>[]>(() => {
    return columns.map((c) =>
      c.id === 'idx'
        ? {
            ...c,
            cell: (m) => (
              <span className="text-velum-400 text-xs tabular-nums">{rankByMember.get(m.id)}</span>
            ),
          }
        : c,
    );
  }, [columns, rankByMember]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Finanzas"
        description="Radar de ingresos y facturación"
        bordered={false}
      />
      {analytics.mrr === 0 && analytics.sociosActivos === 0 && (
        <div className="flex items-start gap-3 p-4 rounded-2xl bg-blue-50 border border-blue-200 text-blue-800 text-sm">
          <AlertTriangle size={16} className="shrink-0 mt-0.5" />
          <span>Los datos financieros aparecerán aquí una vez que haya socias con membresías activas y pagos procesados por Stripe.</span>
        </div>
      )}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard icon={<Wallet size={18} />} label="MRR total" value={formatMoney(analytics.mrr)} accent="text-success-700" />
        <KpiCard icon={<Target size={18} />} label="ARPU" value={formatMoney(analytics.arpu)} />
        <KpiCard icon={<Users size={18} />} label="Socios activos" value={analytics.sociosActivos} />
        <KpiCard icon={<AlertTriangle size={18} />} label="En cobranza" value={analytics.collectionQueue.length} accent={analytics.collectionQueue.length > 0 ? 'text-danger-700' : 'text-velum-900'} />
      </div>
      <div>
        <SectionHeading>Top socios por monto</SectionHeading>
        <DataTable
          aria-label="Top socios por monto"
          data={topMembers}
          columns={finalColumns}
          rowKey={(m) => m.id}
          onRowClick={onOpenMember}
          searchable
          searchPlaceholder="Buscar por nombre, email o plan..."
          defaultSort={{ id: 'monto', dir: 'desc' }}
          empty={{ title: 'Sin socios', description: 'Aún no hay membresías activas con pagos.' }}
        />
      </div>
    </div>
  );
};
