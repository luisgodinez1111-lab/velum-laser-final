import React, { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "../components/Button";
import { PasswordInput } from "../components/PasswordInput";
import { ChevronLeft, ChevronRight, Lock, User, Sparkles, Shield, FileText, Stethoscope, CircleCheck, KeyRound, Mail } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { clinicalService, MedicalIntake } from "../services/clinicalService";
import { AuthUser, authService } from "../services/authService";
import { stripeService } from "../services/stripeService";
import { DEFAULT_PHOTOTYPE_QUESTIONS, getFototipo } from "../components/PhototypeQuestionnaire";
import { useToast } from "../context/ToastContext";
import { MEMBERSHIPS, APPOINTMENT_DEPOSIT_MXN } from "../constants";

type ViewState = "intro" | "login" | "register" | "intake" | "calendar" | "forgot" | "forgot-otp" | "email-verify";
type AppointmentType = "standard" | "valuation";

type IntakeDraft = {
  personalJson: {
    fullName?: string;
    phone?: string;
    birthDate?: string;
  };
  historyJson: {
    allergies?: string;
    medications?: string;
    skinConditions?: string;
  };
  phototype?: number;
  consentAccepted: boolean;
  signatureKey?: string;
};

const emptyIntakeDraft: IntakeDraft = {
  personalJson: {},
  historyJson: {},
  consentAccepted: false
};

const shellWrapperClass = "w-full max-w-5xl mx-auto px-4 py-8 sm:py-10 animate-fade-in";
const glassCardClass = "rounded-[28px] border border-velum-200/80 bg-white/95 shadow-[0_24px_80px_rgba(84,69,56,0.12)] backdrop-blur-sm";
const fieldClass = "w-full rounded-2xl bg-velum-50 border border-velum-200/60 px-5 py-4 text-[15px] text-velum-900 placeholder:text-velum-400 outline-none transition-all duration-200 focus:bg-white focus:border-velum-900 focus:ring-4 focus:ring-velum-900/[0.07]";
const labelClass = "mb-2 block text-[11px] font-bold uppercase tracking-[0.18em] text-velum-500";

const intakeStepMeta = [
  {
    title: "Datos personales",
    subtitle: "Identificación básica y datos de contacto",
    icon: User
  },
  {
    title: "Historial médico",
    subtitle: "Antecedentes clínicos para parámetros seguros",
    icon: Stethoscope
  },
  {
    title: "Fototipo",
    subtitle: "Clasificación dermatológica inicial",
    icon: Sparkles
  },
  {
    title: "Consentimiento",
    subtitle: "Validación legal y autorización de tratamiento",
    icon: FileText
  }
] as const;

export const Agenda: React.FC = () => {
  const { login, register, isAuthenticated, user } = useAuth();
  const userRef = useRef(user);
  useEffect(() => { userRef.current = user; }, [user]);
  // Stores the AuthUser returned at registration so OTP verify can pre-fill intake
  const pendingRegistrationUser = useRef<AuthUser | null>(null);
  const toast = useToast();
  const location = useLocation();
  const navigate = useNavigate();

  const [viewState, setViewState] = useState<ViewState>("intro");
  const [appointmentType] = useState<AppointmentType>("standard");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [phone, setPhone] = useState("");

  const getPasswordChecks = (value: string) => ({
    length: value.length >= 8,
    upper: /[A-Z]/.test(value),
    lower: /[a-z]/.test(value),
    number: /[0-9]/.test(value),
    special: /[^A-Za-z0-9]/.test(value)
  });

  const registerPasswordChecks = getPasswordChecks(password);
  const registerPasswordScore = Object.values(registerPasswordChecks).filter(Boolean).length;
  const registerPasswordStrength =
    registerPasswordScore <= 2 ? "Debil" : registerPasswordScore <= 4 ? "Media" : "Fuerte";
  const registerPasswordStrengthClass =
    registerPasswordScore <= 2 ? "text-red-600" : registerPasswordScore <= 4 ? "text-amber-600" : "text-green-700";

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [birthDate, setBirthDate] = useState("");

  const [intakeStep, setIntakeStep] = useState(1);
  const [intake, setIntake] = useState<MedicalIntake | null>(null);
  const [intakeDraft, setIntakeDraft] = useState<IntakeDraft>(emptyIntakeDraft);
  const [intakeError, setIntakeError] = useState<string | null>(null);
  const [isSavingIntake, setIsSavingIntake] = useState(false);
  const [phototypeAnswers, setPhototypeAnswers] = useState<Record<string, string>>({});

  // OTP flows
  const [otpCode, setOtpCode] = useState("");
  const [otpEmail, setOtpEmail] = useState(""); // email usado en flujo olvidé contraseña
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [isOtpLoading, setIsOtpLoading] = useState(false);
  const [otpMessage, setOtpMessage] = useState<string | null>(null);
  const [otpSuccess, setOtpSuccess] = useState(false);

  const [appointmentMessage, setAppointmentMessage] = useState<string | null>(null);
  const [isScheduling, setIsScheduling] = useState(false);
  const [selectedPlanCode, setSelectedPlanCode] = useState<string | null>(null);
  // Previene que refreshIntake() sobreescriba "email-verify" al activarse isAuthenticated post-registro
  const [pendingEmailVerify, setPendingEmailVerify] = useState(false);

  // ── Real calendar state ────────────────────────────────────────────────
  type PublicSlot = { label: string; startMinute: number; endMinute: number; available: boolean };
  const [calendarBase, setCalendarBase] = useState<Date>(() => {
    const d = new Date();
    d.setDate(1);
    return d;
  });
  const [agendaPolicy, setAgendaPolicy] = useState<{ minAdvanceMinutes: number; maxAdvanceDays: number } | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [daySlots, setDaySlots] = useState<PublicSlot[]>([]);
  const [isLoadingSlots, setIsLoadingSlots] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<PublicSlot | null>(null);
  const [slotsError, setSlotsError] = useState<string | null>(null);

  const setGuestViewState = (target: "intro" | "login" | "register") => {
    setViewState(target);
    if (isAuthenticated) return;

    const search = target === "intro" ? "" : `?mode=${target}`;
    navigate({ pathname: "/agenda", search }, { replace: true });
  };

  // ── Helpers: date key (YYYY-MM-DD local) ─────────────────────────────
  const toDateKey = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  };

  const refreshIntake = async (prefill?: { fullName?: string; phone?: string; birthDate?: string }) => {
    if (!isAuthenticated) {
      return;
    }

    try {
      const current = await clinicalService.getMyMedicalIntake();
      const personalJson: IntakeDraft["personalJson"] =
        (current.personalJson as IntakeDraft["personalJson"]) ?? {};

      // Pre-fill when intake fields are empty (new registration)
      if (!personalJson.fullName && prefill?.fullName) personalJson.fullName = prefill.fullName;
      if (!personalJson.phone && prefill?.phone) personalJson.phone = prefill.phone;
      if (!personalJson.birthDate && prefill?.birthDate) personalJson.birthDate = prefill.birthDate;

      setIntake(current);
      setIntakeDraft({
        personalJson,
        historyJson: (current.historyJson as IntakeDraft["historyJson"]) ?? {},
        phototype: current.phototype ?? undefined,
        consentAccepted: current.consentAccepted,
        signatureKey: undefined
      });

      if (current.status === "submitted" || current.status === "approved") {
        setViewState("calendar");
      } else {
        setViewState("intake");
      }
    } catch {
      if (prefill?.fullName || prefill?.phone || prefill?.birthDate) {
        setIntakeDraft(prev => ({
          ...prev,
          personalJson: {
            fullName: prefill.fullName || prev.personalJson.fullName,
            phone: prefill.phone || prev.personalJson.phone,
            birthDate: prefill.birthDate || prev.personalJson.birthDate
          }
        }));
      }
      setViewState("intake");
    }
  };

  useEffect(() => {
    if (isAuthenticated && !pendingEmailVerify) {
      refreshIntake();
    }
  }, [isAuthenticated]);

  // Fetch agenda policy once when calendar view becomes active
  useEffect(() => {
    if (!isAuthenticated || agendaPolicy) return;
    clinicalService.getPublicAgendaPolicy()
      .then((p) => setAgendaPolicy(p))
      .catch(() => setAgendaPolicy({ minAdvanceMinutes: 120, maxAdvanceDays: 60 }));
  }, [isAuthenticated]);

  const handleSelectDate = async (dateKey: string) => {
    setSelectedDate(dateKey);
    setSelectedSlot(null);
    setDaySlots([]);
    setSlotsError(null);
    setIsLoadingSlots(true);
    try {
      const result = await clinicalService.getPublicAgendaSlots(dateKey);
      if (!result.isOpen || result.slots.length === 0) {
        setSlotsError("No hay disponibilidad para este día.");
        setDaySlots([]);
      } else {
        setDaySlots(result.slots);
      }
    } catch {
      setSlotsError("No se pudo cargar la disponibilidad. Intenta de nuevo.");
    } finally {
      setIsLoadingSlots(false);
    }
  };

  useEffect(() => {
    if (isAuthenticated) return;

    const params = new URLSearchParams(location.search);
    const mode = params.get("mode");
    if (mode === "login" || mode === "register") {
      setViewState(mode);
      return;
    }
    setViewState("intro");
  }, [location.search, isAuthenticated]);

  // Calendar helpers
  const calendarMonthLabel = calendarBase.toLocaleDateString("es-MX", { month: "long", year: "numeric" });
  const calendarDays = useMemo(() => {
    const year = calendarBase.getFullYear();
    const month = calendarBase.getMonth();
    const firstDow = new Date(year, month, 1).getDay(); // 0=Sun
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const now = new Date();
    const minMs = agendaPolicy ? agendaPolicy.minAdvanceMinutes * 60 * 1000 : 120 * 60 * 1000;
    const maxDays = agendaPolicy ? agendaPolicy.maxAdvanceDays : 60;
    const earliest = new Date(now.getTime() + minMs);
    const latest = new Date(now.getTime() + maxDays * 24 * 60 * 60 * 1000);
    const cells: Array<{ date: Date | null; dateKey: string | null; selectable: boolean }> = [];
    for (let i = 0; i < firstDow; i++) cells.push({ date: null, dateKey: null, selectable: false });
    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(year, month, d);
      const selectable = date >= earliest && date <= latest;
      cells.push({ date, dateKey: toDateKey(date), selectable });
    }
    return cells;
  }, [calendarBase, agendaPolicy]);

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAppointmentMessage(null);
    try {
      const userData = await login(email, password);
      await refreshIntake({ fullName: userData.name, phone: userData.phone, birthDate: userData.birthDate });
    } catch {
      toast.error("Credenciales incorrectas. Verifica tu correo y contraseña.");
    }
  };

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!firstName.trim() || !lastName.trim()) {
      toast.warning("Ingresa tu nombre y apellido para continuar.");
      return;
    }
    if (!phone.trim()) {
      toast.warning("Ingresa tu número celular para continuar.");
      return;
    }
    if (!birthDate) {
      toast.warning("Ingresa tu fecha de nacimiento para continuar.");
      return;
    }
    const birthDateObj = new Date(birthDate);
    const today = new Date();
    const age = today.getFullYear() - birthDateObj.getFullYear() -
      (today < new Date(today.getFullYear(), birthDateObj.getMonth(), birthDateObj.getDate()) ? 1 : 0);
    if (age < 18) {
      toast.warning("Debes tener al menos 18 años para registrarte.");
      return;
    }
    if (!Object.values(getPasswordChecks(password)).every(Boolean)) {
      toast.warning("La contraseña no cumple los requisitos de seguridad.");
      return;
    }
    if (password !== confirmPassword) {
      toast.warning("La confirmación de contraseña no coincide.");
      return;
    }

    try {
      setPendingEmailVerify(true);
      const registeredUser = await register({ email, password, firstName: firstName.trim(), lastName: lastName.trim(), phone: phone.trim(), birthDate });
      pendingRegistrationUser.current = registeredUser;
      toast.success("¡Cuenta creada! Confirma tu correo para continuar.");
      setViewState("email-verify");
    } catch (err: any) {
      setPendingEmailVerify(false);
      toast.error(err?.message ?? "No se pudo completar el registro. Intenta de nuevo.");
    }
  };

  // ── Olvidé mi contraseña: solicitar OTP ─────────────────────────────
  const handleForgotSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsOtpLoading(true);
    setOtpMessage(null);
    try {
      await authService.forgotPassword(otpEmail);
      setOtpMessage("Si el correo existe, recibirás un código de 6 dígitos en tu bandeja.");
      setOtpSuccess(false);
      setViewState("forgot-otp");
    } catch {
      setOtpMessage("No se pudo enviar el código. Intenta de nuevo.");
    } finally {
      setIsOtpLoading(false);
    }
  };

  // ── Olvidé mi contraseña: verificar OTP + nueva contraseña ───────────
  const handleResetPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmNewPassword) {
      setOtpMessage("Las contraseñas no coinciden.");
      return;
    }
    const passwordChecks = getPasswordChecks(newPassword);
    if (!Object.values(passwordChecks).every(Boolean)) {
      setOtpMessage("La contraseña debe incluir mínimo 8 caracteres, una mayúscula, una minúscula, un número y un símbolo.");
      return;
    }
    setIsOtpLoading(true);
    setOtpMessage(null);
    try {
      await authService.resetPassword(otpEmail, otpCode, newPassword);
      setOtpSuccess(true);
      setOtpMessage("¡Contraseña actualizada! Ya puedes iniciar sesión.");
      setTimeout(() => {
        setOtpCode("");
        setOtpEmail("");
        setNewPassword("");
        setConfirmNewPassword("");
        setOtpMessage(null);
        setOtpSuccess(false);
        setViewState("login");
      }, 2500);
    } catch {
      setOtpMessage("Código incorrecto o expirado. Verifica e intenta de nuevo.");
    } finally {
      setIsOtpLoading(false);
    }
  };

  // ── Verificar correo después del registro ────────────────────────────
  const handleEmailVerifySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsOtpLoading(true);
    setOtpMessage(null);
    try {
      await authService.verifyEmail(email, otpCode);
      setOtpSuccess(true);
      setOtpMessage("¡Correo verificado! Continuando con tu expediente...");
      // Capture form state NOW (before setTimeout closure)
      const prefillName = `${firstName.trim()} ${lastName.trim()}`.trim();
      const prefillPhone = phone.trim();
      const prefillBirthDate = birthDate;
      setTimeout(async () => {
        setOtpCode("");
        setOtpMessage(null);
        setOtpSuccess(false);
        setPendingEmailVerify(false);
        await refreshIntake({ fullName: prefillName, phone: prefillPhone, birthDate: prefillBirthDate });
      }, 1800);
    } catch {
      setOtpMessage("Código incorrecto o expirado. Verifica e intenta de nuevo.");
    } finally {
      setIsOtpLoading(false);
    }
  };

  const handleResendVerificationEmail = async () => {
    setIsOtpLoading(true);
    setOtpMessage(null);
    try {
      await authService.resendVerification(email);
      setOtpMessage("Código reenviado. Revisa tu bandeja de entrada.");
    } catch {
      setOtpMessage("No se pudo reenviar el código. Intenta de nuevo.");
    } finally {
      setIsOtpLoading(false);
    }
  };

  const saveIntakeDraft = async (submit: boolean) => {
    setIsSavingIntake(true);
    setIntakeError(null);

    try {
      const updated = await clinicalService.updateMyMedicalIntake({
        personalJson: intakeDraft.personalJson,
        historyJson: intakeDraft.historyJson,
        phototype: intakeDraft.phototype,
        consentAccepted: intakeDraft.consentAccepted,
        signatureKey: intakeDraft.signatureKey,
        status: submit ? "submitted" : "draft"
      });
      setIntake(updated);
      return true;
    } catch (error: any) {
      setIntakeError(error?.message ?? "No se pudo guardar el expediente.");
      return false;
    } finally {
      setIsSavingIntake(false);
    }
  };

  const PHOTOTYPE_CODE_TO_NUM: Record<string, number> = { I: 1, II: 2, III: 3, IV: 4, V: 5, VI: 6 };

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
      setIntakeDraft((prev) => ({ ...prev, phototype: PHOTOTYPE_CODE_TO_NUM[result.phototype] }));
    }
  };

  const handleNextIntakeStep = async () => {
    if (intakeStep === 3 && !intakeDraft.phototype) {
      setIntakeError("Responde todas las preguntas para calcular tu fototipo.");
      return;
    }
    const ok = await saveIntakeDraft(false);
    if (!ok) {
      return;
    }

    setIntakeStep((prev) => Math.min(prev + 1, 4));
  };

  const handleSubmitIntake = async () => {
    if (!intakeDraft.consentAccepted) {
      setIntakeError("Debes aceptar el consentimiento para enviar el expediente.");
      return;
    }

    const ok = await saveIntakeDraft(true);
    if (ok) {
      setViewState("calendar");
      setIntakeStep(1);
    }
  };

  const handleSchedule = async () => {
    if (!selectedDate || !selectedSlot) return;
    setIsScheduling(true);
    setAppointmentMessage(null);

    try {
      const [year, month, day] = selectedDate.split("-").map(Number);
      const startAt = new Date(year, month - 1, day, 0, selectedSlot.startMinute, 0, 0);
      const endAt = new Date(year, month - 1, day, 0, selectedSlot.endMinute, 0, 0);

      const checkoutUrl = await stripeService.createAppointmentDeposit({
        startAt: startAt.toISOString(),
        endAt: endAt.toISOString(),
        reason: appointmentType === "valuation" ? "valuation" : "laser_session",
        interestedPlanCode: selectedPlanCode ?? undefined,
      });

      window.location.href = checkoutUrl;
    } catch (error: any) {
      toast.error(error?.message ?? "No se pudo iniciar el pago. Intenta de nuevo.");
      setIsScheduling(false);
    }
  };

  useEffect(() => {
    const hash = window.location.hash;
    const search = hash.includes("?") ? hash.split("?")[1] : "";
    const params = new URLSearchParams(search);
    if (params.get("booking") === "success" && isAuthenticated) {
      toast.success("¡Cita reservada! Te confirmaremos los detalles pronto.");
      window.history.replaceState(null, "", window.location.pathname + "#/dashboard");
      navigate("/dashboard");
    }
  }, [isAuthenticated]);

    const __guestMode = typeof window !== "undefined"
    ? new URLSearchParams((window.location.hash.split("?")[1] ?? "")).get("mode")
    : null;
  const __effectiveViewState: "intro" | "login" | "register" =
    !isAuthenticated && (__guestMode === "login" || __guestMode === "register" || __guestMode === "intro")
      ? (__guestMode as "intro" | "login" | "register")
      : viewState;

  if (!isAuthenticated && __effectiveViewState === "intro") {
    return (
      <div className="min-h-[calc(100vh-7rem)] flex animate-fade-in">
        {/* Brand panel */}
        <div className="hidden lg:flex flex-col justify-between w-[44%] bg-velum-900 p-12 xl:p-16 relative overflow-hidden">
          <div className="absolute -top-40 -right-40 w-96 h-96 rounded-full bg-velum-700/25 blur-[80px] pointer-events-none" />
          <div className="absolute -bottom-32 -left-20 w-72 h-72 rounded-full bg-velum-600/15 blur-[60px] pointer-events-none" />
          <div className="relative">
            <div className="inline-flex items-center gap-2 mb-10">
              <div className="w-1.5 h-1.5 rounded-full bg-velum-400" />
              <p className="text-[11px] font-bold uppercase tracking-[0.26em] text-velum-400">Velum Laser</p>
            </div>
            <h1 className="font-serif text-4xl xl:text-5xl italic text-white leading-[1.15]">
              Tu piel.<br/>Tu agenda.<br/>Tu historia.
            </h1>
            <p className="mt-7 text-velum-300 text-[13px] font-light leading-relaxed max-w-[260px]">
              Plataforma clínica privada para depilación láser de alto estándar. Expediente digital, seguimiento y membresía integrados.
            </p>
          </div>
          <div className="relative">
            <div className="space-y-3 mb-8">
              <div className="flex items-center gap-3 text-velum-300 text-sm">
                <div className="w-7 h-7 rounded-xl bg-velum-800 flex items-center justify-center shrink-0">
                  <Shield size={13} className="text-velum-400" />
                </div>
                Historial clínico protegido y privado
              </div>
              <div className="flex items-center gap-3 text-velum-300 text-sm">
                <div className="w-7 h-7 rounded-xl bg-velum-800 flex items-center justify-center shrink-0">
                  <CircleCheck size={13} className="text-velum-400" />
                </div>
                Agenda directa sin intermediarios
              </div>
              <div className="flex items-center gap-3 text-velum-300 text-sm">
                <div className="w-7 h-7 rounded-xl bg-velum-800 flex items-center justify-center shrink-0">
                  <Sparkles size={13} className="text-velum-400" />
                </div>
                Seguimiento de sesiones y parámetros
              </div>
            </div>
            <div className="flex items-center gap-2 pt-5 border-t border-velum-800">
              <Lock size={11} className="text-velum-600" />
              <p className="text-[11px] uppercase tracking-[0.16em] text-velum-600">Sesión encriptada</p>
            </div>
          </div>
        </div>

        {/* Choice panel */}
        <div className="flex-1 flex flex-col items-center justify-center px-6 py-12 sm:px-10 bg-white">
          <div className="w-full max-w-md">
            <div className="mb-10 text-center lg:hidden">
              <div className="inline-flex items-center gap-2 mb-3">
                <div className="w-1.5 h-1.5 rounded-full bg-velum-500" />
                <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-velum-500">Velum Laser</p>
              </div>
              <h1 className="font-serif text-4xl italic text-velum-900">Portal de pacientes</h1>
            </div>
            <div className="mb-10 hidden lg:block">
              <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-velum-500 mb-2">Portal de pacientes</p>
              <h2 className="font-serif text-[2.5rem] italic text-velum-900 leading-tight">¿Cómo deseas acceder?</h2>
            </div>
            <div className="space-y-4">
              <button
                type="button"
                onClick={() => setGuestViewState("login")}
                className="group w-full flex items-center gap-5 rounded-3xl border-2 border-velum-100 bg-velum-50 p-6 text-left transition-all duration-300 hover:border-velum-300 hover:bg-white hover:shadow-lg active:scale-[0.99]"
              >
                <div className="w-12 h-12 rounded-2xl bg-white shadow-sm border border-velum-200 flex items-center justify-center text-velum-700 group-hover:bg-velum-900 group-hover:text-white group-hover:border-velum-900 transition-all duration-300 shrink-0">
                  <User size={20} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-velum-500 mb-0.5">Ya tengo cuenta</p>
                  <p className="text-[17px] font-semibold text-velum-900">Iniciar sesión</p>
                </div>
                <ChevronRight size={18} className="text-velum-300 group-hover:text-velum-700 group-hover:translate-x-0.5 transition-all duration-200 shrink-0" />
              </button>
              <button
                type="button"
                onClick={() => setGuestViewState("register")}
                className="group w-full flex items-center gap-5 rounded-3xl bg-velum-900 p-6 text-left transition-all duration-300 hover:bg-velum-800 hover:shadow-xl active:scale-[0.99]"
              >
                <div className="w-12 h-12 rounded-2xl bg-velum-800 flex items-center justify-center text-velum-300 group-hover:bg-velum-700 transition-all duration-300 shrink-0">
                  <Sparkles size={20} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-velum-500 mb-0.5">Primera visita</p>
                  <p className="text-[17px] font-semibold text-white">Crear cuenta</p>
                </div>
                <ChevronRight size={18} className="text-velum-600 group-hover:text-velum-300 group-hover:translate-x-0.5 transition-all duration-200 shrink-0" />
              </button>
            </div>
            <p className="mt-10 text-center text-[11px] text-velum-400">
              Acceso exclusivo para pacientes registrados en Velum Laser
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (!isAuthenticated && __effectiveViewState === "login") {
    return (
      <div className="min-h-[calc(100vh-7rem)] flex animate-fade-in">
        {/* Brand panel */}
        <div className="hidden lg:flex flex-col justify-between w-[44%] bg-velum-900 p-12 xl:p-16 relative overflow-hidden">
          <div className="absolute -top-40 -right-40 w-96 h-96 rounded-full bg-velum-700/25 blur-[80px] pointer-events-none" />
          <div className="absolute bottom-0 left-0 w-80 h-80 rounded-full bg-velum-600/15 blur-[60px] pointer-events-none" />
          <div className="relative">
            <div className="inline-flex items-center gap-2 mb-10">
              <div className="w-1.5 h-1.5 rounded-full bg-velum-400" />
              <p className="text-[11px] font-bold uppercase tracking-[0.26em] text-velum-400">Velum Laser</p>
            </div>
            <h1 className="font-serif text-4xl xl:text-[2.75rem] italic text-white leading-[1.2]">
              Bienvenido<br/>de vuelta.
            </h1>
            <p className="mt-6 text-velum-300 text-[13px] font-light leading-relaxed max-w-[260px]">
              Tu expediente clínico y agenda te esperan. Ingresa para continuar.
            </p>
          </div>
          <div className="relative">
            <div className="space-y-3 mb-8">
              <div className="flex items-center gap-3 text-velum-300 text-sm">
                <div className="w-7 h-7 rounded-xl bg-velum-800 flex items-center justify-center shrink-0">
                  <Shield size={13} className="text-velum-400" />
                </div>
                Datos clínicos protegidos
              </div>
              <div className="flex items-center gap-3 text-velum-300 text-sm">
                <div className="w-7 h-7 rounded-xl bg-velum-800 flex items-center justify-center shrink-0">
                  <CircleCheck size={13} className="text-velum-400" />
                </div>
                Flujo directo a expediente y agenda
              </div>
            </div>
            <div className="flex items-center gap-3 pt-5 border-t border-velum-800">
              <span className="text-[11px] uppercase tracking-[0.16em] text-velum-600">¿Primera vez?</span>
              <button
                type="button"
                onClick={() => setGuestViewState("register")}
                className="text-[11px] uppercase tracking-[0.16em] text-velum-400 underline underline-offset-2 hover:text-velum-200 transition"
              >
                Crear cuenta
              </button>
            </div>
          </div>
        </div>

        {/* Form panel */}
        <div className="flex-1 flex flex-col items-center justify-center px-6 py-12 sm:px-10 lg:px-16 bg-white">
          <div className="w-full max-w-sm">
            <button
              type="button"
              onClick={() => setGuestViewState("intro")}
              className="mb-10 inline-flex items-center gap-1.5 text-sm text-velum-400 hover:text-velum-900 transition-colors"
            >
              <ChevronLeft size={16} />
              Atrás
            </button>
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-velum-500 mb-2">Acceso seguro</p>
            <h2 className="font-serif text-[2.25rem] italic text-velum-900 mb-10 leading-tight">Iniciar sesión</h2>
            <form onSubmit={handleLoginSubmit} className="space-y-5">
              <div>
                <label className="mb-2 block text-[11px] font-bold uppercase tracking-[0.18em] text-velum-500">
                  Correo electrónico
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="w-full rounded-2xl bg-velum-50 border border-velum-200/60 px-5 py-4 text-[15px] text-velum-900 placeholder:text-velum-400 outline-none transition-all duration-200 focus:bg-white focus:border-velum-900 focus:ring-4 focus:ring-velum-900/[0.07]"
                  placeholder="correo@ejemplo.com"
                  autoComplete="email"
                />
              </div>
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <label className="text-[11px] font-bold uppercase tracking-[0.18em] text-velum-500">
                    Contraseña
                  </label>
                  <button
                    type="button"
                    onClick={() => { setOtpEmail(email); setOtpCode(""); setOtpMessage(null); setOtpSuccess(false); setViewState("forgot"); }}
                    className="text-[11px] text-velum-500 hover:text-velum-900 transition underline underline-offset-2"
                  >
                    ¿Olvidaste tu contraseña?
                  </button>
                </div>
                <PasswordInput
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="w-full rounded-2xl bg-velum-50 border border-velum-200/60 px-5 py-4 text-[15px] text-velum-900 placeholder:text-velum-400 outline-none transition-all duration-200 focus:bg-white focus:border-velum-900 focus:ring-4 focus:ring-velum-900/[0.07]"
                  placeholder="••••••••"
                  autoComplete="current-password"
                />
              </div>
              <button
                type="submit"
                className="mt-2 w-full rounded-2xl bg-velum-900 py-4 text-[15px] font-semibold text-white hover:bg-velum-800 active:scale-[0.99] transition-all duration-200"
              >
                Entrar
              </button>
            </form>
            {appointmentMessage && (
              <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {appointmentMessage}
              </div>
            )}
            <p className="mt-10 text-center text-sm text-velum-400 lg:hidden">
              ¿Primera vez?{" "}
              <button
                type="button"
                onClick={() => setGuestViewState("register")}
                className="text-velum-700 font-semibold underline underline-offset-2 hover:text-velum-900 transition"
              >
                Crear cuenta
              </button>
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (!isAuthenticated && __effectiveViewState === "register") {
    return (
      <div className="min-h-[calc(100vh-7rem)] flex animate-fade-in">
        {/* Brand panel */}
        <div className="hidden lg:flex flex-col justify-between w-[44%] bg-velum-900 p-12 xl:p-16 relative overflow-hidden">
          <div className="absolute -top-32 -right-32 w-80 h-80 rounded-full bg-velum-700/25 blur-[80px] pointer-events-none" />
          <div className="absolute -bottom-32 -left-16 w-72 h-72 rounded-full bg-velum-600/20 blur-[60px] pointer-events-none" />
          <div className="relative">
            <div className="inline-flex items-center gap-2 mb-10">
              <div className="w-1.5 h-1.5 rounded-full bg-velum-400" />
              <p className="text-[11px] font-bold uppercase tracking-[0.26em] text-velum-400">Velum Laser</p>
            </div>
            <h1 className="font-serif text-4xl xl:text-[2.75rem] italic text-white leading-[1.2]">
              Comienza tu<br/>expediente<br/>clínico.
            </h1>
            <p className="mt-6 text-velum-300 text-[13px] font-light leading-relaxed max-w-[260px]">
              Alta en menos de 1 minuto. Después del registro completarás tu expediente médico directamente.
            </p>
          </div>
          <div className="relative">
            <div className="space-y-3 mb-8">
              <div className="flex items-center gap-3 text-velum-300 text-sm">
                <div className="w-7 h-7 rounded-xl bg-velum-800 flex items-center justify-center shrink-0">
                  <CircleCheck size={13} className="text-velum-400" />
                </div>
                Alta en menos de 1 minuto
              </div>
              <div className="flex items-center gap-3 text-velum-300 text-sm">
                <div className="w-7 h-7 rounded-xl bg-velum-800 flex items-center justify-center shrink-0">
                  <FileText size={13} className="text-velum-400" />
                </div>
                Perfil conectado con expediente y consentimiento
              </div>
              <div className="flex items-center gap-3 text-velum-300 text-sm">
                <div className="w-7 h-7 rounded-xl bg-velum-800 flex items-center justify-center shrink-0">
                  <Shield size={13} className="text-velum-400" />
                </div>
                Datos protegidos bajo NOM-004
              </div>
            </div>
            <div className="flex items-center gap-3 pt-5 border-t border-velum-800">
              <span className="text-[11px] uppercase tracking-[0.16em] text-velum-600">¿Ya tienes cuenta?</span>
              <button
                type="button"
                onClick={() => setGuestViewState("login")}
                className="text-[11px] uppercase tracking-[0.16em] text-velum-400 underline underline-offset-2 hover:text-velum-200 transition"
              >
                Iniciar sesión
              </button>
            </div>
          </div>
        </div>

        {/* Form panel */}
        <div className="flex-1 flex flex-col items-center justify-center px-6 py-12 sm:px-10 lg:px-16 bg-white overflow-y-auto">
          <div className="w-full max-w-sm">
            <button
              type="button"
              onClick={() => setGuestViewState("intro")}
              className="mb-10 inline-flex items-center gap-1.5 text-sm text-velum-400 hover:text-velum-900 transition-colors"
            >
              <ChevronLeft size={16} />
              Atrás
            </button>
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-velum-500 mb-2">Cuenta nueva</p>
            <h2 className="font-serif text-[2.25rem] italic text-velum-900 mb-10 leading-tight">Crear cuenta</h2>
            <form onSubmit={handleRegisterSubmit} className="space-y-5">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-2 block text-[11px] font-bold uppercase tracking-[0.18em] text-velum-500">Nombre</label>
                  <input
                    type="text"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    required
                    className="w-full rounded-2xl bg-velum-50 border border-velum-200/60 px-4 py-4 text-[15px] text-velum-900 placeholder:text-velum-400 outline-none transition-all duration-200 focus:bg-white focus:border-velum-900 focus:ring-4 focus:ring-velum-900/[0.07]"
                    placeholder="Ana"
                    autoComplete="given-name"
                  />
                </div>
                <div>
                  <label className="mb-2 block text-[11px] font-bold uppercase tracking-[0.18em] text-velum-500">Apellido</label>
                  <input
                    type="text"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    required
                    className="w-full rounded-2xl bg-velum-50 border border-velum-200/60 px-4 py-4 text-[15px] text-velum-900 placeholder:text-velum-400 outline-none transition-all duration-200 focus:bg-white focus:border-velum-900 focus:ring-4 focus:ring-velum-900/[0.07]"
                    placeholder="García"
                    autoComplete="family-name"
                  />
                </div>
              </div>
              <div>
                <label className="mb-2 block text-[11px] font-bold uppercase tracking-[0.18em] text-velum-500">Correo electrónico</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="w-full rounded-2xl bg-velum-50 border border-velum-200/60 px-5 py-4 text-[15px] text-velum-900 placeholder:text-velum-400 outline-none transition-all duration-200 focus:bg-white focus:border-velum-900 focus:ring-4 focus:ring-velum-900/[0.07]"
                  placeholder="correo@ejemplo.com"
                  autoComplete="email"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-2 block text-[11px] font-bold uppercase tracking-[0.18em] text-velum-500">Celular</label>
                  <input
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    required
                    className="w-full rounded-2xl bg-velum-50 border border-velum-200/60 px-4 py-4 text-[15px] text-velum-900 placeholder:text-velum-400 outline-none transition-all duration-200 focus:bg-white focus:border-velum-900 focus:ring-4 focus:ring-velum-900/[0.07]"
                    placeholder="+52 55…"
                  />
                </div>
                <div>
                  <label className="mb-2 block text-[11px] font-bold uppercase tracking-[0.18em] text-velum-500">Nacimiento</label>
                  <input
                    type="date"
                    value={birthDate}
                    onChange={(e) => setBirthDate(e.target.value)}
                    required
                    max={new Date(new Date().setFullYear(new Date().getFullYear() - 18)).toISOString().split("T")[0]}
                    className="w-full rounded-2xl bg-velum-50 border border-velum-200/60 px-4 py-4 text-[15px] text-velum-900 outline-none transition-all duration-200 focus:bg-white focus:border-velum-900 focus:ring-4 focus:ring-velum-900/[0.07]"
                  />
                </div>
              </div>
              <div>
                <label className="mb-2 block text-[11px] font-bold uppercase tracking-[0.18em] text-velum-500">Contraseña</label>
                <PasswordInput
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="w-full rounded-2xl bg-velum-50 border border-velum-200/60 px-5 py-4 text-[15px] text-velum-900 placeholder:text-velum-400 outline-none transition-all duration-200 focus:bg-white focus:border-velum-900 focus:ring-4 focus:ring-velum-900/[0.07]"
                  placeholder="••••••••"
                  autoComplete="new-password"
                />
                <div className="mt-3 rounded-2xl bg-velum-50 border border-velum-200/60 px-4 py-3">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-[11px] uppercase tracking-[0.16em] text-velum-500">Fortaleza</p>
                    <p className={`text-[11px] font-bold ${registerPasswordStrengthClass}`}>{registerPasswordStrength}</p>
                  </div>
                  <div className="flex gap-1 mb-3">
                    {[1,2,3,4,5].map((i) => (
                      <div key={i} className={`h-1 flex-1 rounded-full transition-all duration-300 ${i <= registerPasswordScore ? (registerPasswordScore <= 2 ? "bg-red-400" : registerPasswordScore <= 4 ? "bg-amber-400" : "bg-green-500") : "bg-velum-200"}`} />
                    ))}
                  </div>
                  <div className="grid grid-cols-2 gap-1 text-[11px]">
                    <span className={registerPasswordChecks.length ? "text-green-700" : "text-velum-400"}>{registerPasswordChecks.length ? "✓" : "·"} 8+ caracteres</span>
                    <span className={registerPasswordChecks.upper ? "text-green-700" : "text-velum-400"}>{registerPasswordChecks.upper ? "✓" : "·"} Mayúscula</span>
                    <span className={registerPasswordChecks.lower ? "text-green-700" : "text-velum-400"}>{registerPasswordChecks.lower ? "✓" : "·"} Minúscula</span>
                    <span className={registerPasswordChecks.number ? "text-green-700" : "text-velum-400"}>{registerPasswordChecks.number ? "✓" : "·"} Número</span>
                    <span className={registerPasswordChecks.special ? "text-green-700" : "text-velum-400"}>{registerPasswordChecks.special ? "✓" : "·"} Símbolo</span>
                  </div>
                </div>
              </div>
              <div>
                <label className="mb-2 block text-[11px] font-bold uppercase tracking-[0.18em] text-velum-500">Confirmar contraseña</label>
                <PasswordInput
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  className="w-full rounded-2xl bg-velum-50 border border-velum-200/60 px-5 py-4 text-[15px] text-velum-900 placeholder:text-velum-400 outline-none transition-all duration-200 focus:bg-white focus:border-velum-900 focus:ring-4 focus:ring-velum-900/[0.07]"
                  placeholder="••••••••"
                  autoComplete="new-password"
                />
              </div>
              <button
                type="submit"
                className="mt-2 w-full rounded-2xl bg-velum-900 py-4 text-[15px] font-semibold text-white hover:bg-velum-800 active:scale-[0.99] transition-all duration-200"
              >
                Crear cuenta
              </button>
            </form>
            {appointmentMessage && (
              <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {appointmentMessage}
              </div>
            )}
            <p className="mt-8 text-center text-sm text-velum-400 lg:hidden">
              ¿Ya tienes cuenta?{" "}
              <button
                type="button"
                onClick={() => setGuestViewState("login")}
                className="text-velum-700 font-semibold underline underline-offset-2 hover:text-velum-900 transition"
              >
                Iniciar sesión
              </button>
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ── Olvidé mi contraseña: ingresar correo ─────────────────────────
  if (!isAuthenticated && viewState === "forgot") {
    return (
      <div className="min-h-[calc(100vh-7rem)] flex items-center justify-center bg-white px-6 py-12 animate-fade-in">
        <div className="w-full max-w-sm">
          <button
            type="button"
            onClick={() => { setOtpMessage(null); setViewState("login"); }}
            className="mb-10 inline-flex items-center gap-1.5 text-sm text-velum-400 hover:text-velum-900 transition-colors"
          >
            <ChevronLeft size={16} />
            Volver al inicio de sesión
          </button>
          <div className="mb-10">
            <div className="w-14 h-14 rounded-2xl bg-velum-50 border border-velum-200 flex items-center justify-center mb-6">
              <KeyRound size={24} className="text-velum-700" />
            </div>
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-velum-500 mb-2">Recuperar acceso</p>
            <h2 className="font-serif text-[2.25rem] italic text-velum-900 mb-3 leading-tight">Restablecer contraseña</h2>
            <p className="text-[14px] text-velum-500 leading-relaxed">
              Ingresa tu correo y te enviaremos un código de 6 dígitos para crear una nueva contraseña.
            </p>
          </div>
          <form onSubmit={handleForgotSubmit} className="space-y-5">
            <div>
              <label className="mb-2 block text-[11px] font-bold uppercase tracking-[0.18em] text-velum-500">
                Correo electrónico
              </label>
              <input
                type="email"
                value={otpEmail}
                onChange={(e) => setOtpEmail(e.target.value)}
                required
                className="w-full rounded-2xl bg-velum-50 border border-velum-200/60 px-5 py-4 text-[15px] text-velum-900 placeholder:text-velum-400 outline-none transition-all duration-200 focus:bg-white focus:border-velum-900 focus:ring-4 focus:ring-velum-900/[0.07]"
                placeholder="correo@ejemplo.com"
                autoFocus
              />
            </div>
            <button
              type="submit"
              disabled={isOtpLoading}
              className="w-full rounded-2xl bg-velum-900 py-4 text-[15px] font-semibold text-white hover:bg-velum-800 disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.99] transition-all duration-200"
            >
              {isOtpLoading ? "Enviando..." : "Enviar código"}
            </button>
          </form>
          {otpMessage && (
            <div className={`mt-5 rounded-2xl px-4 py-3 text-[13px] ${otpSuccess ? "bg-green-50 text-green-700" : "bg-amber-50 text-amber-700"}`}>
              {otpMessage}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Olvidé mi contraseña: ingresar código OTP + nueva contraseña ───
  if (!isAuthenticated && viewState === "forgot-otp") {
    const newPasswordChecks = getPasswordChecks(newPassword);
    const newPasswordScore = Object.values(newPasswordChecks).filter(Boolean).length;
    const newPasswordStrength = newPasswordScore <= 2 ? "Débil" : newPasswordScore <= 4 ? "Media" : "Fuerte";
    const newPasswordStrengthClass = newPasswordScore <= 2 ? "text-red-600" : newPasswordScore <= 4 ? "text-amber-600" : "text-green-700";

    return (
      <div className="min-h-[calc(100vh-7rem)] flex items-center justify-center bg-white px-6 py-12 animate-fade-in">
        <div className="w-full max-w-sm">
          <button
            type="button"
            onClick={() => { setOtpMessage(null); setViewState("forgot"); }}
            className="mb-10 inline-flex items-center gap-1.5 text-sm text-velum-400 hover:text-velum-900 transition-colors"
          >
            <ChevronLeft size={16} />
            Atrás
          </button>
          <div className="mb-10">
            <div className="w-14 h-14 rounded-2xl bg-velum-50 border border-velum-200 flex items-center justify-center mb-6">
              <Mail size={24} className="text-velum-700" />
            </div>
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-velum-500 mb-1">Verificación</p>
            <p className="text-[13px] text-velum-500 mb-3">{otpEmail}</p>
            <h2 className="font-serif text-[2.25rem] italic text-velum-900 mb-3 leading-tight">Ingresa el código</h2>
            <p className="text-[14px] text-velum-500">Revisa tu bandeja de entrada y escribe el código de 6 dígitos.</p>
          </div>
          <form onSubmit={handleResetPasswordSubmit} className="space-y-5">
            <div>
              <label className="mb-2 block text-[11px] font-bold uppercase tracking-[0.18em] text-velum-500">
                Código de verificación
              </label>
              <input
                type="text"
                inputMode="numeric"
                pattern="\d{6}"
                maxLength={6}
                value={otpCode}
                onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                required
                className="w-full rounded-2xl bg-velum-50 border border-velum-200/60 px-5 py-5 text-center text-[28px] font-bold tracking-[0.4em] text-velum-900 outline-none transition-all duration-200 focus:bg-white focus:border-velum-900 focus:ring-4 focus:ring-velum-900/[0.07]"
                placeholder="000000"
                autoFocus
              />
            </div>
            <div>
              <label className="mb-2 block text-[11px] font-bold uppercase tracking-[0.18em] text-velum-500">Nueva contraseña</label>
              <PasswordInput
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                className="w-full rounded-2xl bg-velum-50 border border-velum-200/60 px-5 py-4 text-[15px] text-velum-900 placeholder:text-velum-400 outline-none transition-all duration-200 focus:bg-white focus:border-velum-900 focus:ring-4 focus:ring-velum-900/[0.07]"
                placeholder="••••••••"
              />
              <div className="mt-3 rounded-2xl bg-velum-50 border border-velum-200/60 px-4 py-3">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[11px] uppercase tracking-[0.16em] text-velum-500">Fortaleza</p>
                  <p className={`text-[11px] font-bold ${newPasswordStrengthClass}`}>{newPasswordStrength}</p>
                </div>
                <div className="flex gap-1">
                  {[1,2,3,4,5].map((i) => (
                    <div key={i} className={`h-1 flex-1 rounded-full transition-all duration-300 ${i <= newPasswordScore ? (newPasswordScore <= 2 ? "bg-red-400" : newPasswordScore <= 4 ? "bg-amber-400" : "bg-green-500") : "bg-velum-200"}`} />
                  ))}
                </div>
              </div>
            </div>
            <div>
              <label className="mb-2 block text-[11px] font-bold uppercase tracking-[0.18em] text-velum-500">Confirmar nueva contraseña</label>
              <PasswordInput
                value={confirmNewPassword}
                onChange={(e) => setConfirmNewPassword(e.target.value)}
                required
                className="w-full rounded-2xl bg-velum-50 border border-velum-200/60 px-5 py-4 text-[15px] text-velum-900 placeholder:text-velum-400 outline-none transition-all duration-200 focus:bg-white focus:border-velum-900 focus:ring-4 focus:ring-velum-900/[0.07]"
                placeholder="••••••••"
              />
            </div>
            <button
              type="submit"
              disabled={isOtpLoading || otpSuccess}
              className="w-full rounded-2xl bg-velum-900 py-4 text-[15px] font-semibold text-white hover:bg-velum-800 disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.99] transition-all duration-200"
            >
              {isOtpLoading ? "Verificando..." : "Actualizar contraseña"}
            </button>
          </form>
          {otpMessage && (
            <div className={`mt-5 rounded-2xl px-4 py-3 text-[13px] ${otpSuccess ? "bg-green-50 text-green-700" : "bg-red-50 text-red-600"}`}>
              {otpMessage}
            </div>
          )}
          <button
            type="button"
            onClick={() => { setOtpCode(""); setOtpMessage(null); setViewState("forgot"); }}
            className="mt-6 w-full text-center text-[13px] text-velum-400 hover:text-velum-900 transition underline underline-offset-2"
          >
            Reenviar código
          </button>
        </div>
      </div>
    );
  }

  // ── Verificación de correo post-registro ────────────────────────────
  if (isAuthenticated && viewState === "email-verify") {
    return (
      <div className="min-h-[calc(100vh-7rem)] flex items-center justify-center bg-white px-6 py-12 animate-fade-in">
        <div className="w-full max-w-sm text-center">
          <div className="w-16 h-16 rounded-2xl bg-velum-50 border border-velum-200 flex items-center justify-center mx-auto mb-8">
            <Mail size={28} className="text-velum-700" />
          </div>
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-velum-500 mb-3">Activación de cuenta</p>
          <h2 className="font-serif text-[2.25rem] italic text-velum-900 mb-5 leading-tight">Confirma tu correo</h2>
          <p className="text-[14px] text-velum-500 leading-relaxed mb-10">
            Enviamos un código de 6 dígitos a<br/>
            <strong className="text-velum-900 font-semibold">{email}</strong>
          </p>
          <form onSubmit={handleEmailVerifySubmit} className="space-y-5">
            <div>
              <input
                type="text"
                inputMode="numeric"
                pattern="\d{6}"
                maxLength={6}
                value={otpCode}
                onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                required
                className="w-full rounded-2xl bg-velum-50 border border-velum-200/60 px-5 py-5 text-center text-[32px] font-bold tracking-[0.44em] text-velum-900 outline-none transition-all duration-200 focus:bg-white focus:border-velum-900 focus:ring-4 focus:ring-velum-900/[0.07]"
                placeholder="000000"
                autoFocus
              />
            </div>
            <button
              type="submit"
              disabled={isOtpLoading || otpSuccess || otpCode.length < 6}
              className="w-full rounded-2xl bg-velum-900 py-4 text-[15px] font-semibold text-white hover:bg-velum-800 disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.99] transition-all duration-200"
            >
              {isOtpLoading ? "Verificando..." : otpSuccess ? "¡Verificado!" : "Confirmar correo"}
            </button>
          </form>
          {otpMessage && (
            <div className={`mt-5 rounded-2xl px-4 py-3 text-[13px] ${otpSuccess ? "bg-green-50 text-green-700" : "bg-red-50 text-red-600"}`}>
              {otpMessage}
            </div>
          )}
          <div className="mt-8 space-y-4">
            <button
              type="button"
              onClick={handleResendVerificationEmail}
              disabled={isOtpLoading}
              className="text-[13px] text-velum-500 hover:text-velum-900 transition underline underline-offset-2 disabled:opacity-50"
            >
              {isOtpLoading ? "Enviando..." : "Reenviar código"}
            </button>
            <div />
            <button
              type="button"
              onClick={() => { const pf = { fullName: `${firstName.trim()} ${lastName.trim()}`.trim(), phone: phone.trim(), birthDate }; setOtpCode(""); setOtpMessage(null); setPendingEmailVerify(false); refreshIntake(pf); }}
              className="text-[12px] text-velum-400 hover:text-velum-600 transition"
            >
              Omitir y continuar →
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (viewState === "intake") {
    const progress = (intakeStep / 4) * 100;
    const activeMeta = intakeStepMeta[intakeStep - 1];

    return (
      <div className={shellWrapperClass}>
        <section className={`${glassCardClass} p-4 sm:p-6 lg:p-8`}>
          <div className="grid gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
            <aside className="rounded-3xl border border-velum-200 bg-velum-50/70 p-4 sm:p-5 lg:sticky lg:top-24 lg:self-start">
              <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-velum-500">Proceso clínico</p>
              <h2 className="mt-1 font-serif text-2xl text-velum-900">Expediente médico</h2>
              <p className="mt-2 text-xs text-velum-600">Paso {intakeStep} de 4</p>

              <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-white">
                <div className="h-full rounded-full bg-velum-900 transition-all duration-500" style={{ width: `${progress}%` }} />
              </div>

              <div className="mt-4 space-y-2">
                {intakeStepMeta.map((step, idx) => {
                  const current = intakeStep === idx + 1;
                  const completed = intakeStep > idx + 1;
                  const Icon = step.icon;
                  return (
                    <div
                      key={step.title}
                      className={`rounded-2xl border px-3 py-2 transition ${
                        current
                          ? "border-velum-900 bg-velum-900 text-velum-50"
                          : completed
                            ? "border-velum-300 bg-white text-velum-700"
                            : "border-velum-200 bg-white text-velum-500"
                      }`}
                    >
                      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider">
                        <Icon size={14} />
                        <span>{idx + 1}. {step.title}</span>
                      </div>
                      <p className={`mt-1 text-[11px] ${current ? "text-velum-200" : "text-velum-500"}`}>{step.subtitle}</p>
                    </div>
                  );
                })}
              </div>
            </aside>

            <div>
              <header className="mb-6 rounded-3xl border border-velum-200 bg-white p-5 sm:p-6">
                <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-velum-500">Paso activo</p>
                <h1 className="mt-1 font-serif text-3xl italic text-velum-900">{activeMeta.title}</h1>
                <p className="mt-2 text-sm text-velum-600">{activeMeta.subtitle}</p>
              </header>

              <div className="rounded-3xl border border-velum-200 bg-velum-50/70 p-5 sm:p-6">
                {intakeStep === 1 && (
                  <div className="space-y-4">
                    <h3 className="font-serif text-2xl text-velum-900">Datos personales</h3>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <div className="sm:col-span-2">
                        <label className={labelClass}>Nombre completo</label>
                        <input
                          className={fieldClass}
                          placeholder="Nombre completo"
                          value={intakeDraft.personalJson.fullName ?? ""}
                          onChange={(e) =>
                            setIntakeDraft((prev) => ({ ...prev, personalJson: { ...prev.personalJson, fullName: e.target.value } }))
                          }
                        />
                      </div>
                      <div>
                        <label className={labelClass}>Teléfono</label>
                        <input
                          className={fieldClass}
                          placeholder="55 1234 5678"
                          value={intakeDraft.personalJson.phone ?? ""}
                          onChange={(e) =>
                            setIntakeDraft((prev) => ({ ...prev, personalJson: { ...prev.personalJson, phone: e.target.value } }))
                          }
                        />
                      </div>
                      <div>
                        <label className={labelClass}>Fecha de nacimiento</label>
                        <input
                          className={fieldClass}
                          type="date"
                          value={intakeDraft.personalJson.birthDate ?? ""}
                          onChange={(e) =>
                            setIntakeDraft((prev) => ({ ...prev, personalJson: { ...prev.personalJson, birthDate: e.target.value } }))
                          }
                        />
                      </div>
                    </div>
                  </div>
                )}

                {intakeStep === 2 && (
                  <div className="space-y-4">
                    <h3 className="font-serif text-2xl text-velum-900">Historial médico</h3>
                    <p className="text-sm text-velum-600">
                      Esta información es confidencial y se usa para ajustar parámetros seguros de tratamiento.
                    </p>
                    <div className="space-y-3">
                      <div>
                        <label className={labelClass}>Alergias</label>
                        <textarea
                          className={fieldClass}
                          rows={3}
                          placeholder="Medicamentos, alimentos o contacto"
                          value={intakeDraft.historyJson.allergies ?? ""}
                          onChange={(e) =>
                            setIntakeDraft((prev) => ({ ...prev, historyJson: { ...prev.historyJson, allergies: e.target.value } }))
                          }
                        />
                      </div>
                      <div>
                        <label className={labelClass}>Medicamentos actuales</label>
                        <textarea
                          className={fieldClass}
                          rows={3}
                          placeholder="Nombre y dosis"
                          value={intakeDraft.historyJson.medications ?? ""}
                          onChange={(e) =>
                            setIntakeDraft((prev) => ({ ...prev, historyJson: { ...prev.historyJson, medications: e.target.value } }))
                          }
                        />
                      </div>
                      <div>
                        <label className={labelClass}>Condiciones de piel</label>
                        <textarea
                          className={fieldClass}
                          rows={3}
                          placeholder="Acné, dermatitis, sensibilidad, etc."
                          value={intakeDraft.historyJson.skinConditions ?? ""}
                          onChange={(e) =>
                            setIntakeDraft((prev) => ({ ...prev, historyJson: { ...prev.historyJson, skinConditions: e.target.value } }))
                          }
                        />
                      </div>
                    </div>
                  </div>
                )}

                {intakeStep === 3 && (() => {
                  const answered = DEFAULT_PHOTOTYPE_QUESTIONS.filter((q) => phototypeAnswers[q.id]).length;
                  const allDone = answered === DEFAULT_PHOTOTYPE_QUESTIONS.length;
                  const total = allDone
                    ? DEFAULT_PHOTOTYPE_QUESTIONS.reduce((s, q) => {
                        const opt = q.options.find((o) => o.id === phototypeAnswers[q.id]);
                        return s + (opt?.score ?? 0);
                      }, 0)
                    : null;
                  const result = total !== null ? getFototipo(total) : null;
                  return (
                    <div className="space-y-5">
                      <div>
                        <h3 className="font-serif text-2xl text-velum-900">Clasificación de fototipo</h3>
                        <p className="mt-1 text-sm text-velum-600">
                          Responde las siguientes preguntas para determinar tu fototipo Fitzpatrick.
                        </p>
                        <p className="mt-1 text-xs text-velum-500">{answered}/{DEFAULT_PHOTOTYPE_QUESTIONS.length} preguntas respondidas</p>
                      </div>

                      {DEFAULT_PHOTOTYPE_QUESTIONS.map((q) => (
                        <div key={q.id} className="rounded-2xl border border-velum-200 bg-white p-4">
                          <p className="mb-3 text-sm font-semibold text-velum-800">{q.title}</p>
                          <div className="space-y-2">
                            {q.options.map((opt) => {
                              const checked = phototypeAnswers[q.id] === opt.id;
                              return (
                                <label
                                  key={opt.id}
                                  className={`flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2 text-sm transition ${
                                    checked
                                      ? "border-velum-900 bg-velum-50 font-medium text-velum-900"
                                      : "border-velum-200 text-velum-700 hover:border-velum-400"
                                  }`}
                                >
                                  <input
                                    type="radio"
                                    name={q.id}
                                    value={opt.id}
                                    checked={checked}
                                    onChange={() => handlePhototypeAnswer(q.id, opt.id)}
                                    className="accent-velum-900"
                                  />
                                  {opt.label}
                                </label>
                              );
                            })}
                          </div>
                        </div>
                      ))}

                      {result && (
                        <div className="rounded-2xl border border-velum-300 bg-velum-50 p-4">
                          <p className="text-xs font-bold uppercase tracking-widest text-velum-500">Resultado</p>
                          <p className="mt-1 font-serif text-xl text-velum-900">Fototipo {result.phototype}</p>
                          <p className="mt-1 text-sm text-velum-600">{result.description}</p>
                        </div>
                      )}
                    </div>
                  );
                })()}

                {intakeStep === 4 && (
                  <div className="space-y-4">
                    <h3 className="font-serif text-2xl text-velum-900">Consentimiento informado</h3>
                    <div className="rounded-2xl border border-velum-200 bg-white p-4">
                      <label className="flex items-start gap-3 text-sm text-velum-700">
                        <input
                          type="checkbox"
                          checked={intakeDraft.consentAccepted}
                          onChange={(e) => setIntakeDraft((prev) => ({ ...prev, consentAccepted: e.target.checked }))}
                          className="mt-1 h-4 w-4 accent-velum-900"
                        />
                        <span>Declaro que la información es correcta y autorizo el tratamiento según valoración clínica.</span>
                      </label>
                    </div>
                    <div>
                      <label className={labelClass}>Nombre para firma</label>
                      <input
                        className={fieldClass}
                        placeholder="Nombre completo"
                        value={intakeDraft.signatureKey ?? ""}
                        onChange={(e) => setIntakeDraft((prev) => ({ ...prev, signatureKey: e.target.value }))}
                      />
                    </div>
                  </div>
                )}
              </div>

              {intakeError && (
                <p className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{intakeError}</p>
              )}

              <div className="mt-6 flex flex-col-reverse items-stretch justify-between gap-3 border-t border-velum-200 pt-5 sm:flex-row sm:items-center">
                <Button
                  variant="outline"
                  className="rounded-2xl"
                  onClick={() => setIntakeStep((prev) => Math.max(prev - 1, 1))}
                  disabled={intakeStep === 1 || isSavingIntake}
                >
                  Atrás
                </Button>

                {intakeStep < 4 ? (
                  <Button className="rounded-2xl" onClick={handleNextIntakeStep} isLoading={isSavingIntake}>
                    Guardar y continuar
                  </Button>
                ) : (
                  <Button className="rounded-2xl" onClick={handleSubmitIntake} isLoading={isSavingIntake}>
                    Enviar expediente
                  </Button>
                )}
              </div>

              {intake?.status && <p className="mt-4 text-xs text-velum-500">Estado actual: {intake.status}</p>}
            </div>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className={shellWrapperClass}>
      <section className={`${glassCardClass} p-6 sm:p-8`}>
        <header className="mb-6 flex flex-col justify-between gap-4 border-b border-velum-200 pb-5 sm:flex-row sm:items-end">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-velum-500">Agenda activa</p>
            <h1 className="mt-1 text-3xl font-serif italic text-velum-900">
              Agenda {appointmentType === "valuation" ? "de Valoración" : "Personal"}
            </h1>
            <p className="mt-2 text-sm font-light text-velum-600">Hola, {user?.name}. Selecciona fecha y horario para tu siguiente sesión.</p>
          </div>
          <Link to="/dashboard" className="text-xs font-bold uppercase tracking-widest text-velum-700 underline">
            Ir a Mi Cuenta
          </Link>
        </header>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* ── Calendario real ─────────────────────────────── */}
          <div className="rounded-3xl border border-velum-200 bg-white p-6">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-serif text-lg capitalize">{calendarMonthLabel}</h3>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    const d = new Date(calendarBase);
                    d.setMonth(d.getMonth() - 1);
                    d.setDate(1);
                    setCalendarBase(d);
                    setSelectedDate(null);
                    setDaySlots([]);
                    setSelectedSlot(null);
                  }}
                  className="rounded-full border border-velum-200 p-1.5 text-velum-600 hover:border-velum-500 hover:text-velum-900 transition"
                  aria-label="Mes anterior"
                >
                  <ChevronLeft size={18} />
                </button>
                <button
                  onClick={() => {
                    const d = new Date(calendarBase);
                    d.setMonth(d.getMonth() + 1);
                    d.setDate(1);
                    setCalendarBase(d);
                    setSelectedDate(null);
                    setDaySlots([]);
                    setSelectedSlot(null);
                  }}
                  className="rounded-full border border-velum-200 p-1.5 text-velum-600 hover:border-velum-500 hover:text-velum-900 transition"
                  aria-label="Mes siguiente"
                >
                  <ChevronRight size={18} />
                </button>
              </div>
            </div>
            <div className="mb-2 grid grid-cols-7 gap-1 text-center text-[10px] font-bold uppercase text-velum-400">
              {["D","L","M","M","J","V","S"].map((d, i) => <div key={i}>{d}</div>)}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {calendarDays.map((cell, i) => {
                if (!cell.date || !cell.dateKey) {
                  return <div key={i} />;
                }
                const isSelected = selectedDate === cell.dateKey;
                return (
                  <button
                    key={cell.dateKey}
                    disabled={!cell.selectable}
                    onClick={() => handleSelectDate(cell.dateKey!)}
                    className={`
                      aspect-square rounded-xl text-sm font-medium transition-colors duration-200
                      ${!cell.selectable
                        ? "cursor-not-allowed text-velum-300"
                        : isSelected
                          ? "bg-velum-900 text-white shadow-md"
                          : "text-velum-800 hover:bg-velum-100"}
                    `}
                  >
                    {cell.date.getDate()}
                  </button>
                );
              })}
            </div>
            <p className="mt-3 text-[11px] text-velum-400">
              Solo se muestran fechas disponibles para reservar.
            </p>
          </div>

          {/* ── Horarios del día seleccionado ───────────────── */}
          <div className="flex h-full flex-col rounded-3xl border border-velum-200 bg-white p-6">
            <h3 className="mb-4 font-serif text-lg">
              {selectedDate
                ? `Horarios — ${new Date(selectedDate + "T00:00:00").toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "long" })}`
                : "Horarios disponibles"}
            </h3>

            {!selectedDate && (
              <div className="flex flex-1 items-center justify-center rounded-2xl border border-dashed border-velum-300 bg-velum-50 p-8 text-center text-sm text-velum-400">
                <p>Selecciona un día en el calendario para ver los horarios disponibles.</p>
              </div>
            )}

            {selectedDate && isLoadingSlots && (
              <div className="flex flex-1 items-center justify-center rounded-2xl border border-dashed border-velum-200 bg-velum-50 p-8">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-velum-300 border-t-velum-900" />
              </div>
            )}

            {selectedDate && !isLoadingSlots && slotsError && (
              <div className="flex flex-1 items-center justify-center rounded-2xl border border-dashed border-velum-300 bg-velum-50 p-8 text-center text-sm text-velum-500">
                <p>{slotsError}</p>
              </div>
            )}

            {selectedDate && !isLoadingSlots && !slotsError && daySlots.length > 0 && (
              <div className="mb-4 grid grid-cols-3 gap-2">
                {daySlots.map((slot) => (
                  <button
                    key={slot.label}
                    disabled={!slot.available}
                    onClick={() => setSelectedSlot(slot)}
                    className={`
                      rounded-xl border py-2.5 text-sm font-medium transition-all duration-200
                      ${!slot.available
                        ? "cursor-not-allowed border-velum-100 bg-velum-50 text-velum-300 line-through"
                        : selectedSlot?.label === slot.label
                          ? "scale-105 border-velum-900 bg-velum-900 text-white shadow-md"
                          : "border-velum-200 text-velum-800 hover:border-velum-400 hover:bg-velum-50"}
                    `}
                  >
                    {slot.label}
                  </button>
                ))}
              </div>
            )}

            {/* Plan de interés */}
            {selectedSlot && (
              <div className="mt-5 border-t border-velum-100 pt-5">
                <p className="text-[10px] font-bold uppercase tracking-widest text-velum-500 mb-3">
                  Plan de interés <span className="text-velum-400 font-normal normal-case tracking-normal">(opcional)</span>
                </p>
                <div className="grid grid-cols-1 gap-1.5">
                  {MEMBERSHIPS.map((tier) => (
                    <button
                      key={tier.stripePriceId}
                      type="button"
                      onClick={() => setSelectedPlanCode(
                        selectedPlanCode === tier.stripePriceId ? null : tier.stripePriceId
                      )}
                      className={`flex items-center justify-between rounded-xl border px-3 py-2 text-left text-sm transition-all duration-150 ${
                        selectedPlanCode === tier.stripePriceId
                          ? "border-velum-900 bg-velum-900 text-white"
                          : "border-velum-200 text-velum-800 hover:border-velum-400 hover:bg-velum-50"
                      }`}
                    >
                      <span className="font-semibold">{tier.name}</span>
                      <span className={`text-xs ${selectedPlanCode === tier.stripePriceId ? "text-velum-300" : "text-velum-500"}`}>
                        ${tier.price.toLocaleString("es-MX")}/mes
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-auto border-t border-velum-100 pt-5">
              {selectedSlot && (
                <p className="mb-3 text-xs text-velum-600 text-center">
                  Seleccionado: <strong>{selectedSlot.label}</strong>
                  {selectedDate && ` — ${new Date(selectedDate + "T00:00:00").toLocaleDateString("es-MX", { day: "numeric", month: "short" })}`}
                </p>
              )}
              <Button
                className="w-full rounded-2xl"
                disabled={!selectedDate || !selectedSlot || isScheduling}
                isLoading={isScheduling}
                loadingLabel="Redirigiendo a pago..."
                onClick={handleSchedule}
              >
                Confirmar y pagar ${APPOINTMENT_DEPOSIT_MXN}
              </Button>
              <p className="mt-2 text-center text-[11px] text-velum-500">
                El depósito se descuenta de tu primera mensualidad.
              </p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};
