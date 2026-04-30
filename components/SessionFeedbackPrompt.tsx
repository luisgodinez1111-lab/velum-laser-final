import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, MessageSquare, Sparkles } from 'lucide-react';
import type { SessionTreatment, FeedbackChip, FeedbackSeverity } from '../services/clinicalService';
import { clinicalService } from '../services/clinicalService';
import { track } from '../services/analytics';
import { PillButton } from './ui';

// SessionFeedbackPrompt — Fase 12.1
//
// Card automática en Dashboard overview que aparece cuando:
//   - El paciente tiene una sesión completada en los últimos 7 días
//   - Esa sesión NO tiene feedbackAt todavía
//
// Permite reportar reacción post-sesión en 1-2 taps via chips multi-select +
// textarea opcional. Backend deriva severidad y notifica al equipo si adverso.
//
// Ataca el problema de mayor leverage del rediseño Dashboard
// (ver design-system/pages/dashboard-redesign.md §2.3): hoy reportar reacción
// requiere ~5 clicks enterrados en historial, lo que provoca que pacientes con
// reacciones adversas llamen por WhatsApp = ticket de soporte. Con esta pieza,
// 1 tap → reporte estructurado → equipo notificado.
//
// Apple-grade detail:
//   - El kicker dice "hace X días" calculado en vivo (sutil, humano).
//   - El submit muta a estado "Recibido" con icono Check (no toast genérico).
//   - Si el staff ya respondió, el card cambia a mostrar la respuesta clínica
//     en el mismo lugar — cierra el loop sin que el paciente busque.

interface Props {
  /** Todas las sesiones del paciente, ordenadas. El componente filtra. */
  sessions: SessionTreatment[];
  /** Re-fetch sessions tras envío exitoso. */
  onSubmitted?: () => void;
}

const FEEDBACK_WINDOW_DAYS = 7;

const formatRelativeDays = (createdAt: string): string => {
  const ms = Date.now() - new Date(createdAt).getTime();
  const days = Math.floor(ms / (1000 * 60 * 60 * 24));
  if (days <= 0) return 'hoy';
  if (days === 1) return 'hace 1 día';
  return `hace ${days} días`;
};

export const SessionFeedbackPrompt: React.FC<Props> = ({ sessions, onSubmitted }) => {
  const [chips, setChips] = useState<FeedbackChip[] | null>(null);
  const [selectedChips, setSelectedChips] = useState<Set<string>>(new Set());
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Encuentra la sesión candidata: más reciente, sin feedback, dentro de la ventana.
  const candidate = useMemo(() => {
    const now = Date.now();
    const cutoff = now - FEEDBACK_WINDOW_DAYS * 24 * 60 * 60 * 1000;
    return sessions
      .filter((s) => !s.feedbackAt && new Date(s.createdAt).getTime() >= cutoff)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
  }, [sessions]);

  // También: la sesión más reciente con feedback respondido por el staff
  // (queremos mostrar la respuesta al paciente en su Dashboard sin que tenga
  //  que ir a historial). Solo si fue respondida en últimos 14 días.
  const recentlyResponded = useMemo(() => {
    const now = Date.now();
    const cutoff = now - 14 * 24 * 60 * 60 * 1000;
    return sessions
      .filter((s) => s.feedbackResponseNote && s.feedbackRespondedAt && new Date(s.feedbackRespondedAt).getTime() >= cutoff)
      .sort((a, b) => new Date(b.feedbackRespondedAt!).getTime() - new Date(a.feedbackRespondedAt!).getTime())[0];
  }, [sessions]);

  // Lazy-load del catálogo (cache in-memory).
  useEffect(() => {
    if (chips !== null) return;
    if (!candidate) return; // no necesitamos chips si no hay sesión candidata
    clinicalService.getFeedbackChips().then(setChips).catch(() => setChips([]));
  }, [chips, candidate]);

  // Trackear cuando el paciente VE la respuesta del staff (engagement loop completo).
  // Una sola vez por sesión respondida (key del effect = sessionId).
  useEffect(() => {
    if (!recentlyResponded || candidate) return;
    track('feedback_response_view', {
      sessionId: recentlyResponded.id,
      daysSinceResponse: Math.max(0, Math.floor((Date.now() - new Date(recentlyResponded.feedbackRespondedAt!).getTime()) / (1000 * 60 * 60 * 24))),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recentlyResponded?.id, candidate]);

  // Si no hay candidato pendiente Y no hay respuesta reciente, no renderizar.
  if (!candidate && !recentlyResponded) return null;

  // ── Render: respuesta del staff (cierre del loop) ──────────────────────────
  if (recentlyResponded && !candidate) {
    const respondedAt = new Date(recentlyResponded.feedbackRespondedAt!).toLocaleDateString('es-MX', {
      day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
    });
    return (
      <section
        aria-labelledby="feedback-response-heading"
        className="rounded-3xl bg-success-50 border border-success-100 px-5 py-5 sm:px-6 animate-fade-in"
      >
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl bg-success-100 flex items-center justify-center shrink-0">
            <CheckCircle2 size={18} className="text-success-700" aria-hidden />
          </div>
          <div className="flex-1 min-w-0">
            <p id="feedback-response-heading" className="text-[13px] font-semibold text-success-700">
              Tu equipo clínico te respondió
            </p>
            <p className="text-[12px] text-success-700/80 mt-0.5">{respondedAt}</p>
            <p className="text-[14px] text-velum-800 mt-3 leading-relaxed">
              {recentlyResponded.feedbackResponseNote}
            </p>
          </div>
        </div>
      </section>
    );
  }

  // ── Render: prompt activo ──────────────────────────────────────────────────
  if (!candidate) return null;

  const sessionAge = formatRelativeDays(candidate.createdAt);
  const params = candidate.laserParametersJson as Record<string, string> | null;
  const zona = params?.zona ?? null;

  const toggleChip = (id: string) => {
    setSelectedChips((prev) => {
      const next = new Set(prev);
      // "ok" es exclusivo: si lo seleccionas, deselecciona los demás.
      if (id === 'ok') {
        if (next.has('ok')) {
          next.delete('ok');
        } else {
          next.clear();
          next.add('ok');
        }
        return next;
      }
      // Cualquier otro chip deselecciona "ok".
      next.delete('ok');
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const canSubmit = !submitting && (selectedChips.size > 0 || text.trim().length >= 3);

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setSubmitError(null);
    const chipsArray = Array.from(selectedChips);
    try {
      const updated = await clinicalService.addSessionFeedback(candidate.id, {
        feedbackChips: chipsArray,
        memberFeedback: text.trim() ? text.trim() : undefined,
      });
      // Reportar a analytics (sin PII — solo metadatos categóricos).
      track('feedback_submit', {
        severity: updated.feedbackSeverity ?? 'unknown',
        chipsCount: chipsArray.length,
        hasFreeText: text.trim().length > 0,
        sessionAgeDays: Math.max(0, Math.floor((Date.now() - new Date(candidate.createdAt).getTime()) / (1000 * 60 * 60 * 24))),
      });
      onSubmitted?.();
    } catch (e: unknown) {
      setSubmitError(e instanceof Error ? e.message : 'No pudimos enviar tu feedback. Intenta de nuevo.');
      setSubmitting(false);
    }
  };

  // Los chips se renderizan agrupados por severidad para guiar visualmente.
  // El "ok" verde aparece primero, después los grises, después los warning, después los danger.
  const sortedChips = useMemo(() => {
    if (!chips) return [];
    const order: Record<FeedbackSeverity, number> = { none: 0, mild: 1, moderate: 2, severe: 3 };
    return [...chips].sort((a, b) => order[a.severity] - order[b.severity]);
  }, [chips]);

  const chipClass = (chip: FeedbackChip, isSelected: boolean): string => {
    if (isSelected) {
      if (chip.id === 'ok') return 'bg-success-500 text-white border-success-500';
      if (chip.severity === 'severe') return 'bg-danger-500 text-white border-danger-500';
      if (chip.severity === 'moderate' || chip.severity === 'mild') return 'bg-warning-500 text-white border-warning-500';
      return 'bg-velum-900 text-white border-velum-900';
    }
    // Estado neutro
    return 'bg-white text-velum-700 border-velum-200 hover:border-velum-400 hover:bg-velum-50';
  };

  return (
    <section
      aria-labelledby="feedback-prompt-heading"
      className="rounded-3xl bg-white border border-velum-200/70 px-6 py-6 sm:px-8 sm:py-7 animate-fade-in"
    >
      {/* Kicker + heading */}
      <div className="flex items-center gap-2 mb-2">
        <MessageSquare size={14} className="text-velum-500" aria-hidden />
        <p className="text-[13px] font-semibold text-velum-500">Tu última sesión · {sessionAge}{zona ? ` · ${zona}` : ''}</p>
      </div>
      <h2 id="feedback-prompt-heading" className="font-sans font-bold text-velum-900 text-2xl sm:text-3xl tracking-tight mb-2">
        ¿Cómo ha ido tu piel?
      </h2>
      <p className="text-[14px] text-velum-600 leading-relaxed mb-5 max-w-xl">
        Tu equipo clínico revisa cada respuesta. Selecciona lo que aplique y, si quieres, agrega un comentario.
      </p>

      {/* Chips */}
      <div className="flex flex-wrap gap-2 mb-5">
        {sortedChips.length === 0 ? (
          <div className="h-9 w-32 rounded-full bg-velum-100 animate-pulse" aria-label="Cargando opciones" />
        ) : (
          sortedChips.map((chip) => {
            const isSelected = selectedChips.has(chip.id);
            return (
              <button
                key={chip.id}
                type="button"
                onClick={() => toggleChip(chip.id)}
                aria-pressed={isSelected}
                disabled={submitting}
                className={[
                  'inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-[13px] font-medium border',
                  'transition-all duration-base ease-standard',
                  'focus:outline-none focus-visible:shadow-focus',
                  'disabled:opacity-60 disabled:cursor-not-allowed active:scale-[0.97]',
                  chipClass(chip, isSelected),
                ].join(' ')}
              >
                {isSelected && chip.id === 'ok' && <Sparkles size={11} aria-hidden />}
                {isSelected && chip.id !== 'ok' && <CheckCircle2 size={11} aria-hidden />}
                {chip.label}
              </button>
            );
          })
        )}
      </div>

      {/* Textarea */}
      <div className="mb-4">
        <label htmlFor="feedback-text" className="sr-only">Comentario adicional</label>
        <textarea
          id="feedback-text"
          rows={3}
          value={text}
          onChange={(e) => setText(e.target.value)}
          disabled={submitting}
          placeholder="Algo más que quieras compartir con tu equipo (opcional)…"
          className="w-full rounded-2xl bg-velum-50 border border-velum-200/60 px-4 py-3 text-[14px] text-velum-900 placeholder:text-velum-400 outline-none transition-all duration-base ease-standard focus:bg-white focus:border-velum-900 focus:ring-4 focus:ring-velum-900/[0.06] resize-none disabled:opacity-60"
        />
      </div>

      {submitError && (
        <p className="text-[13px] text-danger-700 mb-3">{submitError}</p>
      )}

      <div className="flex items-center gap-3">
        <PillButton
          variant="primary"
          size="md"
          onClick={handleSubmit}
          disabled={!canSubmit}
          isLoading={submitting}
          loadingLabel="Enviando…"
        >
          Compartir reacción
        </PillButton>
        <p className="text-[12px] text-velum-400">
          Privado. Solo tu equipo clínico lo ve.
        </p>
      </div>
    </section>
  );
};
