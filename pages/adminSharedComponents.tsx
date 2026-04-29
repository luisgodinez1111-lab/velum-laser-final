import React from 'react';

export const Pill: React.FC<{ label: string; cls: string }> = ({ label, cls }) => (
  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${cls}`}>{label}</span>
);

// KpiCard — Apple híbrido para admin (per MASTER §6.4 resuelto):
// - Label: uppercase tracking-widest CONSERVADO (admin densidad funcional, §6.3).
// - Value: migrado de Playfair text-3xl a sans bold text-4xl tabular-nums
//   tracking-tight para escala extrema Apple-style (similar a stats trio cliente).
export const KpiCard: React.FC<{
  icon: React.ReactNode;
  label: string;
  value: string | number;
  sub?: string;
  accent?: string;
}> = ({ icon, label, value, sub, accent = 'text-velum-900 dark:text-velum-50' }) => (
  <div className="bg-white dark:bg-velum-900 rounded-2xl border border-velum-100 dark:border-velum-800 p-5 flex flex-col gap-3">
    <div className="flex items-center justify-between">
      <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-velum-500 dark:text-velum-400">{label}</span>
      <span className="text-velum-400 dark:text-velum-500">{icon}</span>
    </div>
    <p className={`font-sans font-bold tabular-nums text-4xl leading-none tracking-[-0.025em] ${accent}`}>{value}</p>
    {sub && <p className="text-[12px] text-velum-500 dark:text-velum-400">{sub}</p>}
  </div>
);
