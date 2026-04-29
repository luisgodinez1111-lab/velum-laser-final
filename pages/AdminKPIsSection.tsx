import React, { useMemo } from 'react';
import { Users, Wallet, Target, AlertTriangle, FileText, Clock3 } from 'lucide-react';
import { Member } from '../types';
import { KpiCard } from './adminSharedComponents';
import { DataTable, type Column, PageHeader, SectionHeading } from '../components/ui';

const formatMoney = (amount: number) =>
  new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(amount);

interface Analytics {
  totalSocios: number;
  sociosActivos: number;
  sociosPendientes: number;
  mrr: number;
  arpu: number;
  churnRisk: number;
  sociosConRiesgo: number;
  expedientesFirmados: number;
  renewalsIn7Days: number;
}

interface PlanRow {
  plan: string;
  members: number;
  revenue: number;
}

interface Props {
  analytics: Analytics;
  planBreakdown: PlanRow[];
}

export const AdminKPIsSection: React.FC<Props> = ({ analytics, planBreakdown }) => {
  // mrr es estable durante el render — capturamos en closure de la columna.
  const mrr = analytics.mrr;
  const columns = useMemo<Column<PlanRow>[]>(
    () => [
      {
        id: 'plan',
        header: 'Plan',
        accessor: (p) => p.plan,
        sortable: true,
        cell: (p) => <span className="font-medium text-velum-900">{p.plan}</span>,
      },
      {
        id: 'members',
        header: 'Socios',
        accessor: (p) => p.members,
        sortable: true,
        align: 'right',
        cell: (p) => <span className="text-velum-600">{p.members}</span>,
      },
      {
        id: 'revenue',
        header: 'Ingreso total',
        accessor: (p) => p.revenue,
        sortable: true,
        align: 'right',
        cell: (p) => <span className="text-velum-600">{formatMoney(p.revenue)}</span>,
      },
      {
        id: 'pct',
        header: '% del MRR',
        accessor: (p) => (mrr > 0 ? p.revenue / mrr : 0),
        sortable: true,
        cell: (p) => {
          const pct = mrr > 0 ? (p.revenue / mrr) * 100 : 0;
          return (
            <div className="flex items-center gap-2">
              <div className="flex-1 h-1.5 bg-velum-100 rounded-full overflow-hidden max-w-[80px]">
                <div className="h-full bg-velum-900 rounded-full" style={{ width: `${pct}%` }} />
              </div>
              <span className="text-xs text-velum-500 tabular-nums">{pct.toFixed(0)}%</span>
            </div>
          );
        },
      },
    ],
    [mrr],
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="KPIs"
        description="Indicadores clave de desempeño"
        bordered={false}
      />
      {analytics.totalSocios === 0 && (
        <div className="flex items-start gap-3 p-4 rounded-2xl bg-warning-50 border border-warning-100 text-warning-700 text-[14px]">
          <AlertTriangle size={16} className="shrink-0 mt-0.5" />
          <span>Los KPIs se calcularán automáticamente cuando haya socias registradas con membresías activas. Comienza invitando a tus primeras socias desde la sección <strong>Socias</strong>.</span>
        </div>
      )}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <KpiCard icon={<Users size={18} />} label="Socios activos" value={analytics.sociosActivos} sub={`${analytics.sociosPendientes} pendientes de activación`} />
        <KpiCard icon={<Wallet size={18} />} label="MRR" value={formatMoney(analytics.mrr)} sub="Ingreso recurrente mensual" accent="text-success-700" />
        <KpiCard icon={<Target size={18} />} label="ARPU" value={formatMoney(analytics.arpu)} sub="Ingreso promedio por usuario" />
        <KpiCard icon={<AlertTriangle size={18} />} label="Riesgo de churn" value={`${analytics.churnRisk.toFixed(1)}%`} sub={`${analytics.sociosConRiesgo} socios en riesgo`} accent={analytics.churnRisk > 20 ? 'text-danger-700' : 'text-velum-900 dark:text-velum-50'} />
        <KpiCard icon={<FileText size={18} />} label="Expedientes firmados" value={analytics.expedientesFirmados} sub={`de ${analytics.totalSocios} socios`} />
        <KpiCard icon={<Clock3 size={18} />} label="Renovaciones próximas" value={analytics.renewalsIn7Days} sub="en los próximos 7 días" />
      </div>
      <div>
        <SectionHeading>Distribución por plan</SectionHeading>
        <DataTable
          aria-label="Distribución por plan"
          data={planBreakdown}
          columns={columns}
          rowKey={(p) => p.plan}
          defaultSort={{ id: 'revenue', dir: 'desc' }}
          empty={{ title: 'Sin datos de planes', description: 'Aún no hay membresías con plan asignado.' }}
        />
      </div>
    </div>
  );
};
