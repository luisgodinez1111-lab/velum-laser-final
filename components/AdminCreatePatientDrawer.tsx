import React, { useState } from "react";
import {
  X, User, Stethoscope, Sparkles, CreditCard,
  ChevronRight, ChevronLeft, CheckCircle2, Mail, Shield
} from "lucide-react";
import { memberService } from "../services/dataService";
import { DEFAULT_PHOTOTYPE_QUESTIONS, getFototipo } from "./PhototypeQuestionnaire";
import { MEMBERSHIPS } from "../constants";

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
  actorEmail?: string;
}

const fieldCls = "w-full rounded-xl border border-velum-200 px-4 py-3 text-sm text-velum-900 placeholder:text-velum-400 outline-none transition focus:border-velum-900 focus:ring-2 focus:ring-velum-900/10 bg-white";
const labelCls = "block text-[10px] font-bold uppercase tracking-[0.16em] text-velum-500 mb-1.5";

const STEP_META = [
  { label: "Datos personales", icon: User },
  { label: "Historial médico", icon: Stethoscope },
  { label: "Fototipo",         icon: Sparkles },
  { label: "Plan y acceso",    icon: CreditCard },
] as const;

const PHOTOTYPE_CODE_TO_NUM: Record<string, number> = { I: 1, II: 2, III: 3, IV: 4, V: 5, VI: 6 };

export const AdminCreatePatientDrawer: React.FC<Props> = ({ open, onClose, onCreated, actorEmail }) => {
  const [step, setStep]   = useState(1);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError]   = useState<string | null>(null);

  // Step 1 — Personal
  const [firstName, setFirstName] = useState("");
  const [lastName,  setLastName]  = useState("");
  const [email,     setEmail]     = useState("");
  const [phone,     setPhone]     = useState("");
  const [birthDate, setBirthDate] = useState("");

  // Step 2 — Medical history
  const [allergies,       setAllergies]       = useState("");
  const [medications,     setMedications]     = useState("");
  const [skinConditions,  setSkinConditions]  = useState("");

  // Step 3 — Phototype
  const [phototypeAnswers, setPhototypeAnswers] = useState<Record<string, string>>({});
  const [phototype, setPhototype] = useState<number | null>(null);

  // Step 4 — Plan
  const [planCode,          setPlanCode]          = useState("");
  const [activateMembership, setActivateMembership] = useState(true);
  const [sendCredentials,    setSendCredentials]    = useState(true);
  const [consentByAdmin,     setConsentByAdmin]     = useState(false);

  const reset = () => {
    setStep(1); setSaving(false); setSuccess(false); setError(null);
    setFirstName(""); setLastName(""); setEmail(""); setPhone(""); setBirthDate("");
    setAllergies(""); setMedications(""); setSkinConditions("");
    setPhototypeAnswers({}); setPhototype(null);
    setPlanCode(""); setActivateMembership(true); setSendCredentials(true); setConsentByAdmin(false);
  };

  const handleClose = () => { reset(); onClose(); };

  const handlePhototypeAnswer = (questionId: string, optionId: string) => {
    const updated = { ...phototypeAnswers, [questionId]: optionId };
    setPhototypeAnswers(updated);
    const allAnswered = DEFAULT_PHOTOTYPE_QUESTIONS.every((q) => updated[q.id]);
    if (allAnswered) {
      const total = DEFAULT_PHOTOTYPE_QUESTIONS.reduce((sum, q) => {
        const opt = q.options.find((o) => o.id === updated[q.id]);
        return sum + (opt?.score ?? 0);
      }, 0);
      const result = getFototipo(total);
      setPhototype(PHOTOTYPE_CODE_TO_NUM[result.phototype] ?? null);
    }
  };

  const phototypeResult = phototype !== null
    ? getFototipo(
        DEFAULT_PHOTOTYPE_QUESTIONS.reduce((sum, q) => {
          const opt = q.options.find((o) => o.id === phototypeAnswers[q.id]);
          return sum + (opt?.score ?? 0);
        }, 0)
      )
    : null;

  const handleNext = () => {
    setError(null);
    if (step === 1) {
      if (!firstName.trim()) { setError("El nombre es obligatorio."); return; }
      if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setError("Correo electrónico inválido."); return; }
    }
    if (step === 3 && !phototype) { setError("Responde todas las preguntas del cuestionario."); return; }
    setStep((s) => Math.min(s + 1, 4));
  };

  const handleSubmit = async () => {
    setError(null);
    if (activateMembership && !planCode) { setError("Selecciona un plan para activar la membresía."); return; }
    setSaving(true);
    try {
      await memberService.createPatient({
        email: email.trim().toLowerCase(),
        firstName: firstName.trim(),
        lastName:  lastName.trim(),
        phone:     phone.trim() || undefined,
        birthDate: birthDate   || undefined,
        intake: {
          personalJson: {
            fullName: `${firstName.trim()} ${lastName.trim()}`.trim(),
            phone: phone.trim(),
            birthDate
          },
          historyJson: {
            allergies,
            medications,
            skinConditions
          },
          phototype: phototype ?? undefined,
          consentAccepted: consentByAdmin,
          signatureKey: consentByAdmin
            ? `admin-signed:${new Date().toISOString()}:${actorEmail ?? "admin"}`
            : undefined
        },
        planCode:          activateMembership ? planCode : undefined,
        activateMembership: activateMembership,
        sendCredentials
      });
      setSuccess(true);
      setTimeout(() => { handleClose(); onCreated(); }, 1800);
    } catch (err: any) {
      setError(err?.message ?? "No se pudo crear el expediente. Intenta de nuevo.");
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={handleClose} />

      {/* Drawer */}
      <div className="absolute right-0 top-0 h-full w-full max-w-xl bg-white shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-velum-100 shrink-0">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-velum-400">Nuevo expediente</p>
            <h2 className="text-lg font-serif text-velum-900 mt-0.5">Crear paciente</h2>
          </div>
          <button onClick={handleClose} className="w-8 h-8 rounded-xl flex items-center justify-center hover:bg-velum-100 transition text-velum-500">
            <X size={16} />
          </button>
        </div>

        {/* Step indicator */}
        <div className="flex border-b border-velum-100 shrink-0">
          {STEP_META.map((meta, idx) => {
            const n = idx + 1;
            const Icon = meta.icon;
            const done = n < step;
            const active = n === step;
            return (
              <div key={n} className={`flex-1 flex flex-col items-center py-3 gap-1 border-b-2 transition ${active ? "border-velum-900" : done ? "border-emerald-400" : "border-transparent"}`}>
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition ${active ? "bg-velum-900 text-white" : done ? "bg-emerald-100 text-emerald-700" : "bg-velum-100 text-velum-400"}`}>
                  {done ? <CheckCircle2 size={14} /> : <Icon size={13} />}
                </div>
                <span className={`text-[9px] font-bold uppercase tracking-wider hidden sm:block ${active ? "text-velum-900" : done ? "text-emerald-600" : "text-velum-400"}`}>
                  {meta.label}
                </span>
              </div>
            );
          })}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-6">
          {success ? (
            <div className="flex flex-col items-center justify-center h-full gap-4">
              <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center">
                <CheckCircle2 className="w-8 h-8 text-emerald-600" />
              </div>
              <p className="text-base font-semibold text-velum-900 text-center">¡Expediente creado!</p>
              <p className="text-sm text-velum-500 text-center">El paciente ya puede iniciar sesión con las credenciales enviadas.</p>
            </div>
          ) : (
            <div className="space-y-5">
              {/* STEP 1 — Personal */}
              {step === 1 && (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className={labelCls}>Nombre *</label>
                      <input className={fieldCls} placeholder="María" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
                    </div>
                    <div>
                      <label className={labelCls}>Apellido(s)</label>
                      <input className={fieldCls} placeholder="García López" value={lastName} onChange={(e) => setLastName(e.target.value)} />
                    </div>
                  </div>
                  <div>
                    <label className={labelCls}>Correo electrónico *</label>
                    <input type="email" className={fieldCls} placeholder="paciente@correo.com" value={email} onChange={(e) => setEmail(e.target.value)} />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className={labelCls}>Teléfono</label>
                      <input className={fieldCls} placeholder="+52 614 000 0000" value={phone} onChange={(e) => setPhone(e.target.value)} />
                    </div>
                    <div>
                      <label className={labelCls}>Fecha de nacimiento</label>
                      <input type="date" className={fieldCls} value={birthDate} onChange={(e) => setBirthDate(e.target.value)} />
                    </div>
                  </div>
                </>
              )}

              {/* STEP 2 — Medical history */}
              {step === 2 && (
                <>
                  <div>
                    <label className={labelCls}>Alergias conocidas</label>
                    <textarea rows={3} className={`${fieldCls} resize-none`} placeholder="Penicilina, látex, ninguna..." value={allergies} onChange={(e) => setAllergies(e.target.value)} />
                  </div>
                  <div>
                    <label className={labelCls}>Medicamentos actuales</label>
                    <textarea rows={3} className={`${fieldCls} resize-none`} placeholder="Anticonceptivos, anticoagulantes, ninguno..." value={medications} onChange={(e) => setMedications(e.target.value)} />
                  </div>
                  <div>
                    <label className={labelCls}>Condiciones de piel</label>
                    <textarea rows={3} className={`${fieldCls} resize-none`} placeholder="Psoriasis, vitíligo, ninguna..." value={skinConditions} onChange={(e) => setSkinConditions(e.target.value)} />
                  </div>
                </>
              )}

              {/* STEP 3 — Phototype */}
              {step === 3 && (
                <div className="space-y-5">
                  {DEFAULT_PHOTOTYPE_QUESTIONS.map((q) => (
                    <div key={q.id}>
                      <p className="text-sm font-semibold text-velum-900 mb-2">{q.title}</p>
                      <div className="space-y-1.5">
                        {q.options.map((opt) => {
                          const checked = phototypeAnswers[q.id] === opt.id;
                          return (
                            <label key={opt.id} className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 text-sm cursor-pointer transition ${checked ? "border-velum-900 bg-velum-50 font-medium text-velum-900" : "border-velum-200 text-velum-700 hover:border-velum-400"}`}>
                              <input type="radio" name={q.id} value={opt.id} checked={checked}
                                onChange={() => handlePhototypeAnswer(q.id, opt.id)} className="accent-velum-900" />
                              {opt.label}
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                  {phototypeResult && (
                    <div className="rounded-2xl border border-velum-300 bg-velum-50 p-4">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-velum-500">Resultado</p>
                      <p className="mt-1 font-serif text-xl text-velum-900">Fototipo {phototypeResult.phototype}</p>
                      <p className="mt-1 text-sm text-velum-600">{phototypeResult.description}</p>
                    </div>
                  )}
                </div>
              )}

              {/* STEP 4 — Plan & access */}
              {step === 4 && (
                <div className="space-y-5">
                  {/* Plan selector */}
                  <div>
                    <label className={labelCls}>Plan de membresía</label>
                    <div className="grid grid-cols-2 gap-2">
                      {MEMBERSHIPS.map((m) => (
                        <button key={m.stripePriceId} type="button"
                          onClick={() => setPlanCode(m.stripePriceId)}
                          className={`rounded-xl border px-3 py-3 text-left transition ${planCode === m.stripePriceId ? "border-velum-900 bg-velum-900 text-white" : "border-velum-200 hover:border-velum-400 text-velum-700"}`}>
                          <p className={`text-xs font-bold ${planCode === m.stripePriceId ? "text-white" : "text-velum-900"}`}>{m.name}</p>
                          <p className={`text-[10px] mt-0.5 ${planCode === m.stripePriceId ? "text-white/70" : "text-velum-400"}`}>${m.price}/mes</p>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Toggles */}
                  <div className="space-y-3">
                    {[
                      { label: "Activar membresía ahora",    sub: "El plan seleccionado queda activo de inmediato", val: activateMembership, set: setActivateMembership, icon: CreditCard },
                      { label: "Enviar credenciales por correo", sub: "El paciente recibe email + contraseña temporal",  val: sendCredentials,    set: setSendCredentials,    icon: Mail },
                      { label: "Consentimiento firmado por admin", sub: "El admin certifica haber obtenido el consentimiento del paciente", val: consentByAdmin, set: setConsentByAdmin, icon: Shield },
                    ].map(({ label, sub, val, set, icon: Icon }) => (
                      <button key={label} type="button" onClick={() => set((v: boolean) => !v)}
                        className={`w-full flex items-center gap-3 rounded-xl border px-4 py-3 text-left transition ${val ? "border-velum-900 bg-velum-50" : "border-velum-200"}`}>
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${val ? "bg-velum-900 text-white" : "bg-velum-100 text-velum-400"}`}>
                          <Icon size={14} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className={`text-sm font-semibold ${val ? "text-velum-900" : "text-velum-600"}`}>{label}</p>
                          <p className="text-[11px] text-velum-400 mt-0.5">{sub}</p>
                        </div>
                        <div className={`w-10 h-5 rounded-full transition relative ${val ? "bg-velum-900" : "bg-velum-200"}`}>
                          <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${val ? "left-5" : "left-0.5"}`} />
                        </div>
                      </button>
                    ))}
                  </div>

                  {/* Summary */}
                  <div className="rounded-xl bg-velum-50 border border-velum-100 p-4 space-y-1.5 text-sm">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-velum-400 mb-2">Resumen</p>
                    <p><span className="text-velum-500">Paciente:</span> <span className="font-medium text-velum-900">{`${firstName} ${lastName}`.trim() || "—"}</span></p>
                    <p><span className="text-velum-500">Correo:</span> <span className="font-medium text-velum-900">{email || "—"}</span></p>
                    <p><span className="text-velum-500">Fototipo:</span> <span className="font-medium text-velum-900">{phototypeResult ? `Tipo ${phototypeResult.phototype}` : "—"}</span></p>
                    <p><span className="text-velum-500">Plan:</span> <span className="font-medium text-velum-900">{planCode ? MEMBERSHIPS.find(m => m.stripePriceId === planCode)?.name ?? planCode : "Sin plan"}</span></p>
                  </div>
                </div>
              )}

              {error && (
                <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">{error}</p>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        {!success && (
          <div className="px-6 py-4 border-t border-velum-100 flex gap-3 shrink-0">
            <button onClick={() => { setError(null); setStep((s) => Math.max(s - 1, 1)); }} disabled={step === 1 || saving}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-velum-200 text-sm text-velum-600 hover:bg-velum-50 transition disabled:opacity-40">
              <ChevronLeft size={15} /> Atrás
            </button>
            {step < 4 ? (
              <button onClick={handleNext} disabled={saving}
                className="flex-1 flex items-center justify-center gap-1.5 bg-velum-900 text-white rounded-xl py-2.5 text-sm font-semibold hover:bg-velum-800 transition disabled:opacity-50">
                Siguiente <ChevronRight size={15} />
              </button>
            ) : (
              <button onClick={handleSubmit} disabled={saving}
                className="flex-1 bg-velum-900 text-white rounded-xl py-2.5 text-sm font-semibold hover:bg-velum-800 transition disabled:opacity-50">
                {saving ? "Creando expediente..." : "Crear expediente"}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
