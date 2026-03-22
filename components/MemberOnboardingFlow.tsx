import React, { useCallback, useRef, useState } from 'react';
import { CheckCircle2, ChevronRight, Eraser, Pen, Sparkles } from 'lucide-react';
import { apiFetch } from '../services/apiClient';
import { useAuth } from '../context/AuthContext';

// ─── Fototipo tiles ──────────────────────────────────────────────────────────

const FOTOTIPOS = [
  { value: 1, label: 'Tipo I',   desc: 'Muy clara, siempre se quema',  color: '#FDEBD0', text: 'text-amber-900' },
  { value: 2, label: 'Tipo II',  desc: 'Clara, a veces broncea',        color: '#F5CBA7', text: 'text-amber-900' },
  { value: 3, label: 'Tipo III', desc: 'Media, broncea bien',           color: '#E59866', text: 'text-amber-900' },
  { value: 4, label: 'Tipo IV',  desc: 'Oliva, broncea fácil',          color: '#CA6F1E', text: 'text-white'     },
  { value: 5, label: 'Tipo V',   desc: 'Morena oscura',                 color: '#784212', text: 'text-white'     },
  { value: 6, label: 'Tipo VI',  desc: 'Muy oscura',                    color: '#2C1503', text: 'text-white'     },
] as const;

// ─── Signature pad (inline, minimal) ─────────────────────────────────────────

const InlineSignature: React.FC<{ onSave: (dataUrl: string) => void }> = ({ onSave }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [hasSig, setHasSig] = useState(false);

  const getPos = (e: React.MouseEvent | React.TouchEvent, canvas: HTMLCanvasElement) => {
    const rect = canvas.getBoundingClientRect();
    const src = 'touches' in e ? e.touches[0] : e;
    return { x: (src.clientX - rect.left) * (canvas.width / rect.width), y: (src.clientY - rect.top) * (canvas.height / rect.height) };
  };

  const start = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext('2d'); if (!ctx) return;
    const pos = getPos(e, canvas);
    ctx.beginPath(); ctx.moveTo(pos.x, pos.y);
    drawing.current = true;
  };

  const move = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    if (!drawing.current) return;
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext('2d'); if (!ctx) return;
    const pos = getPos(e, canvas);
    ctx.lineTo(pos.x, pos.y);
    ctx.strokeStyle = '#1a1614'; ctx.lineWidth = 2.5; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.stroke();
    setHasSig(true);
  };

  const end = () => { drawing.current = false; };

  const clear = () => {
    const canvas = canvasRef.current; if (!canvas) return;
    canvas.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height);
    setHasSig(false);
  };

  const save = () => {
    const canvas = canvasRef.current; if (!canvas) return;
    onSave(canvas.toDataURL('image/png'));
  };

  return (
    <div className="space-y-3">
      <div className="relative border-2 border-dashed border-velum-200 rounded-2xl bg-velum-50 overflow-hidden">
        <canvas
          ref={canvasRef} width={600} height={180}
          className="w-full touch-none cursor-crosshair"
          style={{ height: 180 }}
          onMouseDown={start} onMouseMove={move} onMouseUp={end} onMouseLeave={end}
          onTouchStart={start} onTouchMove={move} onTouchEnd={end}
        />
        {!hasSig && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="flex items-center gap-2 text-velum-300">
              <Pen size={16} />
              <span className="text-sm">Firma aquí</span>
            </div>
          </div>
        )}
      </div>
      <div className="flex gap-2">
        <button type="button" onClick={clear}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-velum-200 text-xs text-velum-600 hover:bg-velum-50 transition">
          <Eraser size={13} /> Limpiar
        </button>
        <button type="button" onClick={save} disabled={!hasSig}
          className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-velum-900 text-white text-sm font-medium hover:bg-velum-800 transition disabled:opacity-40">
          <CheckCircle2 size={15} /> Confirmar firma
        </button>
      </div>
    </div>
  );
};

// ─── Step indicator ───────────────────────────────────────────────────────────

const STEPS = ['Historia', 'Fototipo', 'Consentimiento', 'Lista'] as const;

const StepBar: React.FC<{ current: number }> = ({ current }) => (
  <div className="flex items-center gap-1.5 justify-center">
    {STEPS.map((label, i) => (
      <React.Fragment key={label}>
        <div className={`flex items-center gap-1 ${i <= current ? 'text-velum-900' : 'text-velum-300'}`}>
          <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold border-2 transition-all
            ${i < current ? 'bg-velum-900 border-velum-900 text-white' :
              i === current ? 'border-velum-900 text-velum-900' :
              'border-velum-200 text-velum-300'}`}>
            {i < current ? <CheckCircle2 size={12} /> : i + 1}
          </div>
          <span className="text-[10px] font-medium hidden sm:block">{label}</span>
        </div>
        {i < STEPS.length - 1 && (
          <div className={`flex-1 h-px max-w-8 transition-all ${i < current ? 'bg-velum-900' : 'bg-velum-100'}`} />
        )}
      </React.Fragment>
    ))}
  </div>
);

// ─── Main component ───────────────────────────────────────────────────────────

interface HistoryData { allergies: string; medications: string; skinConditions: string; }

export const MemberOnboardingFlow: React.FC = () => {
  const { user, completeOnboarding } = useAuth();
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Step 0 — Medical history
  const [history, setHistory] = useState<HistoryData>({ allergies: '', medications: '', skinConditions: '' });

  // Step 1 — Phototype
  const [phototype, setPhototype] = useState<number | null>(null);

  // Step 2 — Consent + signature
  const [consentAccepted, setConsentAccepted] = useState(false);
  const [signatureData, setSignatureData] = useState<string | null>(null);

  const firstName = user?.name?.split(' ')[0] ?? 'Bienvenida';

  // ── Save history (step 0 → 1) ──
  const saveHistory = useCallback(async () => {
    setSaving(true); setError(null);
    try {
      await apiFetch('/api/v1/medical-intakes/me', {
        method: 'PUT',
        body: JSON.stringify({
          historyJson: { allergies: history.allergies.trim(), medications: history.medications.trim(), skinConditions: history.skinConditions.trim() }
        })
      });
      setStep(1);
    } catch { setError('No se pudo guardar. Intenta de nuevo.'); }
    finally { setSaving(false); }
  }, [history]);

  // ── Save phototype (step 1 → 2) ──
  const savePhototype = useCallback(async () => {
    if (!phototype) return;
    setSaving(true); setError(null);
    try {
      await apiFetch('/api/v1/medical-intakes/me', { method: 'PUT', body: JSON.stringify({ phototype }) });
      setStep(2);
    } catch { setError('No se pudo guardar. Intenta de nuevo.'); }
    finally { setSaving(false); }
  }, [phototype]);

  // ── Save consent + submit (step 2 → 3) ──
  const saveConsent = useCallback(async () => {
    if (!consentAccepted || !signatureData) return;
    setSaving(true); setError(null);
    try {
      await apiFetch('/api/v1/medical-intakes/me', {
        method: 'PUT',
        body: JSON.stringify({
          consentAccepted: true,
          signatureKey: signatureData,
          status: 'submitted'
        })
      });
      setStep(3);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'No se pudo guardar.';
      setError(msg);
    } finally { setSaving(false); }
  }, [consentAccepted, signatureData]);

  const fieldCls = "w-full rounded-xl border border-velum-200 bg-velum-50 px-4 py-3 text-sm text-velum-900 placeholder:text-velum-400 outline-none focus:bg-white focus:border-velum-900 focus:ring-2 focus:ring-velum-900/10 transition resize-none";

  return (
    <div className="fixed inset-0 z-[9998] flex items-center justify-center p-4 bg-velum-900/80 backdrop-blur-md">
      <div className="w-full max-w-lg bg-white rounded-[28px] shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">

        {/* Header */}
        <div className="bg-velum-900 px-7 py-6 shrink-0">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-9 h-9 rounded-2xl bg-white/10 flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-white" />
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-velum-400">Velum Laser</p>
              <h2 className="text-base font-serif text-white">Activa tu expediente</h2>
            </div>
          </div>
          <StepBar current={step} />
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-7 py-6 space-y-5">

          {/* ── STEP 0: Historia clínica ── */}
          {step === 0 && (
            <>
              <div>
                <p className="text-lg font-serif text-velum-900">Hola, {firstName}</p>
                <p className="text-sm text-velum-500 mt-1">
                  Antes de tu primera sesión necesitamos conocer tu historial de salud. Solo toma 2 minutos.
                </p>
              </div>
              <div className="space-y-4">
                {([
                  { key: 'allergies',      label: 'Alergias',               hint: 'Latex, metales, medicamentos...' },
                  { key: 'medications',    label: 'Medicamentos actuales',   hint: 'Isotretinoína, antibióticos...' },
                  { key: 'skinConditions', label: 'Condiciones de piel',     hint: 'Psoriasis, vitiligo, acné...' },
                ] as const).map(({ key, label, hint }) => (
                  <div key={key}>
                    <label className="block text-[10px] font-bold uppercase tracking-widest text-velum-500 mb-1.5">{label}</label>
                    <textarea
                      rows={2} placeholder={`Ej. ${hint}`}
                      value={history[key]}
                      onChange={(e) => setHistory(p => ({ ...p, [key]: e.target.value }))}
                      className={fieldCls}
                    />
                  </div>
                ))}
                <p className="text-xs text-velum-400 italic">Si no tienes ninguna, deja el campo en blanco.</p>
              </div>
            </>
          )}

          {/* ── STEP 1: Fototipo ── */}
          {step === 1 && (
            <>
              <div>
                <p className="text-lg font-serif text-velum-900">Tu fototipo de piel</p>
                <p className="text-sm text-velum-500 mt-1">
                  Selecciona el que mejor describe cómo reacciona tu piel al sol.
                  Esto permite ajustar con precisión los parámetros del láser.
                </p>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {FOTOTIPOS.map((f) => (
                  <button key={f.value} type="button"
                    onClick={() => setPhototype(f.value)}
                    className={`rounded-2xl p-3 text-center border-2 transition-all ${phototype === f.value ? 'border-velum-900 scale-[1.03] shadow-md' : 'border-transparent hover:scale-[1.01]'}`}
                    style={{ backgroundColor: f.color }}>
                    <p className={`text-[11px] font-bold ${f.text}`}>{f.label}</p>
                    <p className={`text-[10px] mt-0.5 leading-tight ${f.text} opacity-80`}>{f.desc}</p>
                  </button>
                ))}
              </div>
              {phototype && phototype >= 4 && (
                <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-xs text-amber-800">
                  Fototipos IV–VI requieren parámetros de láser ajustados. Lo tendremos en cuenta para tu primera sesión.
                </div>
              )}
            </>
          )}

          {/* ── STEP 2: Consentimiento ── */}
          {step === 2 && (
            <>
              <div>
                <p className="text-lg font-serif text-velum-900">Consentimiento informado</p>
                <p className="text-sm text-velum-500 mt-1">
                  Antes de iniciar tu tratamiento es necesario que aceptes y firmes el consentimiento informado.
                </p>
              </div>
              <div className="bg-velum-50 rounded-2xl p-4 text-xs text-velum-700 space-y-2 max-h-36 overflow-y-auto leading-relaxed">
                <p><strong>Tratamiento:</strong> Depilación láser de diodo / Nd:YAG según fototipo.</p>
                <p><strong>Riesgos conocidos:</strong> Enrojecimiento temporal, hiperpigmentación post-inflamatoria (especialmente fototipos altos), sensibilidad al sol.</p>
                <p><strong>Cuidados post-sesión:</strong> Evitar exposición solar directa 48h, no aplicar productos irritantes, usar protector solar SPF 50+.</p>
                <p><strong>Contraindicaciones absolutas:</strong> Embarazo, uso de isotretinoína en los últimos 6 meses, herpes activo en zona a tratar, implantes metálicos en zona.</p>
                <p><strong>Resultados:</strong> Los resultados varían según fototipo, densidad y ciclo capilar. Se recomiendan entre 6 y 10 sesiones.</p>
              </div>
              <label className="flex items-start gap-3 cursor-pointer group">
                <input type="checkbox" checked={consentAccepted} onChange={(e) => setConsentAccepted(e.target.checked)}
                  className="mt-0.5 w-5 h-5 rounded border-velum-300 accent-velum-900 cursor-pointer shrink-0" />
                <span className="text-sm text-velum-700 group-hover:text-velum-900 transition">
                  He leído y entiendo el consentimiento informado. Acepto el tratamiento con láser en Velum Laser.
                </span>
              </label>
              {consentAccepted && !signatureData && (
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-velum-500 mb-2">Firma digital</p>
                  <InlineSignature onSave={setSignatureData} />
                </div>
              )}
              {signatureData && (
                <div className="flex items-center gap-2 text-emerald-700 bg-emerald-50 rounded-xl px-4 py-3">
                  <CheckCircle2 size={16} />
                  <span className="text-sm font-medium">Firma registrada</span>
                  <button type="button" onClick={() => setSignatureData(null)} className="ml-auto text-xs text-emerald-600 hover:text-emerald-800 underline">Volver a firmar</button>
                </div>
              )}
            </>
          )}

          {/* ── STEP 3: ¡Lista! ── */}
          {step === 3 && (
            <div className="flex flex-col items-center text-center py-4 gap-4">
              <div className="w-20 h-20 rounded-full bg-emerald-100 flex items-center justify-center">
                <CheckCircle2 className="w-10 h-10 text-emerald-600" />
              </div>
              <div>
                <p className="text-xl font-serif text-velum-900">¡Todo listo, {firstName}!</p>
                <p className="text-sm text-velum-500 mt-2 max-w-xs mx-auto">
                  Tu expediente ha sido enviado. Nuestro equipo lo revisará y recibirás confirmación.
                  Ya puedes explorar tu panel.
                </p>
              </div>
              <div className="w-full space-y-2 text-left bg-velum-50 rounded-2xl p-4 text-xs text-velum-600">
                <div className="flex items-center gap-2"><CheckCircle2 size={13} className="text-emerald-500 shrink-0" /> Historia clínica guardada</div>
                <div className="flex items-center gap-2"><CheckCircle2 size={13} className="text-emerald-500 shrink-0" /> Fototipo registrado</div>
                <div className="flex items-center gap-2"><CheckCircle2 size={13} className="text-emerald-500 shrink-0" /> Consentimiento firmado</div>
                <div className="flex items-center gap-2"><CheckCircle2 size={13} className="text-emerald-500 shrink-0" /> Expediente enviado para revisión</div>
              </div>
            </div>
          )}

          {error && (
            <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">{error}</p>
          )}
        </div>

        {/* Footer CTA */}
        <div className="px-7 py-5 border-t border-velum-100 shrink-0">
          {step === 0 && (
            <button onClick={saveHistory} disabled={saving}
              className="w-full flex items-center justify-center gap-2 bg-velum-900 text-white rounded-2xl py-3.5 text-[15px] font-semibold hover:bg-velum-800 transition disabled:opacity-50">
              {saving ? 'Guardando...' : 'Continuar'} {!saving && <ChevronRight size={16} />}
            </button>
          )}
          {step === 1 && (
            <div className="flex gap-2">
              <button onClick={() => setStep(0)}
                className="px-5 py-3.5 rounded-2xl border border-velum-200 text-sm text-velum-600 hover:bg-velum-50 transition">
                Atrás
              </button>
              <button onClick={savePhototype} disabled={!phototype || saving}
                className="flex-1 flex items-center justify-center gap-2 bg-velum-900 text-white rounded-2xl py-3.5 text-[15px] font-semibold hover:bg-velum-800 transition disabled:opacity-50">
                {saving ? 'Guardando...' : 'Continuar'} {!saving && <ChevronRight size={16} />}
              </button>
            </div>
          )}
          {step === 2 && (
            <div className="flex gap-2">
              <button onClick={() => setStep(1)}
                className="px-5 py-3.5 rounded-2xl border border-velum-200 text-sm text-velum-600 hover:bg-velum-50 transition">
                Atrás
              </button>
              <button onClick={saveConsent} disabled={!consentAccepted || !signatureData || saving}
                className="flex-1 flex items-center justify-center gap-2 bg-velum-900 text-white rounded-2xl py-3.5 text-[15px] font-semibold hover:bg-velum-800 transition disabled:opacity-50">
                {saving ? 'Enviando...' : 'Enviar expediente'} {!saving && <ChevronRight size={16} />}
              </button>
            </div>
          )}
          {step === 3 && (
            <button onClick={completeOnboarding}
              className="w-full flex items-center justify-center gap-2 bg-velum-900 text-white rounded-2xl py-3.5 text-[15px] font-semibold hover:bg-velum-800 transition">
              Ir a mi panel <ChevronRight size={16} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
