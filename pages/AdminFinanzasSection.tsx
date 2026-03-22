import React from 'react';
import { Wallet, Target, Users, AlertTriangle } from 'lucide-react';
import { Member } from '../types';
import { KpiCard, Pill } from './adminSharedComponents';
import { statusLabel, statusPill } from './adminUtils';

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
  const topMembers = [...members].sort((a, b) => (b.amount ?? 0) - (a.amount ?? 0)).slice(0, 20);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-serif text-velum-900">Finanzas</h1>
        <p className="text-sm text-velum-500 mt-1">Radar de ingresos y facturación</p>
      </div>
      {analytics.mrr === 0 && analytics.sociosActivos === 0 && (
        <div className="flex items-start gap-3 p-4 rounded-2xl bg-blue-50 border border-blue-200 text-blue-800 text-sm">
          <AlertTriangle size={16} className="shrink-0 mt-0.5" />
          <span>Los datos financieros aparecerán aquí una vez que haya socias con membresías activas y pagos procesados por Stripe.</span>
        </div>
      )}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard icon={<Wallet size={18} />} label="MRR total" value={formatMoney(analytics.mrr)} accent="text-emerald-700" />
        <KpiCard icon={<Target size={18} />} label="ARPU" value={formatMoney(analytics.arpu)} />
        <KpiCard icon={<Users size={18} />} label="Socios activos" value={analytics.sociosActivos} />
        <KpiCard icon={<AlertTriangle size={18} />} label="En cobranza" value={analytics.collectionQueue.length} accent={analytics.collectionQueue.length > 0 ? 'text-red-600' : 'text-velum-900'} />
      </div>
      <div>
        <h2 className="text-xs font-bold uppercase tracking-widest text-velum-500 mb-3">Top socios por monto</h2>
        <div className="bg-white rounded-2xl border border-velum-100 overflow-hidden">
          {topMembers.length === 0 ? (
            <div className="py-12 text-center text-xs text-velum-400">Sin datos</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-velum-100 bg-velum-50/50">
                  {['#', 'Socio', 'Plan', 'Monto', 'Estado'].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-velum-400">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {topMembers.map((m, i) => (
                  <tr key={m.id} className={`hover:bg-velum-50 transition cursor-pointer ${i < topMembers.length - 1 ? 'border-b border-velum-50' : ''}`}
                    onClick={() => onOpenMember(m)}>
                    <td className="px-4 py-3 text-velum-400 text-xs">{i + 1}</td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-velum-900">{m.name}</p>
                      <p className="text-xs text-velum-400">{m.email}</p>
                    </td>
                    <td className="px-4 py-3 text-velum-600">{m.plan ?? '—'}</td>
                    <td className="px-4 py-3 font-medium text-velum-900">{m.amount ? formatMoney(m.amount) : '—'}</td>
                    <td className="px-4 py-3"><Pill label={statusLabel(m.subscriptionStatus)} cls={statusPill(m.subscriptionStatus)} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
};
