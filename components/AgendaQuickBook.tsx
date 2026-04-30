import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Calendar, ChevronRight, Loader2 } from 'lucide-react';
import { clinicalService } from '../services/clinicalService';
import { track } from '../services/analytics';
import { PillButton } from './ui';

// AgendaQuickBook — Fase 12.2
//
// Componente que muestra próximos N días con sus slots disponibles directamente
// en el Dashboard overview, eliminando la necesidad de navegar a /agenda y
// pasar por el wizard de calendario completo cuando solo quieres "agendar la
// siguiente sesión rutinaria".
//
// Reduce el flujo de agendar de ~8 acciones a ~3:
//   1. Login → ve slots inmediatamente
//   2. Click un slot
//   3. /agenda con date+slot preseleccionados → confirmar y pagar
//
// Cuándo NO renderiza:
//   - Si el paciente ya tiene próxima cita (hideIfHasUpcoming = true por default)
//   - Mientras carga policy/slots (skeleton elegante en su lugar)
//   - Si no hay slots disponibles en ningún día del rango (mensaje útil)
//
// Apple-grade detail:
//   - Render optimista: mientras carga, muestra skeleton con la forma correcta.
//   - Si N días no tienen disponibilidad, fallback a "Ver más fechas →".
//   - Slots en chips compactos con tabular-nums (alineación visual).
//   - Click navega a /agenda?date=X&slot=Y para preselect (Agenda.tsx parsea).

const DAYS_TO_SHOW = 3;

interface DaySlots {
  dateKey: string;
  date: Date;
  weekdayLabel: string;
  dayLabel: string;
  isOpen: boolean;
  slots: Array<{ label: string; startMinute: number; endMinute: number; available: boolean }>;
}

const buildDateKey = (d: Date): string => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const formatWeekday = (d: Date, today: Date): string => {
  const todayKey = buildDateKey(today);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowKey = buildDateKey(tomorrow);
  const k = buildDateKey(d);
  if (k === todayKey) return 'Hoy';
  if (k === tomorrowKey) return 'Mañana';
  return d.toLocaleDateString('es-MX', { weekday: 'long' }).replace(/\.$/, '');
};

const formatDayMonth = (d: Date): string => {
  return d.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' }).replace(/\.$/, '');
};

export const AgendaQuickBook: React.FC = () => {
  const navigate = useNavigate();
  const [days, setDays] = useState<DaySlots[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);

    const load = async () => {
      try {
        const policy = await clinicalService.getPublicAgendaPolicy();
        const minAdvanceMs = (policy.minAdvanceMinutes ?? 120) * 60 * 1000;
        const earliest = new Date(Date.now() + minAdvanceMs);

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        // Generar próximos N días candidatos.
        // Si min-advance excede el día actual, empezar mañana.
        let startOffset = 0;
        if (earliest.toDateString() !== today.toDateString() && earliest > today) {
          startOffset = 1;
        }

        const candidateDates: Date[] = [];
        for (let i = startOffset; i < startOffset + DAYS_TO_SHOW + 2; i++) {
          // +2 buffer para descartar días cerrados sin quedarnos cortos
          const d = new Date(today);
          d.setDate(d.getDate() + i);
          candidateDates.push(d);
        }

        // Fetch en paralelo todos los días candidatos.
        const results = await Promise.all(
          candidateDates.map((d) =>
            clinicalService
              .getPublicAgendaSlots(buildDateKey(d))
              .catch(() => ({ dateKey: buildDateKey(d), isOpen: false, slots: [] }))
          )
        );

        if (cancelled) return;

        const dayResults: DaySlots[] = results
          .map((r, idx) => {
            const d = candidateDates[idx];
            return {
              dateKey: r.dateKey,
              date: d,
              weekdayLabel: formatWeekday(d, today),
              dayLabel: formatDayMonth(d),
              isOpen: r.isOpen,
              slots: r.slots.filter((s) => s.available),
            };
          })
          // Filtrar días sin slots disponibles
          .filter((d) => d.isOpen && d.slots.length > 0)
          // Tomar los primeros N
          .slice(0, DAYS_TO_SHOW);

        setDays(dayResults);
      } catch {
        if (!cancelled) setError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  // No renderizar si error: el caller (Dashboard) tiene su propio empty-state
  // para "sin próxima cita" — preferimos no duplicar info redundante.
  if (error) return null;

  // Loading skeleton: forma del componente final para evitar layout shift.
  if (loading) {
    return (
      <section
        aria-label="Cargando disponibilidad"
        className="rounded-3xl bg-white border border-velum-200/70 px-6 py-6 sm:px-8 sm:py-7 animate-fade-in"
      >
        <div className="flex items-center gap-2 mb-4">
          <Calendar size={14} className="text-velum-500" aria-hidden />
          <p className="text-[13px] font-semibold text-velum-500">Reserva tu próxima sesión</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[0, 1, 2].map((i) => (
            <div key={i} className="space-y-2">
              <div className="h-4 w-20 rounded bg-velum-100 animate-pulse" />
              <div className="h-3 w-12 rounded bg-velum-100 animate-pulse" />
              <div className="space-y-1.5 pt-2">
                <div className="h-7 w-full rounded-xl bg-velum-100 animate-pulse" />
                <div className="h-7 w-full rounded-xl bg-velum-100 animate-pulse" />
                <div className="h-7 w-full rounded-xl bg-velum-100 animate-pulse" />
              </div>
            </div>
          ))}
        </div>
      </section>
    );
  }

  // Sin disponibilidad en próximos N días — fallback con CTA al wizard completo.
  if (!days || days.length === 0) {
    return (
      <section
        aria-labelledby="quickbook-empty-heading"
        className="rounded-3xl bg-white border border-velum-200/70 px-6 py-6 sm:px-8 sm:py-7"
      >
        <div className="flex items-center gap-2 mb-2">
          <Calendar size={14} className="text-velum-500" aria-hidden />
          <p className="text-[13px] font-semibold text-velum-500">Reserva tu próxima sesión</p>
        </div>
        <h2 id="quickbook-empty-heading" className="font-sans font-bold text-velum-900 text-2xl sm:text-3xl tracking-tight mb-2">
          Sin disponibilidad inmediata.
        </h2>
        <p className="text-[14px] text-velum-600 leading-relaxed mb-5 max-w-xl">
          No vemos slots disponibles en los próximos {DAYS_TO_SHOW} días. Explora el calendario completo para ver fechas más adelante.
        </p>
        <Link to="/agenda" onClick={() => track('agenda_intro_choose', { choice: 'login' })}>
          <PillButton variant="primary" size="md" showChevron>
            Ver calendario completo
          </PillButton>
        </Link>
      </section>
    );
  }

  return (
    <section
      aria-labelledby="quickbook-heading"
      className="rounded-3xl bg-white border border-velum-200/70 px-6 py-6 sm:px-8 sm:py-7"
    >
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2 min-w-0">
          <Calendar size={14} className="text-velum-500" aria-hidden />
          <p className="text-[13px] font-semibold text-velum-500">Reserva tu próxima sesión</p>
        </div>
        <Link
          to="/agenda"
          className="text-[13px] font-medium text-velum-500 hover:text-velum-900 underline underline-offset-2 transition-colors duration-base ease-standard shrink-0"
        >
          Ver más fechas →
        </Link>
      </div>
      <h2 id="quickbook-heading" className="font-sans font-bold text-velum-900 text-2xl sm:text-3xl tracking-tight mb-5">
        Próximos horarios disponibles
      </h2>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {days.map((day) => (
          <DayColumn
            key={day.dateKey}
            day={day}
            onSlotClick={(slotLabel, startMinute) => {
              track('agenda_slot_select', { reason: 'quickbook' });
              const params = new URLSearchParams({
                date: day.dateKey,
                slot: slotLabel,
              });
              navigate(`/agenda?${params.toString()}`);
            }}
          />
        ))}
      </div>
    </section>
  );
};

// ── Subcomponente: columna de día ─────────────────────────────────────────────

const MAX_SLOTS_VISIBLE = 4;

const DayColumn: React.FC<{
  day: DaySlots;
  onSlotClick: (slotLabel: string, startMinute: number) => void;
}> = ({ day, onSlotClick }) => {
  const [expanded, setExpanded] = useState(false);

  const visibleSlots = useMemo(() => {
    return expanded ? day.slots : day.slots.slice(0, MAX_SLOTS_VISIBLE);
  }, [expanded, day.slots]);

  const remaining = day.slots.length - MAX_SLOTS_VISIBLE;

  return (
    <div>
      <p className="text-[14px] font-semibold text-velum-900 capitalize">{day.weekdayLabel}</p>
      <p className="text-[12px] text-velum-500 capitalize tabular-nums">{day.dayLabel}</p>
      <div className="mt-3 space-y-1.5">
        {visibleSlots.map((slot) => (
          <button
            key={slot.label}
            type="button"
            onClick={() => onSlotClick(slot.label, slot.startMinute)}
            className="w-full inline-flex items-center justify-between rounded-xl border border-velum-200 bg-white hover:border-velum-900 hover:bg-velum-50 active:scale-[0.98] px-3 py-2 text-[14px] font-medium text-velum-900 tabular-nums transition-all duration-base ease-standard focus:outline-none focus-visible:shadow-focus group"
          >
            <span>{slot.label}</span>
            <ChevronRight size={14} className="text-velum-300 group-hover:text-velum-900 group-hover:translate-x-0.5 transition-all duration-base ease-standard" aria-hidden />
          </button>
        ))}
        {!expanded && remaining > 0 && (
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="w-full text-center text-[12px] font-medium text-velum-500 hover:text-velum-900 transition-colors duration-base ease-standard py-1"
          >
            +{remaining} más
          </button>
        )}
      </div>
    </div>
  );
};
