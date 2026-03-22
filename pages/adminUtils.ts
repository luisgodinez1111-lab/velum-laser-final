import { Member } from '../types';

export type HealthFlag = 'ok' | 'warning' | 'critical';

export const statusLabel = (status?: string): string => {
  switch (status) {
    case 'active':   return 'Activo';
    case 'past_due': return 'Pago vencido';
    case 'canceled': return 'Cancelado';
    case 'paused':   return 'Pausado';
    case 'pending':  return 'Pendiente';
    case 'inactive': return 'Inactivo';
    default: return status ?? '—';
  }
};

export const statusPill = (status?: string): string => {
  switch (status) {
    case 'active':   return 'bg-emerald-100 text-emerald-700 border-emerald-200';
    case 'pending':  return 'bg-amber-100 text-amber-700 border-amber-200';
    case 'past_due': return 'bg-red-100 text-red-700 border-red-200';
    case 'paused':   return 'bg-orange-100 text-orange-700 border-orange-200';
    case 'canceled': return 'bg-zinc-200 text-zinc-700 border-zinc-300';
    default: return 'bg-zinc-100 text-zinc-700 border-zinc-200';
  }
};

export const intakeStatusLabel = (status?: string) => {
  switch (status) {
    case 'approved':  return { label: 'Aprobado', cls: 'text-emerald-700 bg-emerald-50 border-emerald-200' };
    case 'submitted': return { label: 'Pendiente revisión', cls: 'text-amber-700 bg-amber-50 border-amber-200' };
    case 'rejected':  return { label: 'Rechazado', cls: 'text-red-700 bg-red-50 border-red-200' };
    default: return { label: 'Borrador', cls: 'text-zinc-500 bg-zinc-50 border-zinc-200' };
  }
};

export const riskOfMember = (member: Member): HealthFlag => {
  const status = member.subscriptionStatus;
  const consent = !!member.clinical?.consentFormSigned;
  if ((status === 'past_due' || status === 'canceled' || status === 'inactive') && !consent) return 'critical';
  if (status !== 'active' || !consent) return 'warning';
  return 'ok';
};
