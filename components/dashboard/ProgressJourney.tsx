import React from 'react';
import { ChevronRight, Sparkles } from 'lucide-react';

// ProgressJourney — Fase 12.3
//
// Reemplaza el stat decorativo "Sesiones completadas X/12" por una barra de
// progreso visual + storytelling. La idea: el número solo no significa nada
// para el paciente. "Te faltan 4 sesiones" sí significa.
//
// Sesiones recomendadas: 12 estándar (puede variar por plan, pero 12 es el
// número que se mostraba antes y es lo que el paciente conoce).

const RECOMMENDED_SESSIONS = 12;

interface Props {
  sessionsCompleted: number;
  /** Callback para ver historial completo. */
  onViewHistory: () => void;
}

const buildMicrocopy = (completed: number): string => {
  const remaining = Math.max(0, RECOMMENDED_SESSIONS - completed);
  if (completed === 0) return 'Tu tratamiento empieza aquí';
  if (remaining === 0) return '¡Tratamiento completo!';
  if (remaining === 1) return 'Te falta solo 1 sesión';
  if (remaining <= 3) return `Te faltan ${remaining} sesiones para terminar`;
  if (completed >= 6) return `Vas a más de la mitad del tratamiento`;
  return `Vas avanzando, ${remaining} sesiones por delante`;
};

export const ProgressJourney: React.FC<Props> = ({ sessionsCompleted, onViewHistory }) => {
  const total = RECOMMENDED_SESSIONS;
  const completed = Math.min(sessionsCompleted, total);
  const pct = (completed / total) * 100;
  const isComplete = completed >= total;

  return (
    <button
      type="button"
      onClick={onViewHistory}
      className="group text-left px-8 py-10 sm:px-10 sm:py-12 hover:bg-velum-50/50 transition-colors duration-base focus:outline-none focus-visible:bg-velum-50 w-full"
    >
      <p className="text-[13px] font-semibold text-velum-500">Mi progreso</p>

      {/* Stat principal — escala extrema Apple */}
      <p className="mt-4 font-sans font-bold text-velum-900 text-[56px] leading-none tracking-[-0.035em] tabular-nums animate-count-in">
        {completed}
        <span className="text-velum-300 font-medium">/{total}</span>
      </p>

      {/* Barra de progreso visual con dots por sesión (estilo Apple Health rings) */}
      <div className="mt-4 flex gap-1 flex-wrap">
        {Array.from({ length: total }).map((_, i) => (
          <div
            key={i}
            title={i < completed ? `Sesión ${i + 1} completada` : 'Pendiente'}
            className={`h-1.5 flex-1 min-w-[6px] rounded-full transition-all duration-base ease-standard ${
              i < completed ? 'bg-velum-900' : 'bg-velum-100'
            }`}
            style={{ animationDelay: `${i * 30}ms` }}
          />
        ))}
      </div>

      {/* Microcopy contextual */}
      <p className={`mt-3 text-[13px] font-medium leading-snug ${isComplete ? 'text-success-700' : 'text-velum-600'}`}>
        {isComplete && <Sparkles size={12} className="inline mr-1 -mt-0.5" aria-hidden />}
        {buildMicrocopy(completed)}
      </p>

      <div className="mt-3 flex items-center gap-1 text-[14px] font-semibold text-velum-500 group-hover:text-velum-900 transition-colors">
        Ver historial
        <ChevronRight size={14} className="transition-transform group-hover:translate-x-0.5" aria-hidden />
      </div>
    </button>
  );
};
