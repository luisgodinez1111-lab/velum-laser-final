import React from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, ArrowUpRight } from 'lucide-react';
import { track } from '../../services/analytics';

// MembershipMicroCard — Fase 12.3
//
// Reemplaza el slot "Membresía" del stats trio decorativo. Tiene 2 modos:
//
//   1) Sin plan / inactiva: CTA "Explora planes" → /memberships
//   2) Plan activo: muestra plan + estado, con whisper de upgrade contextual
//      si el paciente está en plan básico (no full body) — preámbulo de la
//      Fase 12.4 UpgradeWhisper system pero sin el sistema completo todavía.

interface Props {
  /** Etiqueta del plan: "Identidad", "Renacer", etc. undefined si sin plan. */
  planLabel: string | null;
  /** Estado de la membresía: 'active' | 'past_due' | etc. */
  membershipStatus: string | undefined;
  /** Etiqueta legible del estado: "Activa", "Pendiente", etc. */
  msLabel: string;
  /** Clases Tailwind del badge (color del estado). */
  msCls: string;
  /** True si el plan actual es Cuerpo Completo (sin upgrade posible). */
  isFullBodyPlan: boolean;
}

export const MembershipMicroCard: React.FC<Props> = ({
  planLabel,
  membershipStatus,
  msLabel,
  msCls,
  isFullBodyPlan,
}) => {
  const isActive = membershipStatus === 'active';
  const hasPlan = Boolean(planLabel);
  // Whisper de upgrade: solo si tiene plan activo Y NO es FullBody.
  const showUpgradeWhisper = isActive && hasPlan && !isFullBodyPlan;

  // Sin plan — CTA explorar
  if (!hasPlan) {
    return (
      <Link
        to="/memberships"
        onClick={() => track('membership_plan_select', { tierId: 'no-plan-cta', tierName: 'no-plan', price: 0, isFullBody: false, authenticated: true })}
        className="group block px-8 py-10 sm:px-10 sm:py-12 hover:bg-velum-50/50 transition-colors duration-base focus:outline-none focus-visible:bg-velum-50"
      >
        <p className="text-[13px] font-semibold text-velum-500">Membresía</p>
        <p className="mt-4 font-sans font-bold text-velum-900 text-3xl sm:text-[40px] leading-tight tracking-[-0.025em]">
          Sin plan
        </p>
        <div className="mt-5 flex items-center gap-1 text-[14px] font-semibold text-velum-700 group-hover:text-velum-900 transition-colors">
          Explora planes
          <ChevronRight size={14} className="transition-transform group-hover:translate-x-0.5" aria-hidden />
        </div>
      </Link>
    );
  }

  // Plan activo — con o sin whisper de upgrade
  return (
    <div className="px-8 py-10 sm:px-10 sm:py-12">
      <p className="text-[13px] font-semibold text-velum-500">Tu membresía</p>
      <p className="mt-4 font-sans font-bold text-velum-900 text-3xl sm:text-[36px] leading-tight tracking-[-0.025em]">
        {planLabel}
      </p>
      <div className="mt-4 flex items-center gap-2 flex-wrap">
        <span
          className={`inline-flex items-center text-[11px] font-semibold px-2.5 py-1 border rounded-full ${msCls}`}
        >
          {msLabel}
        </span>
      </div>

      {showUpgradeWhisper && (
        <Link
          to="/memberships"
          onClick={() => track('membership_plan_select', { tierId: 'upgrade-whisper', tierName: 'upgrade', price: 0, isFullBody: false, authenticated: true })}
          className="mt-5 inline-flex items-center gap-1 text-[13px] font-medium text-velum-500 hover:text-velum-900 underline underline-offset-2 transition-colors duration-base ease-standard"
        >
          Explorar más zonas <ArrowUpRight size={12} aria-hidden />
        </Link>
      )}
    </div>
  );
};
