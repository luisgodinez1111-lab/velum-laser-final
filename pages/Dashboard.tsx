import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  Bell,
  BookOpen,
  Calendar,
  CheckCircle,
  ChevronDown,
  ChevronRight,
  CreditCard,
  ExternalLink,
  FileText,
  HelpCircle,
  KeyRound,
  Loader2,
  Lock,
  Mail,
  MessageCircle,
  MoreHorizontal,
  Phone,
  Plus,
  RefreshCw,
  Shield,
  User,
  X,
  Zap,
  ClipboardList,
  Download
} from "lucide-react";
import { Button } from "../components/Button";
import { SignaturePad } from "../components/SignaturePad";
import { useAuth } from "../context/AuthContext";
import { redirectToCustomerPortal, createSubscriptionCheckout } from "../services/stripeService";
import { MEMBERSHIPS } from "../constants";
import { documentService, memberService } from "../services/dataService";
import { LegalDocument, Member } from "../types";
import { clinicalService, Payment, SessionTreatment } from "../services/clinicalService";
import { useToast } from "../context/ToastContext";

type TabKey = "overview" | "citas" | "profile" | "security" | "records" | "historial" | "billing" | "ayuda";
type MeProfile = { fullName: string; email: string; phone: string };

import { apiFetch } from "../services/apiClient";

const asString = (v: unknown, fallback = ""): string => (typeof v === "string" ? v : fallback);

// ── Design tokens ────────────────────────────────────────────────────────────
const fld = "w-full rounded-2xl bg-velum-50 border border-velum-200/60 px-5 py-4 text-[15px] text-velum-900 placeholder:text-velum-400 outline-none transition-all duration-200 focus:bg-white focus:border-velum-900 focus:ring-4 focus:ring-velum-900/[0.07]";
const lbl = "mb-2 block text-[11px] font-bold uppercase tracking-[0.18em] text-velum-500";
const card = "bg-white rounded-2xl border border-velum-100 shadow-sm";
const pressBtn = "transition-transform duration-100 active:scale-[0.96]";
// ────────────────────────────────────────────────────────────────────────────

// ── Countdown hook ───────────────────────────────────────────────────────────
const useCountdown = (targetDate: string | null): string => {
  const [label, setLabel] = useState("");
  useEffect(() => {
    if (!targetDate) { setLabel(""); return; }
    const update = () => {
      const delta = new Date(targetDate).getTime() - Date.now();
      if (delta <= 0) { setLabel(""); return; }
      const d = Math.floor(delta / 86400000);
      const h = Math.floor((delta % 86400000) / 3600000);
      const m = Math.floor((delta % 3600000) / 60000);
      if (d > 1) setLabel(`en ${d} días`);
      else if (d === 1) setLabel(`mañana, ${h}h`);
      else if (h > 0) setLabel(`en ${h}h ${m}min`);
      else setLabel(`en ${m} minutos`);
    };
    update();
    const timer = setInterval(update, 60000);
    return () => clearInterval(timer);
  }, [targetDate]);
  return label;
};

// ── SVG Progress Ring ────────────────────────────────────────────────────────
const ProgressRing: React.FC<{ done: number; total: number; size?: number }> = ({ done, total, size = 72 }) => {
  const r = (size - 10) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ - (Math.min(done, total) / total) * circ;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ overflow: "visible" }}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#efeadd" strokeWidth="5" />
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#544538" strokeWidth="5"
        strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
        transform={`rotate(-90 ${size/2} ${size/2})`}
        style={{ transition: "stroke-dashoffset 0.9s cubic-bezier(0.16,1,0.3,1)" }} />
      <text x="50%" y="44%" textAnchor="middle" dominantBaseline="middle"
        style={{ fontSize: size > 60 ? 16 : 12, fontWeight: 800, fill: "#544538", fontFamily: "Lato,sans-serif" }}>
        {done}
      </text>
      <text x="50%" y="64%" textAnchor="middle" dominantBaseline="middle"
        style={{ fontSize: 8, fill: "#b89c76", fontFamily: "Lato,sans-serif", letterSpacing: 1 }}>
        /{total} SES.
      </text>
    </svg>
  );
};

// ── Skeleton ─────────────────────────────────────────────────────────────────
const Sk: React.FC<{ className?: string }> = ({ className = "" }) => (
  <div className={`skeleton ${className}`} />
);

// ── Appointment Card ─────────────────────────────────────────────────────────
const apptStatusLabel = (status: string) => {
  switch (status) {
    case "scheduled":   return { label: "Agendada",   cls: "bg-blue-50 text-blue-700 border-blue-200" };
    case "confirmed":   return { label: "Confirmada", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" };
    case "completed":   return { label: "Completada", cls: "bg-zinc-100 text-zinc-600 border-zinc-200" };
    case "canceled":    return { label: "Cancelada",  cls: "bg-red-50 text-red-600 border-red-200" };
    case "no_show":     return { label: "No asistió", cls: "bg-orange-50 text-orange-700 border-orange-200" };
    default:            return { label: status,        cls: "bg-zinc-100 text-zinc-600 border-zinc-200" };
  }
};

const AppointmentCard: React.FC<{
  appt: import("../services/clinicalService").Appointment;
  past?: boolean;
  onCancel?: () => void;
  onReschedule?: () => void;
}> = ({ appt, past, onCancel, onReschedule }) => {
  const { label, cls } = apptStatusLabel(appt.status);
  const start = new Date(appt.startAt);
  const end   = new Date(appt.endAt);
  const isActive = !past && appt.status !== "canceled" && appt.status !== "completed" && appt.status !== "no_show";
  return (
    <div className={`${card} card-hover overflow-hidden flex ${past ? "opacity-70" : ""}`}>
      {isActive && <div className="w-[3px] bg-velum-900 shrink-0 rounded-l-2xl" />}
      <div className="flex-1 px-4 py-4 sm:px-5">
        <div className="flex items-start gap-4">
          <div className="shrink-0 w-[52px] text-center bg-velum-50 border border-velum-100 rounded-2xl py-2">
            <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-velum-500 leading-none">
              {start.toLocaleDateString("es-MX", { month: "short" })}
            </p>
            <p className="text-[26px] font-serif font-bold text-velum-900 leading-tight">{start.getDate()}</p>
            <p className="text-[10px] text-velum-400 leading-none">{start.getFullYear()}</p>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-semibold text-velum-900 text-[15px] leading-snug">
                  {start.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })}
                  {" – "}
                  {end.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })}
                </p>
                {appt.treatment && <p className="text-[13px] text-velum-600 mt-0.5">{appt.treatment.name}</p>}
                {appt.cabin     && <p className="text-[12px] text-velum-400 mt-0.5">Cabina {appt.cabin.name}</p>}
                {appt.canceledReason && <p className="text-[12px] text-red-500 mt-1">Motivo: {appt.canceledReason}</p>}
              </div>
              <span className={`shrink-0 text-[10px] font-bold uppercase tracking-[0.1em] px-2.5 py-1 border rounded-full ${cls}`}>
                {label}
              </span>
            </div>
            {isActive && (onReschedule || onCancel) && (
              <div className="flex items-center gap-5 mt-3 pt-3 border-t border-velum-50">
                {onReschedule && (
                  <button type="button" onClick={onReschedule}
                    className={`flex items-center gap-1.5 text-[13px] font-medium text-velum-700 hover:text-velum-900 transition-colors ${pressBtn}`}>
                    <RefreshCw size={12} /> Reprogramar
                  </button>
                )}
                {onCancel && (
                  <button type="button" onClick={onCancel}
                    className={`flex items-center gap-1.5 text-[13px] font-medium text-red-500 hover:text-red-700 transition-colors ${pressBtn}`}>
                    <X size={12} /> Cancelar
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

const getPasswordChecks = (value: string) => ({
  length: value.length >= 12,
  upper: /[A-Z]/.test(value),
  lower: /[a-z]/.test(value),
  number: /[0-9]/.test(value),
  special: /[^A-Za-z0-9]/.test(value)
});


// ── Dashboard ─────────────────────────────────────────────────────────────────
export const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const { user, isAuthenticated, isSessionLoading: isAuthLoading } = useAuth();
  const toast = useToast();

  const [activeTab, setActiveTab] = useState<TabKey>("overview");
  const [tabKey, setTabKey] = useState(0); // triggers re-animation on tab switch
  const [showMoreSheet, setShowMoreSheet] = useState(false);

  const [memberData, setMemberData] = useState<Member | null>(null);
  const [membershipData, setMembershipData] = useState<any>(null);
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [sessions, setSessions] = useState<SessionTreatment[]>([]);
  const [isLoadingSessions, setIsLoadingSessions] = useState(false);
  const [appointments, setAppointments] = useState<import("../services/clinicalService").Appointment[]>([]);
  const [isLoadingAppointments, setIsLoadingAppointments] = useState(false);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [isLoadingPayments, setIsLoadingPayments] = useState(false);

  const [cancelApptId, setCancelApptId]     = useState<string | null>(null);
  const [cancelReason, setCancelReason]     = useState("");
  const [isCancellingAppt, setIsCancellingAppt] = useState(false);

  const [feedbackOpenId, setFeedbackOpenId] = useState<string | null>(null);
  const [feedbackText, setFeedbackText]     = useState("");
  const [savingFeedbackId, setSavingFeedbackId] = useState<string | null>(null);

  const [showSignatureModal, setShowSignatureModal] = useState(false);
  const [currentDocToSign, setCurrentDocToSign] = useState<LegalDocument | null>(null);

  const [profile, setProfile] = useState<MeProfile>({ fullName: "", email: "", phone: "" });
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [whatsappCode, setWhatsappCode] = useState("");
  const [isSendingCode, setIsSendingCode] = useState(false);
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);

  const [rescheduleApptId, setRescheduleApptId] = useState<string | null>(null);
  const [isActivatingPlan, setIsActivatingPlan] = useState(false);
  const [rescheduleDate, setRescheduleDate] = useState<string | null>(null);
  const [rescheduleSlots, setRescheduleSlots] = useState<Array<{label: string; startMinute: number; endMinute: number; available: boolean}>>([]);
  const [rescheduleSlot, setRescheduleSlot] = useState<{label: string; startMinute: number; endMinute: number; available: boolean} | null>(null);
  const [isLoadingRescheduleSlots, setIsLoadingRescheduleSlots] = useState(false);
  const [isRescheduling, setIsRescheduling] = useState(false);
  const [calendarBase2, setCalendarBase2] = useState<Date>(() => { const d = new Date(); d.setDate(1); return d; });

  const [openFaqId, setOpenFaqId]       = useState<string | null>(null);
  const [showEditIntake, setShowEditIntake] = useState(false);

  type InAppNotif = { id: string; title: string; body: string | null; read: boolean; createdAt: string };
  const [inAppNotifs, setInAppNotifs] = useState<InAppNotif[]>([]);
  const [inAppUnread, setInAppUnread] = useState(0);
  const [markingAllRead, setMarkingAllRead] = useState(false);
  const [intakeDraft, setIntakeDraft]   = useState({ fullName: "", phone: "", birthDate: "", allergies: "", medications: "", skinConditions: "" });
  const [isSavingIntake, setIsSavingIntake] = useState(false);

  const passwordChecks = useMemo(() => getPasswordChecks(newPassword), [newPassword]);

  // Tab switch → animate content
  const switchTab = (key: TabKey) => {
    setActiveTab(key);
    setTabKey(k => k + 1);
    setShowMoreSheet(false);
  };

  useEffect(() => {
    if (isAuthLoading) return;
    if (!isAuthenticated) { navigate("/agenda?mode=login", { replace: true }); return; }
    const load = async () => {
      setIsLoadingData(true);
      try {
        if (user?.role === "member") {
          const [d, ms] = await Promise.all([
            memberService.getById(user.id),
            apiFetch<any>("/membership/status").catch(() => null),
          ]);
          setMemberData(d || null);
          setMembershipData(ms || null);
        }
        const me = await apiFetch<any>("/v1/users/me/profile");
        setProfile({ fullName: asString(me?.fullName), email: asString(me?.email, asString(user?.email)), phone: asString(me?.phone) });
      } catch { /* network or auth error — handled by apiFetch */ }
      finally { setIsLoadingData(false); }

      setIsLoadingSessions(true);
      try { setSessions(await clinicalService.getMySessions()); }
      catch { setSessions([]); } finally { setIsLoadingSessions(false); }

      setIsLoadingAppointments(true);
      try { setAppointments(await clinicalService.listMyAppointments()); }
      catch { setAppointments([]); } finally { setIsLoadingAppointments(false); }

      setIsLoadingPayments(true);
      try { setPayments(await clinicalService.getMyPayments()); }
      catch { setPayments([]); } finally { setIsLoadingPayments(false); }

      try {
        const nd = await apiFetch<any>("/v1/notifications?limit=20");
        const list: InAppNotif[] = nd?.items ?? [];
        setInAppNotifs(list);
        setInAppUnread(nd?.unread ?? list.filter((n) => !n.read).length);
      } catch { /* silent */ }
    };
    void load();

    // Poll unread count every 60s to keep badge fresh
    const pollInterval = setInterval(async () => {
      try {
        const nc = await apiFetch<{ count: number }>("/v1/notifications/unread-count");
        setInAppUnread(nc?.count ?? 0);
      } catch { /* silent */ }
    }, 60_000);
    return () => clearInterval(pollInterval);
  }, [isAuthLoading, isAuthenticated, navigate, user?.email, user?.id, user?.role]);

  // Detect Stripe checkout return URLs
  useEffect(() => {
    if (!isAuthenticated) return;
    const hash = window.location.hash;
    const search = hash.includes("?") ? hash.split("?")[1] : "";
    const params = new URLSearchParams(search);
    const checkout = params.get("checkout");
    const plan = params.get("plan");
    if (checkout === "success") {
      const planLabel = plan ? ` ${plan.charAt(0).toUpperCase() + plan.slice(1)}` : "";
      toast.success(`¡Membresía${planLabel} activada! Bienvenida a Velum Laser.`);
      window.history.replaceState(null, "", window.location.pathname + "#/dashboard");
      setActiveTab("billing");
      setTabKey(k => k + 1);
    } else if (checkout === "cancelled") {
      toast.info("El pago fue cancelado. Puedes intentarlo cuando quieras.");
      window.history.replaceState(null, "", window.location.pathname + "#/dashboard");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated]);

  const handleMarkAllRead = async () => {
    setMarkingAllRead(true);
    try {
      await apiFetch("/v1/notifications/read-all", { method: "POST" });
      setInAppNotifs(prev => prev.map(n => ({ ...n, read: true })));
      setInAppUnread(0);
    } catch { /* silent */ } finally { setMarkingAllRead(false); }
  };

  const handleCancelAppointment = async () => {
    if (!cancelApptId) return;
    setIsCancellingAppt(true);
    try {
      await clinicalService.updateAppointment(cancelApptId, { action: "cancel", ...(cancelReason.trim() ? { canceledReason: cancelReason.trim() } : {}) });
      setAppointments(prev => prev.map(a => a.id === cancelApptId ? { ...a, status: "canceled", canceledReason: cancelReason.trim() || undefined } : a));
      toast.success("Cita cancelada correctamente.");
    } catch (err: any) { toast.error(asString(err?.message, "No se pudo cancelar.")); }
    finally { setIsCancellingAppt(false); setCancelApptId(null); setCancelReason(""); }
  };

  const handleSubmitFeedback = async (sessionId: string) => {
    if (!feedbackText.trim()) return;
    setSavingFeedbackId(sessionId);
    try {
      const updated = await clinicalService.addSessionFeedback(sessionId, feedbackText.trim());
      setSessions(prev => prev.map(s => s.id === sessionId ? updated : s));
      setFeedbackOpenId(null); setFeedbackText(""); toast.success("Comentario guardado.");
    } catch (err: any) { toast.error(asString(err?.message, "No se pudo guardar.")); }
    finally { setSavingFeedbackId(null); }
  };

  const initiateSigning = (doc: LegalDocument) => { setCurrentDocToSign(doc); setShowSignatureModal(true); };

  const handleSignatureSave = async (signatureData: string) => {
    if (!currentDocToSign || !user) return;
    try {
      await documentService.signDocument(currentDocToSign.id, signatureData);
      toast.success("Documento firmado correctamente.");
      const u = await memberService.getById(user.id);
      setMemberData(u || null);
    } catch (err: any) {
      toast.error(asString(err?.message, "No se pudo firmar el documento."));
    } finally {
      setShowSignatureModal(false);
      setCurrentDocToSign(null);
    }
  };

  const handleSaveProfile = async () => {
    if (!profile.fullName.trim() || !profile.email.trim() || !profile.phone.trim()) { toast.warning("Nombre, correo y teléfono son obligatorios."); return; }
    setIsSavingProfile(true);
    try {
      const out = await apiFetch<any>("/v1/users/me/profile", { method: "PUT", body: JSON.stringify({ fullName: profile.fullName.trim(), email: profile.email.trim(), phone: profile.phone.trim() }) });
      setProfile(prev => ({ ...prev, fullName: asString(out?.profile?.fullName, prev.fullName), email: asString(out?.profile?.email, prev.email), phone: asString(out?.profile?.phone, prev.phone) }));
      toast.success(asString(out?.message, "Perfil actualizado."));
    } catch (err: any) { toast.error(asString(err?.message, "No se pudo actualizar.")); }
    finally { setIsSavingProfile(false); }
  };

  const handleRequestWhatsappCode = async () => {
    if (!profile.phone.trim()) { toast.warning("Primero registra tu teléfono en Perfil."); return; }
    setIsSendingCode(true);
    try { const out = await apiFetch<any>("/v1/users/me/password/request-whatsapp-code", { method: "POST", body: JSON.stringify({ phone: profile.phone.trim() }) }); toast.info(asString(out?.message, "Código enviado.")); }
    catch (err: any) { toast.error(asString(err?.message, "No se pudo enviar.")); }
    finally { setIsSendingCode(false); }
  };

  const handleChangePassword = async () => {
    if (!currentPassword || !newPassword || !confirmPassword || !whatsappCode) { toast.warning("Completa todos los campos."); return; }
    if (newPassword !== confirmPassword) { toast.warning("Las contraseñas no coinciden."); return; }
    if (!Object.values(passwordChecks).every(Boolean)) { toast.warning("La contraseña no cumple la política de seguridad."); return; }
    setIsUpdatingPassword(true);
    try {
      const out = await apiFetch<any>("/v1/users/me/password", { method: "POST", body: JSON.stringify({ currentPassword, newPassword, whatsappCode }) });
      toast.success(asString(out?.message, "Contraseña actualizada.")); setCurrentPassword(""); setNewPassword(""); setConfirmPassword(""); setWhatsappCode("");
    } catch (err: any) { toast.error(asString(err?.message, "No se pudo actualizar.")); }
    finally { setIsUpdatingPassword(false); }
  };

  const toDateKey2 = (d: Date) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;

  const calendarDays2 = (() => {
    const year = calendarBase2.getFullYear(), month = calendarBase2.getMonth();
    const firstDow = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month+1, 0).getDate();
    const earliest = new Date(Date.now() + 86400000);
    const latest   = new Date(Date.now() + 60*86400000);
    const cells: Array<{ date: Date|null; dateKey: string|null; selectable: boolean }> = [];
    for (let i = 0; i < firstDow; i++) cells.push({ date: null, dateKey: null, selectable: false });
    for (let d = 1; d <= daysInMonth; d++) { const date = new Date(year, month, d); cells.push({ date, dateKey: toDateKey2(date), selectable: date >= earliest && date <= latest }); }
    return cells;
  })();

  const handleRescheduleSelectDate = async (dateKey: string) => {
    setRescheduleDate(dateKey); setRescheduleSlot(null); setRescheduleSlots([]);
    setIsLoadingRescheduleSlots(true);
    try { const r = await clinicalService.getPublicAgendaSlots(dateKey); setRescheduleSlots(r.isOpen ? r.slots : []); }
    catch { setRescheduleSlots([]); } finally { setIsLoadingRescheduleSlots(false); }
  };

  const handleConfirmReschedule = async () => {
    if (!rescheduleApptId || !rescheduleDate || !rescheduleSlot) return;
    setIsRescheduling(true);
    try {
      const [y, mo, d] = rescheduleDate.split("-").map(Number);
      const startAt = new Date(y, mo-1, d, 0, rescheduleSlot.startMinute, 0, 0);
      const endAt   = new Date(y, mo-1, d, 0, rescheduleSlot.endMinute,   0, 0);
      await clinicalService.updateAppointment(rescheduleApptId, { action: "reschedule", startAt: startAt.toISOString(), endAt: endAt.toISOString() });
      setAppointments(prev => prev.map(a => a.id === rescheduleApptId ? { ...a, startAt: startAt.toISOString(), endAt: endAt.toISOString(), status: "scheduled" } : a));
      toast.success("Cita reprogramada correctamente.");
      setRescheduleApptId(null); setRescheduleDate(null); setRescheduleSlots([]); setRescheduleSlot(null);
    } catch (err: any) { toast.error(asString(err?.message, "No se pudo reprogramar.")); }
    finally { setIsRescheduling(false); }
  };

  const handleOpenEditIntake = async () => {
    try {
      const intake = await clinicalService.getMyMedicalIntake();
      const pj = (intake.personalJson as any) ?? {};
      const hj = (intake.historyJson as any) ?? {};
      setIntakeDraft({ fullName: asString(pj.fullName), phone: asString(pj.phone), birthDate: asString(pj.birthDate), allergies: asString(hj.allergies), medications: asString(hj.medications), skinConditions: asString(hj.skinConditions) });
      setShowEditIntake(true);
    } catch { toast.error("No se pudo cargar el expediente."); }
  };

  const handleSaveIntake = async () => {
    setIsSavingIntake(true);
    try {
      await clinicalService.updateMyMedicalIntake({ personalJson: { fullName: intakeDraft.fullName, phone: intakeDraft.phone, birthDate: intakeDraft.birthDate }, historyJson: { allergies: intakeDraft.allergies, medications: intakeDraft.medications, skinConditions: intakeDraft.skinConditions } });
      toast.success("Expediente actualizado."); setShowEditIntake(false);
    } catch (err: any) { toast.error(asString(err?.message, "No se pudo guardar.")); }
    finally { setIsSavingIntake(false); }
  };

  const CARE = {
    pre:  ["Evita la exposición solar directa 48 horas antes de la sesión.", "No apliques cremas, aceites ni desodorante en la zona a tratar el día de la cita.", "Rasurar la zona 24–48 horas antes (no usar cera ni depilación eléctrica).", "Llega limpio/a y sin maquillaje en zonas faciales."],
    post: ["Aplica gel de aloe vera o crema calmante en la zona tratada las primeras 24 h.", "Evita el sol directo por al menos 72 horas. Usa protector solar FPS 50+.", "No uses sauna, tina caliente ni actividad física intensa por 24 horas.", "Es normal sentir enrojecimiento leve o sensación de calor las primeras horas.", "Hidrata bien la zona en los siguientes días."]
  };

  const FAQ = [
    { id: "q1", q: "¿Cuántas sesiones necesito para ver resultados?", a: "La mayoría de pacientes nota reducción visible desde la 3ª o 4ª sesión. El protocolo completo es de 8 a 12 sesiones dependiendo del tipo de piel y zona. Con la membresía mensual mantienes el ritmo óptimo." },
    { id: "q2", q: "¿Cuándo puedo exponer la zona al sol?", a: "Se recomienda evitar el sol directo 72 horas después de cada sesión. Fuera de ese período, usa siempre protector solar FPS 50+ en zonas tratadas." },
    { id: "q3", q: "¿Puedo cancelar mi membresía cuando quiera?", a: "Sí. Puedes cancelar en cualquier momento desde el Portal de Cliente (Pagos → Portal de cliente). La cancelación aplica al siguiente ciclo de facturación." },
    { id: "q4", q: "¿Qué pasa si no puedo asistir a mi cita?", a: "Puedes reprogramar tu cita con al menos 24 horas de anticipación sin costo. Para cancelaciones con menos tiempo, consulta nuestra política de cancelación." },
    { id: "q5", q: "¿El depósito de $200 se descuenta de la membresía?", a: "Sí. Si reservas una cita de valoración con el depósito de $200, ese monto se descuenta automáticamente de tu primera mensualidad al activar la membresía." },
    { id: "q6", q: "¿Es seguro para todo tipo de piel?", a: "Nuestro protocolo incluye la evaluación de fototipo Fitzpatrick en tu expediente médico. Los parámetros del láser se ajustan individualmente para cada tipo de piel, desde el I hasta el VI." },
  ];

  // ── Guards ─────────────────────────────────────────────────────────────────
  if (isAuthLoading || (isAuthenticated && isLoadingData)) {
    return (
      <div className="min-h-screen bg-velum-50 flex flex-col items-center justify-center gap-4 p-8">
        <div className="w-full max-w-sm space-y-3">
          <Sk className="h-16 rounded-2xl" />
          <div className="grid grid-cols-3 gap-3"><Sk className="h-20" /><Sk className="h-20" /><Sk className="h-20" /></div>
          <Sk className="h-32 rounded-2xl" />
          <Sk className="h-24 rounded-2xl" />
        </div>
      </div>
    );
  }
  if (!isAuthenticated) return null;

  // ── Derived data ───────────────────────────────────────────────────────────
  const documents = (memberData as any)?.clinical?.documents || [];
  const pendingDocs = documents.filter((d: any) => !d.signed).length;

  const upcomingAppointments = appointments.filter(
    a => (a.status === "scheduled" || a.status === "confirmed") && new Date(a.startAt) >= new Date()
  ).sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime());

  const pastAppointments = appointments.filter(
    a => a.status === "completed" || a.status === "canceled" || a.status === "no_show" ||
      ((a.status === "scheduled" || a.status === "confirmed") && new Date(a.startAt) < new Date())
  ).sort((a, b) => new Date(b.startAt).getTime() - new Date(a.startAt).getTime());

  const membership       = membershipData;
  const membershipStatus = membership?.status ?? "inactive";
  const interestedPlanCode = asString(membershipData?.interestedPlanCode ?? "");
  const hasDepositCredit   = !!(membershipData?.appointmentDepositAvailable);
  const statusStyles: Record<string, { label: string; cls: string }> = {
    active:   { label: "Activa",          cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
    inactive: { label: "Inactiva",        cls: "bg-velum-100 text-velum-600 border-velum-200"     },
    past_due: { label: "Pago pendiente",  cls: "bg-amber-50 text-amber-700 border-amber-200"      },
    canceled: { label: "Cancelada",       cls: "bg-red-50 text-red-600 border-red-200"            },
    paused:   { label: "Pausada",         cls: "bg-zinc-100 text-zinc-600 border-zinc-200"        },
  };
  const { label: msLabel, cls: msCls } = statusStyles[membershipStatus] ?? statusStyles.inactive;

  // Use catalog name if available, otherwise fall back to planId pattern matching
  const planDetails = membership?.planDetails as { amount?: number; interval?: string; planName?: string } | null | undefined;
  const planLabel = planDetails?.planName ?? (membership?.planId ? (() => {
    const id = asString(membership.planId);
    if (id.includes("essential") || id === "price_1Ss9MjC79KgflLkOKahgvEtp") return "Essential";
    if (id.includes("select")    || id === "price_1T4OoEC79KgflLkO0yEIJAii") return "Select";
    if (id.includes("advance")   || id === "price_1T4OmAC79KgflLkOoT3QKemx") return "Advance";
    if (id.includes("progress")  || id === "price_1T4OmqC79KgflLkOc0birwNi") return "Progress";
    if (id.includes("signature") || id === "price_1T4OnTC79KgflLkOgKXHzWSq") return "Signature";
    return id;
  })() : null);
  const intervalLabel: Record<string, string> = { month: "/ mes", year: "/ año", week: "/ semana", day: "/ día" };
  const planPrice = planDetails?.amount ? `$${planDetails.amount.toLocaleString("es-MX")} MXN ${intervalLabel[planDetails.interval ?? "month"] ?? "/ mes"}` : null;

  const intakeStatus  = asString(memberData?.intakeStatus);
  const hasAppointment = appointments.length > 0;
  const onboardingSteps = [
    { id: "register", label: "Cuenta creada",      done: true },
    { id: "intake",   label: "Expediente médico",  done: intakeStatus === "submitted" || intakeStatus === "approved" },
    { id: "approved", label: "Aprobación clínica", done: intakeStatus === "approved" },
    { id: "appt",     label: "Primera cita",       done: hasAppointment },
  ];
  const onboardingComplete = onboardingSteps.every(s => s.done);
  const nextStep = onboardingSteps.find(s => !s.done);

  const initials = (profile.fullName || user?.name || "?").split(" ").map((n: string) => n[0]).slice(0, 2).join("").toUpperCase();
  const firstName = (profile.fullName || user?.name || "").split(" ")[0] || "Bienvenida";

  // notification count
  const notifCount = pendingDocs + ((!intakeStatus || intakeStatus === "draft") ? 1 : 0) + inAppUnread;

  // countdown
  const nextApptDate = upcomingAppointments[0]?.startAt ?? null;

  // ── Tabs config ────────────────────────────────────────────────────────────
  const allTabs: Array<{ key: TabKey; label: string; short: string }> = [
    { key: "overview",  label: "Resumen",     short: "Inicio"   },
    { key: "citas",     label: `Citas${appointments.length > 0 ? ` (${appointments.length})` : ""}`, short: "Citas" },
    { key: "historial", label: `Historial${sessions.length > 0 ? ` (${sessions.length})` : ""}`, short: "Sesiones" },
    { key: "billing",   label: "Pagos",       short: "Pagos"    },
    { key: "ayuda",     label: "Ayuda",       short: "Ayuda"    },
    { key: "profile",   label: "Perfil",      short: "Perfil"   },
    { key: "security",  label: "Seguridad",   short: "Seguridad"},
    { key: "records",   label: "Expedientes", short: "Docs"     },
  ];
  const primaryMobileTabs: TabKey[] = ["overview", "citas", "historial", "billing", "ayuda"];
  const secondaryMobileTabs: TabKey[] = ["profile", "security", "records"];

  const tabIcons: Record<TabKey, React.ReactNode> = {
    overview:  <User size={18} />,
    citas:     <Calendar size={18} />,
    profile:   <FileText size={18} />,
    security:  <Lock size={18} />,
    records:   <Shield size={18} />,
    historial: <ClipboardList size={18} />,
    billing:   <CreditCard size={18} />,
    ayuda:     <HelpCircle size={18} />,
  };

  // Label for the desktop sidebar (all tabs)
  const sidebarTabs = allTabs;
  const tabLabel = allTabs.find(t => t.key === activeTab)?.label ?? "";

  // ── RENDER ────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-[calc(100vh-7rem)] bg-velum-50 pb-24 lg:pb-0">

      {/* ─── Sticky Header ─────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-xl border-b border-velum-100/80">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-[60px] flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-[9px] bg-velum-900 flex items-center justify-center text-[11px] font-bold text-white shadow-sm shrink-0 select-none">
              {initials}
            </div>
            <div className="flex items-center gap-2">
              <p className="text-[14px] font-semibold text-velum-900 leading-none hidden sm:block">{firstName}</p>
              <span className="hidden sm:block text-velum-300">/</span>
              <p className="text-[14px] font-medium text-velum-500 leading-none">{tabLabel}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {notifCount > 0 && (
              <button type="button" onClick={() => switchTab("records")}
                className={`relative flex items-center gap-1.5 rounded-xl px-3 py-1.5 bg-velum-50 border border-velum-100 hover:border-velum-200 transition-colors ${pressBtn}`}>
                <Bell size={14} className="text-velum-700" />
                <span className="text-[11px] font-bold text-velum-900">{notifCount}</span>
              </button>
            )}
            <span className={`hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-[0.16em] border ${msCls}`}>
              {msLabel}
            </span>
          </div>
        </div>
      </header>

      {/* ─── Main Layout ───────────────────────────────────────────────────── */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-5 lg:py-6 flex flex-col lg:flex-row gap-5 lg:gap-6">

        {/* Desktop Sidebar */}
        <aside className="hidden lg:block w-52 shrink-0 self-start sticky top-[68px]">
          <nav className={`${card} overflow-hidden`}>
            {sidebarTabs.map((tab, idx) => (
              <button key={tab.key} type="button" onClick={() => switchTab(tab.key)}
                className={`w-full flex items-center gap-3 px-4 py-3.5 text-[13px] font-medium transition-all duration-150 text-left ${idx > 0 ? "border-t border-velum-50" : ""} ${
                  activeTab === tab.key ? "bg-velum-900 text-white" : "text-velum-700 hover:bg-velum-50 hover:text-velum-900"
                }`}>
                <span className={`shrink-0 ${activeTab === tab.key ? "text-white" : "text-velum-400"}`}>
                  {tabIcons[tab.key]}
                </span>
                {tab.label}
                {activeTab === tab.key && <ChevronRight size={13} className="ml-auto opacity-50" />}
              </button>
            ))}
          </nav>
        </aside>

        {/* Content — key triggers fade-slide-in on tab switch */}
        <main key={tabKey} className="flex-1 min-w-0 animate-tab-in">

          {/* ══ OVERVIEW ════════════════════════════════════════════════════ */}
          {activeTab === "overview" && (
            <div className="space-y-4">

              {/* Status alerts */}
              {intakeStatus === "submitted" && (
                <div className="flex items-start gap-3 bg-amber-50 border border-amber-200/80 rounded-2xl px-4 py-3.5 animate-fade-in">
                  <div className="w-7 h-7 rounded-xl bg-amber-100 flex items-center justify-center shrink-0 mt-0.5"><Bell size={13} className="text-amber-600" /></div>
                  <div>
                    <p className="text-[13px] font-semibold text-amber-900">Expediente en revisión</p>
                    <p className="text-[12px] text-amber-700 mt-0.5 leading-snug">Nuestro equipo clínico lo revisará en menos de 24 horas hábiles.</p>
                  </div>
                </div>
              )}
              {intakeStatus === "rejected" && (
                <div className="flex items-start gap-3 bg-red-50 border border-red-200/80 rounded-2xl px-4 py-3.5 animate-fade-in">
                  <div className="w-7 h-7 rounded-xl bg-red-100 flex items-center justify-center shrink-0 mt-0.5"><AlertTriangle size={13} className="text-red-500" /></div>
                  <div>
                    <p className="text-[13px] font-semibold text-red-900">Expediente requiere correcciones</p>
                    <p className="text-[12px] text-red-700 mt-0.5">
                      <button onClick={() => switchTab("records")} className="underline font-medium">Actualiza tu expediente</button> para continuar.
                    </p>
                  </div>
                </div>
              )}
              {(!intakeStatus || intakeStatus === "draft") && (
                <div className="flex items-start gap-3 bg-velum-900 rounded-2xl px-4 py-3.5 animate-fade-in">
                  <div className="w-7 h-7 rounded-xl bg-velum-800 flex items-center justify-center shrink-0 mt-0.5"><FileText size={13} className="text-velum-300" /></div>
                  <div className="flex-1">
                    <p className="text-[13px] font-semibold text-white">Completa tu expediente médico</p>
                    <p className="text-[12px] text-velum-400 mt-0.5">Necesario para personalizar tu tratamiento. Menos de 3 minutos.</p>
                  </div>
                  <button onClick={() => switchTab("records")} className={`shrink-0 self-center text-[11px] font-bold text-velum-900 bg-white rounded-xl px-3 py-1.5 hover:bg-velum-100 transition-colors ${pressBtn}`}>
                    Ir →
                  </button>
                </div>
              )}

              {/* In-app notifications panel */}
              {inAppNotifs.length > 0 && (
                <div className="bg-white rounded-2xl border border-velum-100 overflow-hidden">
                  <div className="px-4 py-3 border-b border-velum-100 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Bell size={14} className="text-velum-600" />
                      <p className="text-[11px] font-bold uppercase tracking-widest text-velum-500">Notificaciones</p>
                      {inAppUnread > 0 && (
                        <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-velum-900 text-white text-[9px] font-bold">{inAppUnread}</span>
                      )}
                    </div>
                    {inAppUnread > 0 && (
                      <button onClick={handleMarkAllRead} disabled={markingAllRead}
                        className="flex items-center gap-1.5 text-[11px] font-medium text-velum-600 hover:text-velum-900 transition-colors disabled:opacity-40">
                        {markingAllRead ? <Loader2 size={11} className="animate-spin" /> : <CheckCircle size={11} />}
                        Marcar todo como leído
                      </button>
                    )}
                  </div>
                  <div className="divide-y divide-velum-50">
                    {inAppNotifs.map((n) => (
                      <div key={n.id} className={`px-4 py-3 flex items-start gap-3 transition-colors ${n.read ? "opacity-60" : "bg-velum-50/50"}`}>
                        <div className={`mt-0.5 w-1.5 h-1.5 rounded-full shrink-0 ${n.read ? "bg-velum-300" : "bg-velum-900"}`} />
                        <div className="flex-1 min-w-0">
                          <p className="text-[13px] font-semibold text-velum-900 leading-snug">{n.title}</p>
                          {n.body && <p className="text-[12px] text-velum-500 mt-0.5 leading-snug">{n.body}</p>}
                        </div>
                        <p className="shrink-0 text-[10px] text-velum-400">
                          {new Date(n.createdAt).toLocaleDateString("es-MX", { day: "2-digit", month: "short" })}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Next appointment hero */}
              {upcomingAppointments.length > 0 ? (
                <div className="bg-velum-900 rounded-2xl p-5 sm:p-6 text-white relative overflow-hidden">
                  <div className="absolute -right-12 -top-12 w-40 h-40 rounded-full bg-velum-800/40 pointer-events-none" />
                  <div className="absolute right-4 bottom-4 w-20 h-20 rounded-full bg-velum-800/25 pointer-events-none" />
                  <div className="relative">
                    <div className="flex items-start justify-between gap-3 mb-1">
                      <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-velum-400">Próxima cita</p>
                      <NextApptCountdown date={nextApptDate} />
                    </div>
                    <p className="font-serif text-[28px] sm:text-[34px] italic text-white leading-tight mt-1">
                      {new Date(upcomingAppointments[0].startAt).toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "long" })}
                    </p>
                    <p className="text-[14px] text-velum-300 mt-2">
                      {new Date(upcomingAppointments[0].startAt).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })}
                      {upcomingAppointments[0].treatment ? ` · ${upcomingAppointments[0].treatment.name}` : ""}
                    </p>
                    <button onClick={() => switchTab("citas")}
                      className={`mt-4 flex items-center gap-1.5 text-[12px] font-semibold text-velum-400 hover:text-white transition-colors ${pressBtn}`}>
                      Ver todas las citas <ChevronRight size={13} />
                    </button>
                  </div>
                </div>
              ) : (
                <div className={`${card} card-hover p-5 flex items-center gap-4`}>
                  <div className="w-12 h-12 rounded-2xl bg-velum-50 border border-velum-100 flex items-center justify-center">
                    <Calendar size={20} className="text-velum-400" />
                  </div>
                  <div className="flex-1">
                    <p className="font-semibold text-velum-900 text-[15px]">Sin citas programadas</p>
                    <p className="text-[12px] text-velum-500 mt-0.5">Agenda tu próxima sesión para comenzar</p>
                  </div>
                  <Link to="/agenda">
                    <button className={`shrink-0 rounded-2xl bg-velum-900 text-white text-[13px] font-semibold px-4 py-2.5 hover:bg-velum-800 transition-colors ${pressBtn}`}>
                      Agendar
                    </button>
                  </Link>
                </div>
              )}

              {/* Stats row */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {/* Sessions with ring */}
                <div className={`${card} card-hover p-4 flex items-center gap-4`}>
                  <ProgressRing done={sessions.length} total={12} size={64} />
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-velum-400">Sesiones</p>
                    <button onClick={() => switchTab("historial")} className="flex items-center gap-1 text-[11px] text-velum-500 hover:text-velum-900 transition-colors mt-1">
                      Ver historial <ChevronRight size={11} />
                    </button>
                  </div>
                </div>
                {/* Docs */}
                <div className={`${card} card-hover p-4`}>
                  <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-velum-400">Documentos</p>
                  <p className="text-[30px] font-serif font-bold text-velum-900 leading-tight mt-1 animate-count-in">{pendingDocs}</p>
                  <p className="text-[11px] text-velum-500 mt-0.5">pendientes de firma</p>
                </div>
                {/* Membership */}
                <div className={`${card} card-hover p-4 col-span-2 sm:col-span-1`}>
                  <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-velum-400">Plan</p>
                  <p className="text-[16px] font-semibold text-velum-900 mt-1">{planLabel ?? "—"}</p>
                  <span className={`inline-flex mt-1.5 items-center text-[10px] font-bold uppercase tracking-[0.1em] px-2 py-0.5 border rounded-full ${msCls}`}>{msLabel}</span>
                </div>
              </div>

              {/* Banner: plan pre-seleccionado sin membresía activa */}
              {interestedPlanCode && (!membership || membershipStatus === "inactive" || membershipStatus === "canceled") && (() => {
                const tier = MEMBERSHIPS.find((t) => t.stripePriceId === interestedPlanCode);
                if (!tier) return null;
                return (
                  <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-700 mb-1">Plan pre-seleccionado</p>
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="font-semibold text-velum-900 text-sm">{tier.name}</p>
                        <p className="text-xs text-velum-500 mt-0.5">${tier.price.toLocaleString("es-MX")}/mes{hasDepositCredit && " · $200 de depósito se descuenta"}</p>
                      </div>
                      <button
                        type="button"
                        disabled={isActivatingPlan}
                        onClick={async () => {
                          setIsActivatingPlan(true);
                          try {
                            await createSubscriptionCheckout(tier);
                          } catch (e: unknown) {
                            toast.error((e as { message?: string })?.message ?? "No se pudo iniciar el pago");
                          } finally {
                            setIsActivatingPlan(false);
                          }
                        }}
                        className={`shrink-0 bg-velum-900 text-white text-xs font-bold px-4 py-2 rounded-xl hover:bg-velum-800 transition-colors disabled:opacity-60 disabled:cursor-not-allowed ${pressBtn}`}
                        aria-label="Activar plan seleccionado"
                      >
                        {isActivatingPlan ? "Redirigiendo…" : "Activar ahora"}
                      </button>
                    </div>
                    <p className="text-[11px] text-emerald-700 mt-2">
                      Si quieres cambiar de plan, <Link to="/memberships" className="underline font-medium">selecciona otro aquí</Link>.
                    </p>
                  </div>
                );
              })()}

              {/* Membership card */}
              {membership && (
                <div className="bg-velum-900 rounded-2xl p-5 sm:p-6 text-white relative overflow-hidden">
                  <div className="absolute -right-10 -top-10 w-36 h-36 rounded-full bg-velum-800/40 pointer-events-none" />
                  <div className="absolute right-0 -bottom-8 w-24 h-24 rounded-full bg-velum-800/20 pointer-events-none" />
                  <div className="relative">
                    <div className="flex items-start justify-between gap-4 mb-5">
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-velum-400">Plan activo</p>
                        <p className="font-serif text-2xl italic text-white mt-1">{planLabel ?? "Plan Velum"}</p>
                        {planPrice && (
                          <p className="text-[12px] text-velum-300 mt-1 font-medium">{planPrice}</p>
                        )}
                      </div>
                      <span className={`shrink-0 text-[10px] font-bold uppercase tracking-[0.1em] px-2.5 py-1.5 border rounded-full ${msCls}`}>{msLabel}</span>
                    </div>
                    <div className="grid grid-cols-3 gap-3 pt-4 border-t border-velum-800">
                      {[
                        ["Sesiones", String(sessions.length)],
                        ["Próxima", upcomingAppointments.length > 0 ? new Date(upcomingAppointments[0].startAt).toLocaleDateString("es-MX",{day:"numeric",month:"short"}) : "—"],
                        ["Renueva",  membership?.currentPeriodEnd ? new Date(membership.currentPeriodEnd).toLocaleDateString("es-MX",{day:"numeric",month:"short"}) : "—"],
                      ].map(([k, v]) => (
                        <div key={k}>
                          <p className="text-[9px] uppercase tracking-widest text-velum-500">{k}</p>
                          <p className="text-[14px] font-bold text-white mt-0.5">{v}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Onboarding stepper */}
              {!onboardingComplete && (
                <div className={`${card} p-5`}>
                  <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-velum-400 mb-4">Tu progreso</p>
                  <div className="flex items-center">
                    {onboardingSteps.map((step, idx) => (
                      <React.Fragment key={step.id}>
                        <div className="flex flex-col items-center gap-1.5">
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold border-2 transition-all ${step.done ? "bg-velum-900 border-velum-900 text-white" : "bg-white border-velum-200 text-velum-400"}`}>
                            {step.done ? <CheckCircle size={14} /> : <span>{idx+1}</span>}
                          </div>
                          <p className={`text-[10px] text-center leading-tight max-w-[60px] ${step.done ? "text-velum-700 font-semibold" : "text-velum-400"}`}>{step.label}</p>
                        </div>
                        {idx < onboardingSteps.length-1 && (
                          <div className="h-0.5 flex-1 mb-6 mx-1" style={{ backgroundColor: onboardingSteps[idx+1].done ? "#544538" : "#efeadd" }} />
                        )}
                      </React.Fragment>
                    ))}
                  </div>
                  {nextStep && (
                    <div className="mt-4 pt-3 border-t border-velum-100 flex items-center justify-between gap-3">
                      <p className="text-[12px] text-velum-600">Siguiente: <strong className="text-velum-900">{nextStep.label}</strong></p>
                      {nextStep.id === "intake" && <button onClick={() => switchTab("records")} className={`text-[11px] font-semibold text-velum-700 flex items-center gap-1 hover:text-velum-900 transition-colors ${pressBtn}`}>Ir <ChevronRight size={12} /></button>}
                      {nextStep.id === "appt"   && <Link to="/agenda" className={`text-[11px] font-semibold text-velum-700 flex items-center gap-1 hover:text-velum-900 transition-colors ${pressBtn}`}>Agendar <ChevronRight size={12} /></Link>}
                    </div>
                  )}
                </div>
              )}

              {/* Quick actions */}
              <div className={`${card} p-5`}>
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-velum-400 mb-4">Accesos rápidos</p>
                <div className="grid grid-cols-2 gap-3">
                  <Link to="/agenda" className={`flex items-center gap-3 rounded-2xl border border-velum-100 bg-velum-50 px-4 py-3.5 hover:border-velum-300 hover:bg-white transition-all group card-hover ${pressBtn}`}>
                    <Calendar size={18} className="text-velum-600 group-hover:text-velum-900 transition-colors" />
                    <span className="text-[13px] font-semibold text-velum-700 group-hover:text-velum-900 transition-colors">Agendar cita</span>
                  </Link>
                  <button type="button" onClick={async () => { try { await redirectToCustomerPortal(); } catch (err: any) { toast.error(asString(err?.message, "No se pudo abrir el portal de cliente.")); } }}
                    className={`flex items-center gap-3 rounded-2xl border border-velum-100 bg-velum-50 px-4 py-3.5 hover:border-velum-300 hover:bg-white transition-all group card-hover text-left ${pressBtn}`}>
                    <ExternalLink size={18} className="text-velum-600 group-hover:text-velum-900 transition-colors" />
                    <span className="text-[13px] font-semibold text-velum-700 group-hover:text-velum-900 transition-colors">Portal cliente</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ══ CITAS ════════════════════════════════════════════════════════ */}
          {activeTab === "citas" && (
            <div className="space-y-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-[10px] bg-velum-50 border border-velum-100 flex items-center justify-center">
                    <Calendar size={16} className="text-velum-700" />
                  </div>
                  <h2 className="font-serif text-xl text-velum-900">Mis citas</h2>
                </div>
                <Link to="/agenda">
                  <button className={`rounded-2xl bg-velum-900 text-white text-[13px] font-semibold px-4 py-2 hover:bg-velum-800 transition-colors ${pressBtn}`}>
                    + Nueva
                  </button>
                </Link>
              </div>

              {isLoadingAppointments && (
                <div className="space-y-3">
                  {[1,2,3].map(i => <Sk key={i} className="h-24 rounded-2xl" />)}
                </div>
              )}

              {!isLoadingAppointments && upcomingAppointments.length > 0 && (
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-velum-400 mb-3">Próximas</p>
                  <div className="space-y-3">
                    {upcomingAppointments.map(appt => (
                      <AppointmentCard key={appt.id} appt={appt}
                        onCancel={() => setCancelApptId(appt.id)}
                        onReschedule={() => { setRescheduleApptId(appt.id); setCalendarBase2(new Date(new Date().getFullYear(), new Date().getMonth(), 1)); setRescheduleDate(null); setRescheduleSlots([]); setRescheduleSlot(null); }} />
                    ))}
                  </div>
                </div>
              )}

              {!isLoadingAppointments && upcomingAppointments.length === 0 && (
                <div className={`${card} p-10 flex flex-col items-center text-center`}>
                  <div className="w-14 h-14 rounded-2xl bg-velum-50 border border-velum-100 flex items-center justify-center mb-4">
                    <Calendar size={24} className="text-velum-300" />
                  </div>
                  <p className="font-semibold text-velum-900 text-[15px]">Sin citas programadas</p>
                  <p className="text-[13px] text-velum-500 mt-1 mb-5">Agenda tu próxima sesión y sigue tu tratamiento</p>
                  <Link to="/agenda">
                    <button className={`rounded-2xl bg-velum-900 text-white text-[13px] font-semibold px-5 py-2.5 hover:bg-velum-800 transition-colors ${pressBtn}`}>
                      Agendar cita
                    </button>
                  </Link>
                </div>
              )}

              {!isLoadingAppointments && pastAppointments.length > 0 && (
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-velum-400 mb-3">Historial</p>
                  <div className="space-y-2">
                    {pastAppointments.slice(0, 10).map(appt => (
                      <AppointmentCard key={appt.id} appt={appt} past />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ══ PROFILE ══════════════════════════════════════════════════════ */}
          {activeTab === "profile" && (
            <div className={`${card} p-6 space-y-5`}>
              <div className="flex items-center gap-3 pb-1">
                <div className="w-9 h-9 rounded-[10px] bg-velum-50 border border-velum-100 flex items-center justify-center">
                  <User size={16} className="text-velum-700" />
                </div>
                <h2 className="font-serif text-xl text-velum-900">Información personal</h2>
              </div>
              <div><label className={lbl}>Nombre completo</label><input className={fld} value={profile.fullName} onChange={e => setProfile(p => ({...p, fullName: e.target.value}))} placeholder="Nombre y apellido" /></div>
              <div><label className={lbl}>Correo electrónico</label><input className={fld} type="email" value={profile.email} onChange={e => setProfile(p => ({...p, email: e.target.value}))} placeholder="correo@dominio.com" /></div>
              <div><label className={lbl}>Teléfono</label><input className={fld} value={profile.phone} onChange={e => setProfile(p => ({...p, phone: e.target.value}))} placeholder="+52 55 1234 5678" /></div>
              <button type="button" onClick={handleSaveProfile} disabled={isSavingProfile}
                className={`w-full rounded-2xl bg-velum-900 text-white py-4 text-[15px] font-semibold hover:bg-velum-800 disabled:opacity-50 transition-colors ${pressBtn}`}>
                {isSavingProfile ? "Guardando…" : "Guardar cambios"}
              </button>
            </div>
          )}

          {/* ══ SECURITY ═════════════════════════════════════════════════════ */}
          {activeTab === "security" && (
            <div className={`${card} p-6 space-y-5`}>
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-[10px] bg-velum-50 border border-velum-100 flex items-center justify-center">
                  <Lock size={16} className="text-velum-700" />
                </div>
                <h2 className="font-serif text-xl text-velum-900">Seguridad</h2>
              </div>
              <div className="bg-velum-50 border border-velum-200/60 rounded-2xl p-4 space-y-3">
                <p className="text-[13px] text-velum-700 leading-snug">Para cambiar tu contraseña, solicita primero un código de verificación por WhatsApp.</p>
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={handleRequestWhatsappCode} disabled={isSendingCode}
                    className={`flex items-center gap-2 rounded-2xl border border-velum-200 bg-white px-4 py-2.5 text-[13px] font-semibold text-velum-700 hover:border-velum-700 hover:text-velum-900 transition-all disabled:opacity-50 ${pressBtn}`}>
                    <KeyRound size={14} />{isSendingCode ? "Enviando…" : "Código por WhatsApp"}
                  </button>
                  <a href="/#/agenda?mode=forgot"
                    className={`flex items-center gap-2 rounded-2xl border border-velum-200 bg-white px-4 py-2.5 text-[13px] font-semibold text-velum-600 hover:border-velum-500 hover:text-velum-900 transition-all ${pressBtn}`}>
                    <Mail size={14} /> Restablecer por correo
                  </a>
                </div>
                <p className="text-[11px] text-velum-400">¿Cambiaste de número? Usa la opción de correo.</p>
              </div>
              <div className="space-y-4">
                <div><label className={lbl}>Código de WhatsApp</label><input className={fld} value={whatsappCode} onChange={e => setWhatsappCode(e.target.value)} placeholder="6 dígitos" maxLength={6} /></div>
                <div><label className={lbl}>Contraseña actual</label><input className={fld} type="password" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} /></div>
                <div>
                  <label className={lbl}>Nueva contraseña</label>
                  <input className={fld} type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} />
                  {newPassword && (
                    <>
                      <div className="mt-2 flex gap-1">
                        {[0,1,2,3,4].map(i => { const s = Object.values(passwordChecks).filter(Boolean).length; return <div key={i} className={`h-1 flex-1 rounded-full transition-colors ${i < s ? s <= 2 ? "bg-red-400" : s <= 4 ? "bg-amber-400" : "bg-emerald-400" : "bg-velum-100"}`} />; })}
                      </div>
                      <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1">
                        {([[passwordChecks.length,"12+ caracteres"],[passwordChecks.upper,"1 mayúscula"],[passwordChecks.lower,"1 minúscula"],[passwordChecks.number,"1 número"],[passwordChecks.special,"1 símbolo"]] as [boolean,string][]).map(([ok,txt],i) => (
                          <span key={i} className={`flex items-center gap-1.5 text-[11px] ${ok ? "text-emerald-600" : "text-velum-400"}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${ok ? "bg-emerald-500" : "bg-velum-200"}`} />{txt}
                          </span>
                        ))}
                      </div>
                    </>
                  )}
                </div>
                <div><label className={lbl}>Confirmar contraseña</label><input className={fld} type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} /></div>
                <button type="button" onClick={handleChangePassword} disabled={isUpdatingPassword}
                  className={`w-full rounded-2xl bg-velum-900 text-white py-4 text-[15px] font-semibold hover:bg-velum-800 disabled:opacity-50 transition-colors ${pressBtn}`}>
                  {isUpdatingPassword ? "Actualizando…" : "Cambiar contraseña"}
                </button>
              </div>
            </div>
          )}

          {/* ══ RECORDS ══════════════════════════════════════════════════════ */}
          {activeTab === "records" && (
            <div className="space-y-4">
              <div className={`${card} card-hover p-5 flex items-center gap-4`}>
                <div className="w-11 h-11 rounded-2xl bg-velum-50 border border-velum-100 flex items-center justify-center shrink-0">
                  <Shield size={18} className="text-velum-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-velum-900 text-[15px]">Expediente médico</p>
                  <p className="text-[12px] text-velum-500 mt-0.5">Información clínica actualizada para tratamientos seguros.</p>
                </div>
                <button type="button" onClick={handleOpenEditIntake}
                  className={`shrink-0 flex items-center gap-2 rounded-2xl border border-velum-200 px-4 py-2.5 text-[13px] font-semibold text-velum-700 hover:border-velum-700 transition-all ${pressBtn}`}>
                  <RefreshCw size={13} /> Actualizar
                </button>
              </div>
              <div className={`${card} p-6 space-y-4`}>
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-[10px] bg-velum-50 border border-velum-100 flex items-center justify-center"><FileText size={16} className="text-velum-700" /></div>
                  <h2 className="font-serif text-xl text-velum-900">Documentos y consentimientos</h2>
                </div>
                {pendingDocs > 0 && (
                  <div className="rounded-2xl border border-orange-200/80 bg-orange-50 px-4 py-3 flex items-start gap-3">
                    <AlertTriangle size={16} className="text-orange-500 mt-0.5 shrink-0" />
                    <p className="text-[13px] text-orange-800">Tienes <strong>{pendingDocs}</strong> documento{pendingDocs>1?"s":""} pendiente{pendingDocs>1?"s":""} de firma.</p>
                  </div>
                )}
                <div className="space-y-2">
                  {documents.length === 0 && <p className="text-[13px] text-velum-500 text-center py-6">Sin documentos cargados aún.</p>}
                  {documents.map((doc: any) => (
                    <div key={doc.id} className="flex items-center justify-between rounded-2xl border border-velum-100 px-4 py-3.5 hover:border-velum-200 transition-colors">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-xl bg-velum-50 border border-velum-100 flex items-center justify-center"><FileText size={14} className="text-velum-500" /></div>
                        <span className="text-[14px] font-medium text-velum-800">{doc.title}</span>
                      </div>
                      {doc.signed
                        ? <div className="flex items-center gap-2">
                            <span className="flex items-center gap-1.5 text-[11px] font-bold text-emerald-700"><CheckCircle size={13} /> Firmado</span>
                            <button
                              onClick={() => documentService.downloadDocument(doc.id, doc.title + ".pdf").catch(() => toast.error("No se pudo descargar el documento"))}
                              className={`flex items-center gap-1 rounded-xl border border-velum-200 text-velum-600 text-[11px] font-semibold px-2.5 py-1 hover:bg-velum-50 transition-colors ${pressBtn}`}
                              title="Descargar"
                            ><Download size={12} /> Descargar</button>
                          </div>
                        : <button onClick={() => initiateSigning(doc)} className={`rounded-xl bg-velum-900 text-white text-[12px] font-semibold px-3 py-1.5 hover:bg-velum-800 transition-colors ${pressBtn}`}>Firmar</button>
                      }
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ══ HISTORIAL ════════════════════════════════════════════════════ */}
          {activeTab === "historial" && (
            <div className="space-y-4">
              <div className={`${card} overflow-hidden`}>
                <details className="group">
                  <summary className="flex items-center justify-between px-5 py-4 cursor-pointer hover:bg-velum-50/60 transition-colors list-none">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-xl bg-velum-50 border border-velum-100 flex items-center justify-center"><BookOpen size={14} className="text-velum-600" /></div>
                      <p className="font-semibold text-[14px] text-velum-900">Cuidados antes de tu próxima sesión</p>
                    </div>
                    <ChevronDown size={16} className="text-velum-400 group-open:rotate-180 transition-transform shrink-0" />
                  </summary>
                  <div className="px-5 pb-5 grid sm:grid-cols-2 gap-3 border-t border-velum-50">
                    {CARE.pre.map((tip, i) => (
                      <div key={i} className="flex items-start gap-3 text-[13px] text-velum-600">
                        <div className="w-5 h-5 rounded-full bg-velum-900 flex items-center justify-center shrink-0 mt-0.5"><span className="text-[9px] font-bold text-white">{i+1}</span></div>
                        {tip}
                      </div>
                    ))}
                  </div>
                </details>
              </div>

              <div className={`${card} p-6`}>
                <div className="flex items-center gap-3 mb-5">
                  <div className="w-9 h-9 rounded-[10px] bg-velum-50 border border-velum-100 flex items-center justify-center"><ClipboardList size={16} className="text-velum-700" /></div>
                  <h2 className="font-serif text-xl text-velum-900">Historial de sesiones</h2>
                </div>

                {isLoadingSessions && (
                  <div className="space-y-3">{[1,2,3].map(i => <Sk key={i} className="h-28 rounded-2xl" />)}</div>
                )}

                {!isLoadingSessions && sessions.length === 0 && (
                  <div className="text-center py-12">
                    <div className="w-14 h-14 rounded-2xl bg-velum-50 border border-velum-100 flex items-center justify-center mx-auto mb-4"><Zap size={22} className="text-velum-300" /></div>
                    <p className="font-semibold text-velum-700 text-[15px]">Sin sesiones registradas</p>
                    <p className="text-[13px] text-velum-500 mt-1">Tus sesiones aparecerán aquí una vez que el personal las registre.</p>
                  </div>
                )}

                {!isLoadingSessions && sessions.length > 0 && (
                  <div className="space-y-4">
                    {/* Progress bar */}
                    <div className="bg-velum-50 rounded-2xl border border-velum-100 p-4">
                      <div className="flex items-center justify-between mb-3">
                        <p className="text-[13px] font-semibold text-velum-900">
                          <span className="text-[22px] font-serif font-bold animate-count-in">{sessions.length}</span>
                          <span className="text-velum-500 ml-2 text-[12px]">/ 12 sesiones</span>
                        </p>
                        <p className="text-[11px] font-bold text-velum-500">{Math.round(sessions.length/12*100)}%</p>
                      </div>
                      <div className="flex gap-1.5 flex-wrap">
                        {Array.from({length: 12}).map((_,i) => (
                          <div key={i} title={i < sessions.length ? `Sesión ${i+1}` : "Pendiente"}
                            className={`w-4 h-4 rounded-full transition-all duration-300 ${i < sessions.length ? "bg-velum-900" : "bg-velum-200 border border-velum-100"}`}
                            style={{ animationDelay: `${i*40}ms` }} />
                        ))}
                      </div>
                    </div>

                    {/* Timeline */}
                    <div>
                      {sessions.map((session, idx) => {
                        const params = session.laserParametersJson as Record<string,unknown>|null;
                        const dateStr = new Date(session.createdAt).toLocaleDateString("es-MX",{day:"2-digit",month:"long",year:"numeric"});
                        return (
                          <div key={session.id} className="relative pl-8 mb-4">
                            {idx < sessions.length-1 && <div className="absolute left-[11px] top-8 bottom-0 w-0.5 bg-velum-100" />}
                            <div className="absolute left-0 top-5 w-6 h-6 rounded-full bg-velum-900 border-2 border-white shadow-sm flex items-center justify-center">
                              <Zap size={10} className="text-white" />
                            </div>
                            <div className={`${card} overflow-hidden`}>
                              <div className="px-4 py-4 flex items-start justify-between gap-3">
                                <div>
                                  <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-velum-400">{dateStr}</p>
                                  {params?.zona && <p className="font-semibold text-velum-900 text-[15px] mt-0.5">{String(params.zona)}</p>}
                                </div>
                                <span className="shrink-0 text-[10px] font-bold uppercase px-2.5 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full">Completada</span>
                              </div>
                              {params && Object.keys(params).length > 0 && (
                                <div className="px-4 pb-4 space-y-3">
                                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                                    {params.zona && <div className="bg-velum-50 rounded-xl p-3 text-center"><p className="text-[9px] uppercase tracking-widest text-velum-400">Zona</p><p className="text-[13px] font-semibold text-velum-900 mt-0.5">{String(params.zona)}</p></div>}
                                    {params.fluencia && <div className="bg-velum-50 rounded-xl p-3 text-center"><p className="text-[9px] uppercase tracking-widest text-velum-400">Energía</p><p className="text-[13px] font-semibold text-velum-900 mt-0.5">{String(params.fluencia)} J/cm²</p></div>}
                                    {params.frecuencia && <div className="bg-velum-50 rounded-xl p-3 text-center"><p className="text-[9px] uppercase tracking-widest text-velum-400">Velocidad</p><p className="text-[13px] font-semibold text-velum-900 mt-0.5">{String(params.frecuencia)} Hz</p></div>}
                                    {params.passes && <div className="bg-velum-50 rounded-xl p-3 text-center"><p className="text-[9px] uppercase tracking-widest text-velum-400">Pasadas</p><p className="text-[13px] font-semibold text-velum-900 mt-0.5">{String(params.passes)}</p></div>}
                                  </div>
                                  <details className="group rounded-xl border border-velum-100 overflow-hidden">
                                    <summary className="flex items-center justify-between px-3 py-2.5 cursor-pointer text-[12px] font-semibold text-velum-600 hover:bg-velum-50 transition-colors list-none">
                                      <span className="flex items-center gap-2"><BookOpen size={12} className="text-velum-400" /> Cuidados post-sesión</span>
                                      <ChevronDown size={13} className="text-velum-400 group-open:rotate-180 transition-transform" />
                                    </summary>
                                    <div className="px-3 pb-3 space-y-1.5 border-t border-velum-50">
                                      {CARE.post.map((tip, i) => <div key={i} className="flex items-start gap-2 text-[12px] text-velum-600"><div className="w-1.5 h-1.5 rounded-full bg-velum-300 mt-1.5 shrink-0" />{tip}</div>)}
                                    </div>
                                  </details>
                                </div>
                              )}
                              {session.notes && <div className="px-4 pb-4"><p className="text-[10px] uppercase tracking-widest text-velum-400 mb-1">Notas</p><p className="text-[13px] text-velum-700">{session.notes}</p></div>}
                              {session.adverseEvents && <div className="mx-4 mb-4 bg-amber-50 border border-amber-200 rounded-xl p-3"><p className="text-[10px] uppercase tracking-widest text-amber-600 mb-1">Eventos adversos</p><p className="text-[13px] text-amber-800">{session.adverseEvents}</p></div>}
                              <div className="px-4 pb-4 pt-1 border-t border-velum-50">
                                {session.memberFeedback ? (
                                  <div className="flex items-start justify-between gap-2">
                                    <div><p className="text-[10px] uppercase tracking-widest text-velum-400 mb-1">Tu comentario</p><p className="text-[13px] text-velum-700 italic">"{session.memberFeedback}"</p></div>
                                    <button type="button" onClick={() => { setFeedbackOpenId(session.id); setFeedbackText(session.memberFeedback ?? ""); }} className="shrink-0 text-[11px] text-velum-400 hover:text-velum-900 underline underline-offset-2 transition-colors">Editar</button>
                                  </div>
                                ) : feedbackOpenId === session.id ? (
                                  <div className="space-y-2">
                                    <p className="text-[10px] uppercase tracking-widest text-velum-400">Dejar comentario</p>
                                    <textarea className={`${fld} resize-none`} rows={2} value={feedbackText} onChange={e => setFeedbackText(e.target.value)} placeholder="¿Cómo fue tu experiencia?" />
                                    <div className="flex gap-2">
                                      <button onClick={() => handleSubmitFeedback(session.id)} disabled={savingFeedbackId === session.id || !feedbackText.trim()} className={`rounded-xl bg-velum-900 text-white text-[12px] font-semibold px-4 py-2 hover:bg-velum-800 disabled:opacity-50 transition-colors ${pressBtn}`}>{savingFeedbackId === session.id ? "Guardando…" : "Guardar"}</button>
                                      <button onClick={() => { setFeedbackOpenId(null); setFeedbackText(""); }} className={`rounded-xl border border-velum-200 text-[12px] font-medium text-velum-600 px-4 py-2 hover:border-velum-400 transition-colors ${pressBtn}`}>Cancelar</button>
                                    </div>
                                  </div>
                                ) : (
                                  <button type="button" onClick={() => { setFeedbackOpenId(session.id); setFeedbackText(""); }} className="text-[12px] text-velum-500 hover:text-velum-900 transition-colors">+ Dejar comentario</button>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ══ BILLING ══════════════════════════════════════════════════════ */}
          {activeTab === "billing" && (
            <div className="space-y-4">

              {/* Failed payment alert */}
              {membershipStatus === "past_due" && (
                <div className="rounded-2xl border border-red-200 bg-red-50 p-4 flex items-start gap-3">
                  <AlertTriangle size={18} className="text-red-500 shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-red-800">Pago pendiente</p>
                    <p className="text-xs text-red-600 mt-0.5">No se procesó tu último pago. Actualiza tu método de pago para mantener tu membresía activa.</p>
                  </div>
                  <button type="button" onClick={async () => { try { await redirectToCustomerPortal(); } catch (err: any) { toast.error(asString(err?.message, "")); } }}
                    className={`shrink-0 bg-red-600 text-white text-xs font-bold px-3 py-1.5 rounded-xl hover:bg-red-700 transition ${pressBtn}`}>
                    Actualizar
                  </button>
                </div>
              )}

              {/* Next payment info */}
              {membership && membershipStatus === "active" && membership.currentPeriodEnd && (
                <div className="rounded-2xl border border-velum-100 bg-velum-50 p-4 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-velum-400">Próximo cargo</p>
                    <p className="text-[15px] font-semibold text-velum-900 mt-1">
                      {planDetails?.amount ? new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 }).format(planDetails.amount) : "—"}
                      <span className="text-[12px] font-normal text-velum-500 ml-1">
                        el {new Date(membership.currentPeriodEnd).toLocaleDateString("es-MX", { day: "numeric", month: "long" })}
                      </span>
                    </p>
                  </div>
                  <CreditCard size={18} className="text-velum-400 shrink-0" />
                </div>
              )}

              <div className="bg-velum-900 rounded-2xl p-5 sm:p-6 text-white relative overflow-hidden">
                <div className="absolute -right-8 -top-8 w-32 h-32 rounded-full bg-velum-800/40 pointer-events-none" />
                <div className="relative">
                  <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-velum-400 mb-1">Facturación</p>
                  <h2 className="font-serif text-xl italic text-white mb-3">Portal de cliente</h2>
                  <p className="text-[13px] text-velum-300 mb-5 leading-snug">Administra métodos de pago, facturas y renovaciones de membresía en un solo lugar.</p>
                  <button type="button" onClick={async () => { try { await redirectToCustomerPortal(); } catch (err: any) { toast.error(asString(err?.message, "No se pudo abrir el portal de cliente.")); } }}
                    className={`flex items-center gap-2 rounded-2xl bg-white text-velum-900 text-[13px] font-bold px-5 py-3 hover:bg-velum-100 transition-colors ${pressBtn}`}>
                    <ExternalLink size={14} /> Ir al portal
                  </button>
                </div>
              </div>

              <div className={`${card} p-6`}>
                <div className="flex items-center justify-between mb-5">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-[10px] bg-velum-50 border border-velum-100 flex items-center justify-center"><CreditCard size={16} className="text-velum-700" /></div>
                    <h3 className="font-serif text-xl text-velum-900">Historial de pagos</h3>
                  </div>
                  {isLoadingPayments && <Loader2 className="animate-spin text-velum-300" size={16} />}
                </div>
                {isLoadingPayments && <div className="space-y-2">{[1,2,3].map(i => <Sk key={i} className="h-16 rounded-2xl" />)}</div>}
                {!isLoadingPayments && payments.length === 0 && <p className="text-[13px] text-velum-500 text-center py-6">Sin historial de pagos registrado.</p>}
                {!isLoadingPayments && payments.length > 0 && (
                  <div className="space-y-2">
                    {payments.map(payment => {
                      const dateStr = new Date(payment.paidAt ?? payment.createdAt).toLocaleDateString("es-MX",{day:"2-digit",month:"long",year:"numeric"});
                      const sMap: Record<string,{label:string;cls:string}> = { paid:{label:"Pagado",cls:"bg-emerald-50 text-emerald-700 border-emerald-200"}, pending:{label:"Pendiente",cls:"bg-amber-50 text-amber-700 border-amber-200"}, failed:{label:"Fallido",cls:"bg-red-50 text-red-600 border-red-200"}, refunded:{label:"Reembolsado",cls:"bg-zinc-100 text-zinc-600 border-zinc-200"} };
                      const { label: sl, cls: sc } = sMap[payment.status] ?? { label: payment.status, cls: "bg-zinc-100 text-zinc-600 border-zinc-200" };
                      return (
                        <div key={payment.id} className="flex items-center justify-between rounded-2xl border border-velum-100 px-4 py-4 hover:border-velum-200 transition-colors">
                          <div>
                            <p className="text-[15px] font-semibold text-velum-900">{new Intl.NumberFormat("es-MX",{style:"currency",currency:(payment.currency||"mxn").toUpperCase(),maximumFractionDigits:0}).format(payment.amount)}</p>
                            <p className="text-[12px] text-velum-400 mt-0.5">{dateStr}{planLabel ? ` · ${planLabel}` : ""}</p>
                          </div>
                          <span className={`text-[10px] font-bold uppercase tracking-[0.1em] px-2.5 py-1 border rounded-full ${sc}`}>{sl}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ══ AYUDA ════════════════════════════════════════════════════════ */}
          {activeTab === "ayuda" && (
            <div className="space-y-4">
              <div className="bg-velum-900 rounded-2xl p-5 sm:p-6 text-white relative overflow-hidden">
                <div className="absolute -right-10 -top-10 w-36 h-36 rounded-full bg-velum-800/40 pointer-events-none" />
                <div className="relative">
                  <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-velum-400 mb-1">Contacto</p>
                  <h2 className="font-serif text-2xl italic text-white mb-5">Estamos para ayudarte</h2>
                  <div className="grid sm:grid-cols-3 gap-3">
                    {[
                      { href: "https://wa.me/5215512345678", icon: <MessageCircle size={15} className="text-white" />, label: "WhatsApp", value: "Escríbenos" },
                      { href: "tel:+5215512345678",          icon: <Phone size={15} className="text-white" />,         label: "Teléfono",  value: "+52 55 1234 5678" },
                      { href: "mailto:concierge@velumlaser.com", icon: <Mail size={15} className="text-white" />,      label: "Correo",    value: "concierge@…" },
                    ].map(({ href, icon, label, value }) => (
                      <a key={label} href={href} target={href.startsWith("http") ? "_blank" : undefined} rel="noreferrer"
                        className={`flex items-center gap-3 bg-velum-800/80 rounded-2xl px-4 py-4 hover:bg-velum-700 transition-colors group ${pressBtn}`}>
                        <div className="w-8 h-8 rounded-xl bg-velum-700 group-hover:bg-velum-600 flex items-center justify-center shrink-0 transition-colors">{icon}</div>
                        <div><p className="text-[9px] font-bold uppercase tracking-widest text-velum-400">{label}</p><p className="text-[13px] font-semibold text-white mt-0.5">{value}</p></div>
                      </a>
                    ))}
                  </div>
                  <p className="mt-4 text-[11px] text-velum-500">Lunes–Viernes 9:00–19:00 · Sábados 10:00–15:00</p>
                </div>
              </div>

              <div className={`${card} overflow-hidden`}>
                <div className="px-6 py-5 border-b border-velum-50">
                  <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-velum-400 mb-1">Preguntas frecuentes</p>
                  <h3 className="font-serif text-xl text-velum-900">Todo lo que necesitas saber</h3>
                </div>
                <div className="divide-y divide-velum-50">
                  {FAQ.map(item => (
                    <div key={item.id}>
                      <button type="button" onClick={() => setOpenFaqId(openFaqId === item.id ? null : item.id)}
                        className={`w-full flex items-center justify-between px-6 py-4 text-left hover:bg-velum-50/60 transition-colors gap-4 ${pressBtn}`}>
                        <p className="text-[14px] font-semibold text-velum-900 leading-snug">{item.q}</p>
                        <ChevronDown size={16} className={`text-velum-400 shrink-0 transition-transform duration-200 ${openFaqId===item.id?"rotate-180":""}`} />
                      </button>
                      {openFaqId === item.id && (
                        <div className="px-6 pb-5 text-[13px] text-velum-600 leading-relaxed border-t border-velum-50 animate-fade-in">{item.a}</div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid sm:grid-cols-2 gap-4">
                {[{ title: "Antes de cada sesión", items: CARE.pre }, { title: "Después de cada sesión", items: CARE.post }].map(({ title, items }) => (
                  <div key={title} className={`${card} p-5`}>
                    <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-velum-400 mb-4 flex items-center gap-2"><BookOpen size={12} />{title}</p>
                    <div className="space-y-2.5">
                      {items.map((tip, i) => (
                        <div key={i} className="flex items-start gap-3 text-[12px] text-velum-600">
                          <div className="w-5 h-5 rounded-full bg-velum-900 flex items-center justify-center shrink-0 mt-0.5"><span className="text-[8px] font-bold text-white">{i+1}</span></div>
                          {tip}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

        </main>
      </div>

      {/* ─── Mobile FAB ────────────────────────────────────────────────────── */}
      {activeTab !== "citas" && (
        <Link to="/agenda">
          <button className={`lg:hidden fixed bottom-[80px] right-4 z-30 w-14 h-14 rounded-full bg-velum-900 shadow-2xl flex items-center justify-center hover:bg-velum-800 transition-colors ${pressBtn}`}
            aria-label="Agendar cita">
            <Plus size={22} className="text-white" />
          </button>
        </Link>
      )}

      {/* ─── Mobile Bottom Tab Bar ─────────────────────────────────────────── */}
      <nav className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-white/97 backdrop-blur-2xl border-t border-velum-100">
        <div className="flex items-stretch" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
          {primaryMobileTabs.map(key => {
            const tab = allTabs.find(t => t.key === key)!;
            const isActive = activeTab === key;
            return (
              <button key={key} type="button" onClick={() => switchTab(key)}
                className={`flex-1 flex flex-col items-center justify-center gap-0.5 py-3 transition-all duration-150 ${pressBtn} ${isActive ? "text-velum-900" : "text-velum-400"}`}>
                <span className={`transition-all duration-200 ${isActive ? "scale-110" : "scale-100"}`}>
                  {React.cloneElement(tabIcons[key] as React.ReactElement, { size: 20 } as Record<string, unknown>)}
                </span>
                <span className={`text-[9px] leading-none mt-0.5 ${isActive ? "font-black" : "font-medium"}`}>{tab.short}</span>
                {isActive && <span className="w-4 h-[3px] rounded-full bg-velum-900 mt-0.5" />}
              </button>
            );
          })}
          {/* "Más" button */}
          <button type="button" onClick={() => setShowMoreSheet(true)}
            className={`flex-1 flex flex-col items-center justify-center gap-0.5 py-3 transition-all ${pressBtn} ${secondaryMobileTabs.includes(activeTab) ? "text-velum-900" : "text-velum-400"}`}>
            <span className={`transition-all duration-200 ${secondaryMobileTabs.includes(activeTab) ? "scale-110" : "scale-100"}`}>
              <MoreHorizontal size={20} />
            </span>
            <span className={`text-[9px] leading-none mt-0.5 ${secondaryMobileTabs.includes(activeTab) ? "font-black" : "font-medium"}`}>Más</span>
            {secondaryMobileTabs.includes(activeTab) && <span className="w-4 h-[3px] rounded-full bg-velum-900 mt-0.5" />}
          </button>
        </div>
      </nav>

      {/* ─── "Más" Bottom Sheet ─────────────────────────────────────────────── */}
      {showMoreSheet && (
        <div className="lg:hidden fixed inset-0 z-50 flex items-end" onClick={() => setShowMoreSheet(false)}>
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" />
          <div className="relative w-full bg-white rounded-t-3xl border-t border-velum-100 shadow-2xl animate-slide-up overflow-hidden"
            onClick={e => e.stopPropagation()}>
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-8 h-1 rounded-full bg-velum-200" />
            </div>
            <div className="px-5 py-4 pb-safe" style={{ paddingBottom: `max(env(safe-area-inset-bottom), 20px)` }}>
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-velum-400 mb-3 px-1">Configuración y expediente</p>
              <div className="space-y-1">
                {secondaryMobileTabs.map(key => {
                  const tab = allTabs.find(t => t.key === key)!;
                  return (
                    <button key={key} type="button" onClick={() => switchTab(key)}
                      className={`w-full flex items-center gap-4 px-4 py-4 rounded-2xl text-left transition-all ${pressBtn} ${activeTab === key ? "bg-velum-900 text-white" : "bg-velum-50 hover:bg-velum-100 text-velum-900"}`}>
                      <span className={activeTab === key ? "text-white" : "text-velum-500"}>{tabIcons[key]}</span>
                      <span className="text-[15px] font-semibold">{tab.label}</span>
                      <ChevronRight size={16} className={`ml-auto ${activeTab === key ? "text-white/60" : "text-velum-300"}`} />
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── Edit Intake Modal ─────────────────────────────────────────────── */}
      {showEditIntake && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl border border-velum-200 shadow-2xl overflow-hidden animate-slide-up sm:animate-scale-in">
            <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-velum-50">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-velum-50 border border-velum-100 flex items-center justify-center"><Shield size={14} className="text-velum-700" /></div>
                <h3 className="font-serif text-xl text-velum-900">Actualizar expediente</h3>
              </div>
              <button type="button" onClick={() => setShowEditIntake(false)} className={`w-8 h-8 rounded-xl bg-velum-50 hover:bg-velum-100 flex items-center justify-center transition-colors ${pressBtn}`}>
                <X size={16} className="text-velum-600" />
              </button>
            </div>
            <div className="px-6 py-5 space-y-4 overflow-y-auto max-h-[70vh]">
              <p className="text-[13px] text-velum-500 leading-snug">Mantén tu información clínica actualizada para garantizar parámetros de tratamiento seguros.</p>
              <div><label className={lbl}>Nombre completo</label><input value={intakeDraft.fullName} onChange={e => setIntakeDraft(p=>({...p,fullName:e.target.value}))} className={fld} placeholder="Nombre completo" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className={lbl}>Teléfono</label><input value={intakeDraft.phone} onChange={e => setIntakeDraft(p=>({...p,phone:e.target.value}))} className={fld} placeholder="55 1234 5678" /></div>
                <div><label className={lbl}>Nacimiento</label><input type="date" value={intakeDraft.birthDate} onChange={e => setIntakeDraft(p=>({...p,birthDate:e.target.value}))} className={fld} /></div>
              </div>
              <div><label className={lbl}>Alergias</label><textarea value={intakeDraft.allergies} onChange={e => setIntakeDraft(p=>({...p,allergies:e.target.value}))} rows={2} className={`${fld} resize-none`} placeholder="Medicamentos, alimentos, contacto…" /></div>
              <div><label className={lbl}>Medicamentos actuales</label><textarea value={intakeDraft.medications} onChange={e => setIntakeDraft(p=>({...p,medications:e.target.value}))} rows={2} className={`${fld} resize-none`} placeholder="Nombre y dosis" /></div>
              <div><label className={lbl}>Condiciones de piel</label><textarea value={intakeDraft.skinConditions} onChange={e => setIntakeDraft(p=>({...p,skinConditions:e.target.value}))} rows={2} className={`${fld} resize-none`} placeholder="Acné, dermatitis, sensibilidad…" /></div>
            </div>
            <div className="flex gap-3 px-6 py-4 border-t border-velum-50">
              <button type="button" onClick={handleSaveIntake} disabled={isSavingIntake}
                className={`flex-1 rounded-2xl bg-velum-900 py-3.5 text-[14px] font-semibold text-white hover:bg-velum-800 disabled:opacity-50 transition-colors ${pressBtn}`}>
                {isSavingIntake ? "Guardando…" : "Guardar cambios"}
              </button>
              <button type="button" onClick={() => setShowEditIntake(false)}
                className={`px-5 rounded-2xl border border-velum-200 text-[14px] font-medium text-velum-600 hover:border-velum-400 transition-colors ${pressBtn}`}>
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Signature Modal ───────────────────────────────────────────────── */}
      {showSignatureModal && currentDocToSign && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <SignaturePad
            title={`Firmar: ${currentDocToSign.title}`}
            signerName={user?.name || user?.email}
            documentId={currentDocToSign.id}
            onCancel={() => setShowSignatureModal(false)}
            onSave={handleSignatureSave}
          />
        </div>
      )}

      {/* ─── Reschedule Modal ──────────────────────────────────────────────── */}
      {rescheduleApptId && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-white w-full sm:max-w-lg rounded-t-3xl sm:rounded-3xl border border-velum-200 shadow-2xl overflow-hidden animate-slide-up sm:animate-scale-in">
            <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-velum-50">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-velum-50 border border-velum-100 flex items-center justify-center"><RefreshCw size={14} className="text-velum-700" /></div>
                <h3 className="font-serif text-xl text-velum-900">Reprogramar cita</h3>
              </div>
              <button type="button" onClick={() => setRescheduleApptId(null)} className={`w-8 h-8 rounded-xl bg-velum-50 hover:bg-velum-100 flex items-center justify-center transition-colors ${pressBtn}`}>
                <X size={16} className="text-velum-600" />
              </button>
            </div>
            <div className="px-6 py-5 space-y-5 overflow-y-auto max-h-[75vh]">
              <p className="text-[13px] text-velum-500 leading-snug">Puedes reprogramar con al menos 24 horas de anticipación sin costo.</p>
              <div className="rounded-2xl border border-velum-100 bg-velum-50/40 p-4">
                <div className="flex items-center justify-between mb-4">
                  <p className="font-semibold text-[14px] capitalize text-velum-900">{calendarBase2.toLocaleDateString("es-MX",{month:"long",year:"numeric"})}</p>
                  <div className="flex gap-1.5">
                    {[[-1,"rotate-90"],[ 1,"-rotate-90"]].map(([dir, rot]) => (
                      <button key={dir} onClick={() => { const d=new Date(calendarBase2); d.setMonth(d.getMonth()+(dir as number)); d.setDate(1); setCalendarBase2(d); }}
                        className={`w-7 h-7 rounded-xl border border-velum-200 bg-white flex items-center justify-center hover:border-velum-400 transition-colors ${pressBtn}`}>
                        <ChevronDown size={13} className={`${rot} text-velum-600`} />
                      </button>
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-7 gap-1 mb-2">
                  {["D","L","M","M","J","V","S"].map((d,i) => <div key={i} className="text-[10px] font-bold uppercase tracking-wide text-velum-400 text-center py-1">{d}</div>)}
                </div>
                <div className="grid grid-cols-7 gap-1">
                  {calendarDays2.map((cell, i) => {
                    if (!cell.date || !cell.dateKey) return <div key={i} />;
                    const isSel = rescheduleDate === cell.dateKey;
                    return (
                      <button key={cell.dateKey} disabled={!cell.selectable} onClick={() => handleRescheduleSelectDate(cell.dateKey!)}
                        className={`aspect-square rounded-xl text-[12px] font-medium transition-all ${!cell.selectable?"text-velum-200 cursor-not-allowed":isSel?"bg-velum-900 text-white shadow-sm scale-105":"text-velum-800 hover:bg-velum-100"} ${pressBtn}`}>
                        {cell.date.getDate()}
                      </button>
                    );
                  })}
                </div>
              </div>
              {rescheduleDate && (
                <div>
                  {isLoadingRescheduleSlots && <div className="flex justify-center py-4"><Loader2 className="animate-spin text-velum-300" size={20} /></div>}
                  {!isLoadingRescheduleSlots && rescheduleSlots.length === 0 && <p className="text-[13px] text-velum-500 text-center py-4 bg-velum-50 rounded-2xl">Sin horarios disponibles para este día.</p>}
                  {!isLoadingRescheduleSlots && rescheduleSlots.length > 0 && (
                    <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                      {rescheduleSlots.filter(s => s.available).map(slot => (
                        <button key={slot.label} onClick={() => setRescheduleSlot(slot)}
                          className={`rounded-2xl border py-3 text-[13px] font-semibold transition-all ${pressBtn} ${rescheduleSlot?.label===slot.label?"bg-velum-900 text-white border-velum-900 shadow-sm scale-[1.02]":"border-velum-200 text-velum-800 hover:border-velum-500 hover:bg-velum-50"}`}>
                          {slot.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="flex gap-3 px-6 py-4 border-t border-velum-50">
              <button type="button" onClick={handleConfirmReschedule} disabled={!rescheduleDate || !rescheduleSlot || isRescheduling}
                className={`flex-1 rounded-2xl bg-velum-900 py-3.5 text-[14px] font-semibold text-white hover:bg-velum-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors ${pressBtn}`}>
                {isRescheduling ? "Reprogramando…" : "Confirmar nuevo horario"}
              </button>
              <button type="button" onClick={() => setRescheduleApptId(null)} className={`px-5 rounded-2xl border border-velum-200 text-[14px] font-medium text-velum-600 hover:border-velum-400 transition-colors ${pressBtn}`}>Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Cancel Modal ──────────────────────────────────────────────────── */}
      {cancelApptId && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-white w-full sm:max-w-sm rounded-t-3xl sm:rounded-3xl border border-velum-200 shadow-2xl overflow-hidden animate-slide-up sm:animate-scale-in">
            <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-velum-50">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-red-50 border border-red-100 flex items-center justify-center"><X size={14} className="text-red-500" /></div>
                <h3 className="font-serif text-xl text-velum-900">Cancelar cita</h3>
              </div>
              <button type="button" onClick={() => { setCancelApptId(null); setCancelReason(""); }} className={`w-8 h-8 rounded-xl bg-velum-50 hover:bg-velum-100 flex items-center justify-center transition-colors ${pressBtn}`}>
                <X size={16} className="text-velum-600" />
              </button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <p className="text-[13px] text-velum-600 leading-snug">¿Confirmas que deseas cancelar esta cita? Esta acción no se puede deshacer.</p>
              <div className="rounded-2xl bg-amber-50 border border-amber-200/80 px-4 py-3">
                <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-amber-700 mb-1">Política de cancelación</p>
                <p className="text-[12px] text-amber-800 leading-snug">Con más de 24h de anticipación: sin cargo. Con menos de 24h: el depósito no será reembolsado.</p>
              </div>
              <div><label className={lbl}>Motivo (opcional)</label><textarea className={`${fld} resize-none`} rows={2} value={cancelReason} onChange={e => setCancelReason(e.target.value)} placeholder="¿Por qué cancelas esta cita?" /></div>
            </div>
            <div className="flex gap-3 px-6 py-4 border-t border-velum-50">
              <button type="button" onClick={handleCancelAppointment} disabled={isCancellingAppt}
                className={`flex-1 rounded-2xl bg-red-500 py-3.5 text-[14px] font-semibold text-white hover:bg-red-600 disabled:opacity-50 transition-colors ${pressBtn}`}>
                {isCancellingAppt ? "Cancelando…" : "Confirmar cancelación"}
              </button>
              <button type="button" onClick={() => { setCancelApptId(null); setCancelReason(""); }} disabled={isCancellingAppt}
                className={`px-5 rounded-2xl border border-velum-200 text-[14px] font-medium text-velum-600 hover:border-velum-400 transition-colors ${pressBtn}`}>
                Mantener
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

// ── Next appointment countdown chip ─────────────────────────────────────────
const NextApptCountdown: React.FC<{ date: string | null }> = ({ date }) => {
  const label = useCountdown(date);
  if (!label) return null;
  return (
    <span className="inline-flex items-center gap-1.5 bg-velum-800/70 border border-velum-700/50 rounded-full px-3 py-1 text-[11px] font-bold text-velum-300 animate-fade-in">
      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
      {label}
    </span>
  );
};
