import React from 'react';
import { Users, Wallet, Target, AlertTriangle, FileText, Clock3 } from 'lucide-react';
import { Member } from '../types';
import { KpiCard } from './adminSharedComponents';

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

interface Props {
  analytics: Analytics;
  planBreakdown: Array<{ plan: string; members: number; revenue: number }>;
}

export const AdminKPIsSection: React.FC<Props> = ({ analytics, planBreakdown }) => (
  <div className="space-y-6">
    <div>
      <h1 className="text-2xl font-serif text-velum-900">KPIs</h1>
      <p className="text-sm text-velum-500 mt-1">Indicadores clave de desempeño</p>
    </div>
    {analytics.totalSocios === 0 && (
      <div className="flex items-start gap-3 p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-800 text-sm">
        <AlertTriangle size={16} className="shrink-0 mt-0.5" />
        <span>Los KPIs se calcularán automáticamente cuando haya socias registradas con membresías activas. Comienza invitando a tus primeras socias desde la sección <strong>Socias</strong>.</span>
      </div>
    )}
    <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
      <KpiCard icon={<Users size={18} />} label="Socios activos" value={analytics.sociosActivos} sub={`${analytics.sociosPendientes} pendientes de activación`} />
      <KpiCard icon={<Wallet size={18} />} label="MRR" value={formatMoney(analytics.mrr)} sub="Ingreso recurrente mensual" accent="text-emerald-700" />
      <KpiCard icon={<Target size={18} />} label="ARPU" value={formatMoney(analytics.arpu)} sub="Ingreso promedio por usuario" />
      <KpiCard icon={<AlertTriangle size={18} />} label="Riesgo de churn" value={`${analytics.churnRisk.toFixed(1)}%`} sub={`${analytics.sociosConRiesgo} socios en riesgo`} accent={analytics.churnRisk > 20 ? 'text-red-600' : 'text-velum-900'} />
      <KpiCard icon={<FileText size={18} />} label="Expedientes firmados" value={analytics.expedientesFirmados} sub={`de ${analytics.totalSocios} socios`} />
      <KpiCard icon={<Clock3 size={18} />} label="Renovaciones próximas" value={analytics.renewalsIn7Days} sub="en los próximos 7 días" />
    </div>
    <div>
      <h2 className="text-xs font-bold uppercase tracking-widest text-velum-500 mb-3">Distribución por plan</h2>
      <div className="bg-white rounded-2xl border border-velum-100 overflow-hidden">
        {planBreakdown.length === 0 ? (
          <div className="py-12 text-center text-xs text-velum-400">Sin datos de planes</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-velum-100 bg-velum-50/50">
                {['Plan', 'Socios', 'Ingreso total', '% del MRR'].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-velum-400">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {planBreakdown.map((p, i) => (
                <tr key={p.plan} className={i < planBreakdown.length - 1 ? 'border-b border-velum-50' : ''}>
                  <td className="px-4 py-3 font-medium text-velum-900">{p.plan}</td>
                  <td className="px-4 py-3 text-velum-600">{p.members}</td>
                  <td className="px-4 py-3 text-velum-600">{formatMoney(p.revenue)}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-1.5 bg-velum-100 rounded-full overflow-hidden max-w-[80px]">
                        <div className="h-full bg-velum-900 rounded-full" style={{ width: `${analytics.mrr > 0 ? (p.revenue / analytics.mrr) * 100 : 0}%` }} />
                      </div>
                      <span className="text-xs text-velum-500">{analytics.mrr > 0 ? ((p.revenue / analytics.mrr) * 100).toFixed(0) : 0}%</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  </div>
);
