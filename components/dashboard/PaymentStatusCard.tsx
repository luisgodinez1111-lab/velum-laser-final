import React from 'react';
import { ChevronRight, AlertCircle, CreditCard } from 'lucide-react';
import { track } from '../../services/analytics';

// PaymentStatusCard — Fase 12.3
//
// Reemplaza el slot decorativo de "Documentos pendientes" del stats trio
// anterior. Es accionable: muestra próximo cargo, fecha, y estado del método
// de pago. Si hay past_due, dot rojo pulsante + alerta visual fuerte.
//
// Promueve la "tarea reina #2" (pagos) a la vista de entrada del Dashboard
// — antes el paciente tenía que ir al tab billing para saber su próximo cargo.

interface Props {
  /** Estado de la membresía: 'active' | 'past_due' | 'canceled' | 'inactive' | undefined */
  membershipStatus: string | undefined;
  /** Próximo cargo (formatted MXN). undefined si no hay membresía. */
  nextChargeAmount?: string;
  /** Fecha del próximo cargo. */
  nextChargeDate?: string;
  /** Callback para abrir portal Stripe (centralizado por el caller). */
  onOpenPortal: () => void;
  /** Callback para navegar a tab pagos (ver historial). */
  onViewBilling: () => void;
}

export const PaymentStatusCard: React.FC<Props> = ({
  membershipStatus,
  nextChargeAmount,
  nextChargeDate,
  onOpenPortal,
  onViewBilling,
}) => {
  const isPastDue = membershipStatus === 'past_due';
  const isActive = membershipStatus === 'active';
  const isInactive = !isActive && !isPastDue;

  // Estado: pago pendiente (urgente)
  if (isPastDue) {
    return (
      <button
        type="button"
        onClick={() => { track('payment_portal_open', { context: 'trio_past_due' }); onOpenPortal(); }}
        className="group text-left px-8 py-10 sm:px-10 sm:py-12 hover:bg-danger-50/40 transition-colors duration-base focus:outline-none focus-visible:bg-danger-50 w-full"
      >
        <div className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-danger-500 animate-pulse" aria-hidden />
          <p className="text-[13px] font-semibold text-danger-700">Pago pendiente</p>
        </div>
        <p className="mt-4 font-sans font-bold text-danger-700 text-3xl sm:text-[40px] leading-tight tracking-[-0.025em]">
          Actualiza tu método
        </p>
        <div className="mt-5 flex items-center gap-1 text-[14px] font-semibold text-danger-700 group-hover:text-danger-700/80 transition-colors">
          Ir al portal
          <ChevronRight size={14} className="transition-transform group-hover:translate-x-0.5" aria-hidden />
        </div>
      </button>
    );
  }

  // Estado: sin membresía / inactiva — no mostrar info de cargo (no aplica)
  if (isInactive || !nextChargeAmount) {
    return (
      <button
        type="button"
        onClick={onViewBilling}
        className="group text-left px-8 py-10 sm:px-10 sm:py-12 hover:bg-velum-50/50 transition-colors duration-base focus:outline-none focus-visible:bg-velum-50 w-full"
      >
        <p className="text-[13px] font-semibold text-velum-500">Pagos</p>
        <p className="mt-4 font-sans font-bold text-velum-900 text-3xl sm:text-[40px] leading-tight tracking-[-0.025em]">
          Sin cargos activos
        </p>
        <div className="mt-5 flex items-center gap-1 text-[14px] font-semibold text-velum-500 group-hover:text-velum-900 transition-colors">
          Ver historial
          <ChevronRight size={14} className="transition-transform group-hover:translate-x-0.5" aria-hidden />
        </div>
      </button>
    );
  }

  // Estado: activa — mostrar próximo cargo
  return (
    <button
      type="button"
      onClick={onViewBilling}
      className="group text-left px-8 py-10 sm:px-10 sm:py-12 hover:bg-velum-50/50 transition-colors duration-base focus:outline-none focus-visible:bg-velum-50 w-full"
    >
      <p className="text-[13px] font-semibold text-velum-500">Próximo cargo</p>
      <p className="mt-4 font-sans font-bold text-velum-900 text-[40px] sm:text-[44px] leading-none tracking-[-0.035em] tabular-nums">
        {nextChargeAmount}
      </p>
      {nextChargeDate && (
        <p className="mt-3 text-[14px] text-velum-500 capitalize">
          {nextChargeDate}
        </p>
      )}
      <div className="mt-3 flex items-center gap-1.5 text-[12px] font-medium text-success-700">
        <CreditCard size={11} aria-hidden />
        Método activo
      </div>
    </button>
  );
};
