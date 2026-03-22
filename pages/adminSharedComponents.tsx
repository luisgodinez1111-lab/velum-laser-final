import React from 'react';

export const Pill: React.FC<{ label: string; cls: string }> = ({ label, cls }) => (
  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${cls}`}>{label}</span>
);

export const KpiCard: React.FC<{
  icon: React.ReactNode;
  label: string;
  value: string | number;
  sub?: string;
  accent?: string;
}> = ({ icon, label, value, sub, accent = 'text-velum-900' }) => (
  <div className="bg-white rounded-2xl border border-velum-100 p-5 flex flex-col gap-3">
    <div className="flex items-center justify-between">
      <span className="text-[10px] font-bold uppercase tracking-widest text-velum-500">{label}</span>
      <span className="text-velum-400">{icon}</span>
    </div>
    <p className={`text-3xl font-serif font-bold leading-none ${accent}`}>{value}</p>
    {sub && <p className="text-xs text-velum-400">{sub}</p>}
  </div>
);
