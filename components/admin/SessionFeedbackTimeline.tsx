import React, { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, MessageSquare, Send, Sparkles, Clock } from 'lucide-react';
import type { SessionTreatment, FeedbackSeverity, FeedbackChip } from '../../services/clinicalService';
import { clinicalService } from '../../services/clinicalService';
import { PillButton } from '../ui';

// SessionFeedbackTimeline — Fase 12 / B.3
//
// Vista admin del feedback estructurado del paciente, integrada dentro del
// AdminMemberDrawer. Sin pantallas separadas — el equipo clínico ve y responde
// EN el expediente del paciente.
//
// Reglas visuales (Apple híbrido + tokens semánticos):
// - Severidad gobierna el color del card y la prominencia.
// - Feedback no respondido + adverso = card prominente con halo danger.
// - Respondido = card sutil con check + nota del staff visible.
// - Rutinario sin texto = una línea compacta (no inflar UI con feedback "todo bien").
//
// Props mínimas — el caller (AdminMemberDrawer) provee sessions y reload callback.

interface Props {
  sessions: SessionTreatment[];
  /** Re-fetch sessions after a successful response. Provided by parent drawer. */
  onResponseSent?: () => void;
}

const severityStyles: Record<FeedbackSeverity, {
  ring: string;
  bg: string;
  text: string;
  badge: string;
  label: string;
}> = {
  none:     { ring: 'ring-velum-100',     bg: 'bg-velum-50',    text: 'text-velum-700',   badge: 'bg-velum-100 text-velum-600 border-velum-200',     label: 'Rutinario'  },
  mild:     { ring: 'ring-warning-100',   bg: 'bg-warning-50',  text: 'text-warning-700', badge: 'bg-warning-100 text-warning-700 border-warning-100', label: 'Leve'       },
  moderate: { ring: 'ring-warning-100',   bg: 'bg-warning-50',  text: 'text-warning-700', badge: 'bg-warning-100 text-warning-700 border-warning-100', label: 'Moderada'   },
  severe:   { ring: 'ring-danger-100',    bg: 'bg-danger-50',   text: 'text-danger-700',  badge: 'bg-danger-100 text-danger-700 border-danger-100',   label: 'Severa'     },
};

export const SessionFeedbackTimeline: React.FC<Props> = ({ sessions, onResponseSent }) => {
  const [chipsCatalog, setChipsCatalog] = useState<FeedbackChip[] | null>(null);
  const [openResponseFor, setOpenResponseFor] = useState<string | null>(null);
  const [responseText, setResponseText] = useState('');
  const [submittingId, setSubmittingId] = useState<string | null>(null);
  const [errorById, setErrorById] = useState<Record<string, string>>({});

  // Lazy-load del catálogo solo cuando el componente se monta (caché in-memory).
  React.useEffect(() => {
    if (chipsCatalog !== null) return;
    clinicalService.getFeedbackChips().then(setChipsCatalog).catch(() => setChipsCatalog([]));
  }, [chipsCatalog]);

  // Filtrar solo sesiones con feedback. Ordenar por urgencia (adverso pendiente primero).
  const sessionsWithFeedback = useMemo(() => {
    return sessions
      .filter((s) => s.feedbackAt)
      .sort((a, b) => {
        // 1) Adverso sin responder primero
        const aUrgent = a.feedbackHasAdverseReaction && !a.feedbackRespondedAt;
        const bUrgent = b.feedbackHasAdverseReaction && !b.feedbackRespondedAt;
        if (aUrgent !== bUrgent) return aUrgent ? -1 : 1;
        // 2) Más reciente primero
        return new Date(b.feedbackAt!).getTime() - new Date(a.feedbackAt!).getTime();
      });
  }, [sessions]);

  if (sessionsWithFeedback.length === 0) {
    return (
      <div className="px-4 py-6 text-center">
        <p className="text-[13px] text-velum-500">Sin feedback de sesiones aún.</p>
        <p className="text-[12px] text-velum-400 mt-1">El paciente recibirá la opción de reportar reacciones tras cada sesión completada.</p>
      </div>
    );
  }

  const renderChipLabel = (chipId: string) => {
    if (!chipsCatalog) return chipId;
    return chipsCatalog.find((c) => c.id === chipId)?.label ?? chipId;
  };

  const handleSubmitResponse = async (sessionId: string) => {
    const text = responseText.trim();
    if (text.length < 3) {
      setErrorById((p) => ({ ...p, [sessionId]: 'Escribe al menos 3 caracteres' }));
      return;
    }
    setSubmittingId(sessionId);
    setErrorById((p) => ({ ...p, [sessionId]: '' }));
    try {
      await clinicalService.respondToSessionFeedback(sessionId, text);
      setOpenResponseFor(null);
      setResponseText('');
      onResponseSent?.();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error al enviar respuesta';
      setErrorById((p) => ({ ...p, [sessionId]: msg }));
    } finally {
      setSubmittingId(null);
    }
  };

  return (
    <div className="space-y-3">
      {sessionsWithFeedback.map((s) => {
        const severity: FeedbackSeverity = s.feedbackSeverity ?? 'none';
        const styles = severityStyles[severity];
        const chips = (s.feedbackChipsJson ?? []) as string[];
        const isResponded = Boolean(s.feedbackRespondedAt);
        const isAdverse = Boolean(s.feedbackHasAdverseReaction);
        const isUrgent = isAdverse && !isResponded;
        const sessionDate = new Date(s.createdAt).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
        const feedbackDate = s.feedbackAt
          ? new Date(s.feedbackAt).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
          : '';
        const respondedDate = s.feedbackRespondedAt
          ? new Date(s.feedbackRespondedAt).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
          : '';
        const responderName = s.feedbackResponder?.profile
          ? `${s.feedbackResponder.profile.firstName ?? ''} ${s.feedbackResponder.profile.lastName ?? ''}`.trim() || s.feedbackResponder.email
          : s.feedbackResponder?.email ?? 'Equipo clínico';

        return (
          <div
            key={s.id}
            className={[
              'rounded-2xl border p-4 transition-all duration-base ease-standard',
              styles.bg,
              isUrgent ? 'ring-2 ring-offset-2 ring-offset-white ' + styles.ring : 'border-velum-100',
            ].join(' ')}
          >
            {/* Header — fecha sesión + severity badge + adverse pulse */}
            <div className="flex items-center justify-between gap-2 mb-2.5">
              <div className="flex items-center gap-2 min-w-0">
                <p className="text-[12px] font-semibold text-velum-900 capitalize truncate">{sessionDate}</p>
                <span className="text-velum-400">·</span>
                <p className="text-[11px] text-velum-500 flex items-center gap-1 shrink-0">
                  <Clock size={10} aria-hidden /> {feedbackDate}
                </p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {isUrgent && (
                  <span className="w-1.5 h-1.5 rounded-full bg-danger-500 animate-pulse" aria-label="Pendiente respuesta urgente" />
                )}
                <span className={`text-[10px] font-semibold px-2 py-0.5 border rounded-full ${styles.badge}`}>
                  {styles.label}
                </span>
              </div>
            </div>

            {/* Chips seleccionados por el paciente */}
            {chips.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-2.5">
                {chips.map((chipId) => (
                  <span
                    key={chipId}
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium ${
                      chipId === 'ok'
                        ? 'bg-success-50 text-success-700 border border-success-100'
                        : 'bg-white border border-velum-200 text-velum-700'
                    }`}
                  >
                    {chipId === 'ok' && <Sparkles size={10} aria-hidden />}
                    {renderChipLabel(chipId)}
                  </span>
                ))}
              </div>
            )}

            {/* Texto libre del paciente */}
            {s.memberFeedback && (
              <div className="bg-white rounded-xl border border-velum-100 px-3 py-2 mb-2.5">
                <p className="text-[10px] font-semibold text-velum-500 mb-0.5 uppercase tracking-[0.14em]">Comentario del paciente</p>
                <p className="text-[13px] text-velum-800 italic leading-snug">"{s.memberFeedback}"</p>
              </div>
            )}

            {/* Respuesta clínica del staff */}
            {isResponded && s.feedbackResponseNote && (
              <div className="bg-white rounded-xl border border-success-100 px-3 py-2.5 mt-2">
                <div className="flex items-center gap-1.5 mb-1">
                  <CheckCircle2 size={12} className="text-success-700" aria-hidden />
                  <p className="text-[11px] font-semibold text-success-700">Respondido por {responderName}</p>
                  <span className="text-velum-400 text-[10px]">·</span>
                  <p className="text-[10px] text-velum-500 capitalize">{respondedDate}</p>
                </div>
                <p className="text-[13px] text-velum-800 leading-snug">{s.feedbackResponseNote}</p>
              </div>
            )}

            {/* CTA respuesta — si NO está respondido */}
            {!isResponded && (
              <div className="mt-2">
                {openResponseFor === s.id ? (
                  <div className="space-y-2">
                    <textarea
                      value={responseText}
                      onChange={(e) => setResponseText(e.target.value)}
                      rows={3}
                      placeholder={isAdverse
                        ? 'Responde al paciente: indicaciones, ajustes para próxima sesión, signos de alarma...'
                        : 'Mensaje al paciente (opcional pero recomendado)'}
                      className="w-full rounded-xl bg-white border border-velum-200 px-3 py-2 text-[13px] text-velum-900 placeholder:text-velum-400 outline-none transition-all duration-base ease-standard focus:border-velum-700 focus:ring-2 focus:ring-velum-900/[0.06] resize-none"
                      autoFocus
                    />
                    {errorById[s.id] && (
                      <p className="text-[12px] text-danger-700 flex items-center gap-1">
                        <AlertTriangle size={11} /> {errorById[s.id]}
                      </p>
                    )}
                    <div className="flex items-center gap-2">
                      <PillButton
                        variant="primary"
                        size="sm"
                        onClick={() => handleSubmitResponse(s.id)}
                        isLoading={submittingId === s.id}
                        loadingLabel="Enviando…"
                        leftIcon={<Send size={12} aria-hidden />}
                      >
                        Enviar respuesta
                      </PillButton>
                      <button
                        type="button"
                        onClick={() => { setOpenResponseFor(null); setResponseText(''); }}
                        disabled={submittingId === s.id}
                        className="text-[12px] font-medium text-velum-500 hover:text-velum-900 transition-colors duration-base ease-standard disabled:opacity-40"
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => { setOpenResponseFor(s.id); setResponseText(''); }}
                    className={[
                      'inline-flex items-center gap-1.5 text-[12px] font-semibold transition-colors duration-base ease-standard',
                      isAdverse ? 'text-danger-700 hover:text-danger-700/80' : 'text-velum-700 hover:text-velum-900',
                    ].join(' ')}
                  >
                    <MessageSquare size={12} aria-hidden />
                    {isAdverse ? 'Responder al paciente (urgente)' : 'Responder al paciente'}
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};
