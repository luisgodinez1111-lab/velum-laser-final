import React, { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "../components/Button";
import { PasswordInput } from "../components/PasswordInput";
import { ChevronLeft, ChevronRight, Lock, User, Sparkles, Shield, FileText, Stethoscope, CircleCheck, KeyRound, Mail } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { clinicalService, MedicalIntake } from "../services/clinicalService";
import { AuthUser, authService } from "../services/authService";
import { useToast } from "../context/ToastContext";

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
const glassCardClass =
  "rounded-[28px] border border-velum-200/80 bg-white/95 shadow-[0_24px_80px_rgba(84,69,56,0.12)] backdrop-blur-sm";
const fieldClass =
  "w-full rounded-2xl border border-velum-300 bg-white px-4 py-3 text-sm text-velum-900 placeholder:text-velum-400 outline-none transition focus:border-velum-700 focus:ring-2 focus:ring-velum-200";
const labelClass = "mb-2 block text-[11px] font-bold uppercase tracking-[0.14em] text-velum-600";

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
        phototype: current.phototype,
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

  const handleNextIntakeStep = async () => {
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
      // Build startAt from dateKey + startMinute
      const [year, month, day] = selectedDate.split("-").map(Number);
      const startAt = new Date(year, month - 1, day, 0, selectedSlot.startMinute, 0, 0);
      const endAt = new Date(year, month - 1, day, 0, selectedSlot.endMinute, 0, 0);

      await clinicalService.createAppointment({
        startAt: startAt.toISOString(),
        endAt: endAt.toISOString(),
        reason: appointmentType === "valuation" ? "valuation" : "laser_session"
      });

      toast.success("¡Cita agendada! Te esperamos el " + startAt.toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "long" }) + " a las " + selectedSlot.label + ".");
      setSelectedDate(null);
      setSelectedSlot(null);
      setDaySlots([]);
    } catch (error: any) {
      toast.error(error?.message ?? "No se pudo agendar la cita.");
    } finally {
      setIsScheduling(false);
    }
  };

    const __guestMode = typeof window !== "undefined"
    ? new URLSearchParams((window.location.hash.split("?")[1] ?? "")).get("mode")
    : null;
  const __effectiveViewState: "intro" | "login" | "register" =
    !isAuthenticated && (__guestMode === "login" || __guestMode === "register" || __guestMode === "intro")
      ? (__guestMode as "intro" | "login" | "register")
      : viewState;

  if (!isAuthenticated && __effectiveViewState === "intro") {
    return (
      <div className={shellWrapperClass}>
        <section className={`${glassCardClass} relative overflow-hidden p-7 sm:p-10`}>
          <div className="pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full bg-velum-200/70 blur-3xl" />
          <div className="pointer-events-none absolute -left-12 bottom-0 h-44 w-44 rounded-full bg-velum-100 blur-2xl" />

          <header className="relative mb-8 text-center">
            <Lock className="mx-auto mb-4 text-velum-500" size={36} />
            <div className="mx-auto mb-3 inline-flex items-center gap-2 rounded-full border border-velum-200 bg-white/80 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-velum-500">
              <Shield size={12} />
              Sesión privada protegida
            </div>
            <h1 className="mt-2 font-serif text-4xl italic text-velum-900 sm:text-5xl">Acceso de pacientes</h1>
            <p className="mx-auto mt-3 max-w-xl text-sm font-light leading-relaxed text-velum-700 sm:text-base">
              Utiliza el mismo flujo premium para iniciar sesión, registrarte por primera vez y completar tu expediente médico.
            </p>
          </header>

          <div className="relative grid grid-cols-1 gap-4 md:grid-cols-2">
            <button
              type="button"
              onClick={() => setGuestViewState("login")}
              className="group rounded-3xl border border-velum-200 bg-white p-6 text-left shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:border-velum-700 hover:shadow-xl"
            >
              <User className="mb-4 text-velum-700 transition-transform duration-300 group-hover:scale-105" size={30} />
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-velum-500">Socio activo</p>
              <h3 className="mt-1 font-serif text-2xl text-velum-900">Iniciar sesión</h3>
              <p className="mt-2 text-sm text-velum-600">Accede a tu expediente y agenda en segundos.</p>
            </button>

            <button
              type="button"
              onClick={() => setGuestViewState("register")}
              className="group rounded-3xl border border-velum-900 bg-velum-900 p-6 text-left shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:bg-velum-800 hover:shadow-xl"
            >
              <Sparkles className="mb-4 text-velum-100 transition-transform duration-300 group-hover:scale-105" size={30} />
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-velum-300">Primera visita</p>
              <h3 className="mt-1 font-serif text-2xl text-velum-50">Crear cuenta</h3>
              <p className="mt-2 text-sm text-velum-200">Regístrate y comienza tu proceso clínico guiado.</p>
            </button>
          </div>
        </section>
      </div>
    );
  }

  if (!isAuthenticated && __effectiveViewState === "login") {
    return (
      <div className={shellWrapperClass}>
        <section className={`${glassCardClass} mx-auto w-full max-w-5xl overflow-hidden`}>
          <div className="grid lg:grid-cols-[0.9fr_1.1fr]">
            <aside className="relative border-b border-velum-200 bg-gradient-to-br from-velum-100 to-white p-7 sm:p-9 lg:border-b-0 lg:border-r">
              <div className="pointer-events-none absolute -right-16 bottom-0 h-40 w-40 rounded-full bg-velum-200/70 blur-2xl" />
              <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-velum-500">Acceso seguro</p>
              <h2 className="mt-2 font-serif text-3xl italic text-velum-900">Bienvenido de nuevo</h2>
              <p className="mt-3 text-sm text-velum-700">Tu historial clínico y agenda se cargan automáticamente al iniciar sesión.</p>

              <div className="mt-7 space-y-3 text-sm text-velum-700">
                <div className="flex items-center gap-3 rounded-2xl border border-velum-200 bg-white/80 px-3 py-2">
                  <Shield size={16} className="text-velum-600" />
                  Protección de sesión y datos clínicos
                </div>
                <div className="flex items-center gap-3 rounded-2xl border border-velum-200 bg-white/80 px-3 py-2">
                  <CircleCheck size={16} className="text-velum-600" />
                  Flujo continuo hacia expediente y agenda
                </div>
              </div>
            </aside>

            <div className="p-7 sm:p-10">
              <header className="mb-8 flex items-start justify-between gap-4">
                <button
                  type="button"
                  onClick={() => setGuestViewState("intro")}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-velum-200 text-velum-500 transition hover:border-velum-500 hover:text-velum-900"
                >
                  <ChevronLeft size={20} />
                </button>

                <div className="text-right">
                  <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-velum-500">Ingreso</p>
                  <p className="mt-1 text-xs text-velum-500">Verificación de credenciales</p>
                </div>
              </header>

              <form onSubmit={handleLoginSubmit} className="space-y-5">
                <div>
                  <label className={labelClass}>Correo electrónico</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className={fieldClass}
                    placeholder="ana.garcia@gmail.com"
                  />
                </div>
                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <label className={labelClass} style={{ margin: 0 }}>Contraseña</label>
                    <button
                      type="button"
                      onClick={() => {
                        setOtpEmail(email);
                        setOtpCode("");
                        setOtpMessage(null);
                        setOtpSuccess(false);
                        setViewState("forgot");
                      }}
                      className="text-[11px] font-semibold text-velum-600 underline underline-offset-2 hover:text-velum-900 transition"
                    >
                      ¿Olvidaste tu contraseña?
                    </button>
                  </div>
                  <PasswordInput
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    className={fieldClass}
                    placeholder="••••••••"
                  />
                </div>
                <Button type="submit" className="w-full rounded-2xl">
                  Entrar a la agenda
                </Button>
              </form>

              {appointmentMessage && (
                <p className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{appointmentMessage}</p>
              )}
            </div>
          </div>
        </section>
      </div>
    );
  }

  if (!isAuthenticated && __effectiveViewState === "register") {
    return (
      <div className={shellWrapperClass}>
        <section className={`${glassCardClass} mx-auto w-full max-w-5xl overflow-hidden`}>
          <div className="grid lg:grid-cols-[0.9fr_1.1fr]">
            <aside className="relative border-b border-velum-200 bg-gradient-to-br from-velum-100 to-white p-7 sm:p-9 lg:border-b-0 lg:border-r">
              <div className="pointer-events-none absolute -left-10 top-0 h-40 w-40 rounded-full bg-velum-200/60 blur-3xl" />
              <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-velum-500">Registro inicial</p>
              <h2 className="mt-2 font-serif text-3xl italic text-velum-900">Crear cuenta clínica</h2>
              <p className="mt-3 text-sm text-velum-700">Después del registro continuarás directo a tu expediente médico.</p>

              <div className="mt-7 space-y-3 text-sm text-velum-700">
                <div className="flex items-center gap-3 rounded-2xl border border-velum-200 bg-white/80 px-3 py-2">
                  <CircleCheck size={16} className="text-velum-600" />
                  Alta en menos de 1 minuto
                </div>
                <div className="flex items-center gap-3 rounded-2xl border border-velum-200 bg-white/80 px-3 py-2">
                  <FileText size={16} className="text-velum-600" />
                  Perfil conectado con expediente y consentimiento
                </div>
              </div>
            </aside>

            <div className="p-7 sm:p-10">
              <header className="mb-8 flex items-start justify-between gap-4">
                <button
                  type="button"
                  onClick={() => setGuestViewState("intro")}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-velum-200 text-velum-500 transition hover:border-velum-500 hover:text-velum-900"
                >
                  <ChevronLeft size={20} />
                </button>

                <div className="text-right">
                  <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-velum-500">Cuenta nueva</p>
                  <p className="mt-1 text-xs text-velum-500">Acceso de paciente</p>
                </div>
              </header>

              <form onSubmit={handleRegisterSubmit} className="space-y-5">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className={labelClass}>Nombre</label>
                    <input
                      type="text"
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      required
                      className={fieldClass}
                      placeholder="Ana"
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Apellido</label>
                    <input
                      type="text"
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      required
                      className={fieldClass}
                      placeholder="García"
                    />
                  </div>
                </div>
                <div>
                  <label className={labelClass}>Correo electrónico</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className={fieldClass}
                    placeholder="ana.garcia@gmail.com"
                  />
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className={labelClass}>Número celular</label>
                    <input
                      type="tel"
                      inputMode="tel"
                      autoComplete="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      required
                      className={fieldClass}
                      placeholder="+52 55 1234 5678"
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Fecha de nacimiento</label>
                    <input
                      type="date"
                      value={birthDate}
                      onChange={(e) => setBirthDate(e.target.value)}
                      required
                      max={new Date(new Date().setFullYear(new Date().getFullYear() - 18)).toISOString().split("T")[0]}
                      className={fieldClass}
                    />
                  </div>
                </div>

                <div>
                  <label className={labelClass}>Contraseña</label>
                  <PasswordInput
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    className={fieldClass}
                    placeholder="••••••••"
                  />
                  <div className="mt-3 rounded-2xl border border-velum-200 bg-velum-50/40 px-3 py-2">
                    <p className={`text-xs font-semibold ${registerPasswordStrengthClass}`}>Seguridad de contrasena: {registerPasswordStrength}</p>
                    <p className="mt-1 text-[11px] text-velum-600">Requisitos minimos de seguridad:</p>
                    <div className="mt-2 grid grid-cols-1 gap-1 text-[11px] sm:grid-cols-2">
                      <span className={registerPasswordChecks.length ? "text-green-700" : "text-velum-500"}>{registerPasswordChecks.length ? "✓" : "•"} 8+ caracteres</span>
                      <span className={registerPasswordChecks.upper ? "text-green-700" : "text-velum-500"}>{registerPasswordChecks.upper ? "✓" : "•"} 1 mayuscula</span>
                      <span className={registerPasswordChecks.lower ? "text-green-700" : "text-velum-500"}>{registerPasswordChecks.lower ? "✓" : "•"} 1 minuscula</span>
                      <span className={registerPasswordChecks.number ? "text-green-700" : "text-velum-500"}>{registerPasswordChecks.number ? "✓" : "•"} 1 numero</span>
                      <span className={registerPasswordChecks.special ? "text-green-700" : "text-velum-500"}>{registerPasswordChecks.special ? "✓" : "•"} 1 simbolo</span>
                    </div>
                  </div>

                </div>
                                <div>
                  <label className={labelClass}>Confirmar contrasena</label>
                  <PasswordInput
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    className={fieldClass}
                    placeholder="••••••••"
                  />
                </div>

<Button type="submit" className="w-full rounded-2xl">
                  Crear cuenta
                </Button>
              </form>

              {appointmentMessage && (
                <p className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{appointmentMessage}</p>
              )}
            </div>
          </div>
        </section>
      </div>
    );
  }

  // ── Olvidé mi contraseña: ingresar correo ─────────────────────────
  if (!isAuthenticated && viewState === "forgot") {
    return (
      <div className={shellWrapperClass}>
        <section className={`${glassCardClass} mx-auto w-full max-w-lg overflow-hidden`}>
          <div className="p-7 sm:p-10">
            <header className="mb-8 flex items-start justify-between gap-4">
              <button
                type="button"
                onClick={() => { setOtpMessage(null); setViewState("login"); }}
                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-velum-200 text-velum-500 transition hover:border-velum-500 hover:text-velum-900"
              >
                <ChevronLeft size={20} />
              </button>
              <div className="text-right">
                <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-velum-500">Recuperar acceso</p>
                <p className="mt-1 text-xs text-velum-500">Te enviaremos un código de 6 dígitos</p>
              </div>
            </header>

            <div className="mb-7 flex flex-col items-center gap-3 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full border border-velum-200 bg-velum-50">
                <KeyRound size={24} className="text-velum-700" />
              </div>
              <h2 className="font-serif text-2xl italic text-velum-900">Restablecer contraseña</h2>
              <p className="text-sm text-velum-600">Ingresa tu correo y te enviaremos un código para crear una nueva contraseña.</p>
            </div>

            <form onSubmit={handleForgotSubmit} className="space-y-5">
              <div>
                <label className={labelClass}>Correo electrónico</label>
                <input
                  type="email"
                  value={otpEmail}
                  onChange={(e) => setOtpEmail(e.target.value)}
                  required
                  className={fieldClass}
                  placeholder="ana.garcia@gmail.com"
                  autoFocus
                />
              </div>
              <Button type="submit" className="w-full rounded-2xl" disabled={isOtpLoading}>
                {isOtpLoading ? "Enviando..." : "Enviar código"}
              </Button>
            </form>

            {otpMessage && (
              <p className={`mt-4 rounded-xl border px-3 py-2 text-xs ${otpSuccess ? "border-green-200 bg-green-50 text-green-700" : "border-amber-200 bg-amber-50 text-amber-800"}`}>
                {otpMessage}
              </p>
            )}
          </div>
        </section>
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
      <div className={shellWrapperClass}>
        <section className={`${glassCardClass} mx-auto w-full max-w-lg overflow-hidden`}>
          <div className="p-7 sm:p-10">
            <header className="mb-8 flex items-start justify-between gap-4">
              <button
                type="button"
                onClick={() => { setOtpMessage(null); setViewState("forgot"); }}
                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-velum-200 text-velum-500 transition hover:border-velum-500 hover:text-velum-900"
              >
                <ChevronLeft size={20} />
              </button>
              <div className="text-right">
                <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-velum-500">Verificación</p>
                <p className="mt-1 text-xs text-velum-500">{otpEmail}</p>
              </div>
            </header>

            <div className="mb-7 flex flex-col items-center gap-3 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full border border-velum-200 bg-velum-50">
                <Mail size={24} className="text-velum-700" />
              </div>
              <h2 className="font-serif text-2xl italic text-velum-900">Ingresa el código</h2>
              <p className="text-sm text-velum-600">Revisa tu bandeja de entrada y escribe el código de 6 dígitos.</p>
            </div>

            <form onSubmit={handleResetPasswordSubmit} className="space-y-5">
              <div>
                <label className={labelClass}>Código de verificación</label>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="\d{6}"
                  maxLength={6}
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  required
                  className={`${fieldClass} text-center text-2xl font-bold tracking-[0.32em]`}
                  placeholder="• • • • • •"
                  autoFocus
                />
              </div>
              <div>
                <label className={labelClass}>Nueva contraseña</label>
                <PasswordInput
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  className={fieldClass}
                  placeholder="••••••••"
                />
                <div className="mt-2 rounded-2xl border border-velum-200 bg-velum-50/40 px-3 py-2">
                  <p className={`text-xs font-semibold ${newPasswordStrengthClass}`}>Seguridad: {newPasswordStrength}</p>
                  <div className="mt-1 grid grid-cols-2 gap-1 text-[11px]">
                    <span className={newPasswordChecks.length ? "text-green-700" : "text-velum-500"}>{newPasswordChecks.length ? "✓" : "•"} 8+ caracteres</span>
                    <span className={newPasswordChecks.upper ? "text-green-700" : "text-velum-500"}>{newPasswordChecks.upper ? "✓" : "•"} Mayúscula</span>
                    <span className={newPasswordChecks.lower ? "text-green-700" : "text-velum-500"}>{newPasswordChecks.lower ? "✓" : "•"} Minúscula</span>
                    <span className={newPasswordChecks.number ? "text-green-700" : "text-velum-500"}>{newPasswordChecks.number ? "✓" : "•"} Número</span>
                    <span className={newPasswordChecks.special ? "text-green-700" : "text-velum-500"}>{newPasswordChecks.special ? "✓" : "•"} Símbolo</span>
                  </div>
                </div>
              </div>
              <div>
                <label className={labelClass}>Confirmar nueva contraseña</label>
                <PasswordInput
                  value={confirmNewPassword}
                  onChange={(e) => setConfirmNewPassword(e.target.value)}
                  required
                  className={fieldClass}
                  placeholder="••••••••"
                />
              </div>
              <Button type="submit" className="w-full rounded-2xl" disabled={isOtpLoading || otpSuccess}>
                {isOtpLoading ? "Verificando..." : "Actualizar contraseña"}
              </Button>
            </form>

            {otpMessage && (
              <p className={`mt-4 rounded-xl border px-3 py-2 text-xs ${otpSuccess ? "border-green-200 bg-green-50 text-green-700" : "border-red-200 bg-red-50 text-red-700"}`}>
                {otpMessage}
              </p>
            )}

            <button
              type="button"
              onClick={() => { setOtpCode(""); setOtpMessage(null); setViewState("forgot"); }}
              className="mt-4 w-full text-center text-xs text-velum-500 underline underline-offset-2 hover:text-velum-900 transition"
            >
              Reenviar código
            </button>
          </div>
        </section>
      </div>
    );
  }

  // ── Verificación de correo post-registro ────────────────────────────
  if (isAuthenticated && viewState === "email-verify") {
    return (
      <div className={shellWrapperClass}>
        <section className={`${glassCardClass} mx-auto w-full max-w-lg overflow-hidden`}>
          <div className="p-7 sm:p-10">
            <div className="mb-7 flex flex-col items-center gap-3 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full border border-velum-200 bg-velum-50">
                <Mail size={24} className="text-velum-700" />
              </div>
              <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-velum-500">Activación de cuenta</p>
              <h2 className="font-serif text-2xl italic text-velum-900">Confirma tu correo</h2>
              <p className="text-sm text-velum-600 max-w-sm">
                Te enviamos un código de 6 dígitos a <strong>{email}</strong>. Ingrésalo para continuar con tu expediente.
              </p>
            </div>

            <form onSubmit={handleEmailVerifySubmit} className="space-y-5">
              <div>
                <label className={labelClass}>Código de verificación</label>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="\d{6}"
                  maxLength={6}
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  required
                  className={`${fieldClass} text-center text-2xl font-bold tracking-[0.32em]`}
                  placeholder="• • • • • •"
                  autoFocus
                />
              </div>
              <Button type="submit" className="w-full rounded-2xl" disabled={isOtpLoading || otpSuccess}>
                {isOtpLoading ? "Verificando..." : "Confirmar correo"}
              </Button>
            </form>

            {otpMessage && (
              <p className={`mt-4 rounded-xl border px-3 py-2 text-xs ${otpSuccess ? "border-green-200 bg-green-50 text-green-700" : "border-red-200 bg-red-50 text-red-700"}`}>
                {otpMessage}
              </p>
            )}

            <div className="mt-4 flex flex-col gap-2 text-center">
              <button
                type="button"
                onClick={handleResendVerificationEmail}
                disabled={isOtpLoading}
                className="text-xs text-velum-600 underline underline-offset-2 hover:text-velum-900 transition disabled:opacity-50"
              >
                {isOtpLoading ? "Enviando..." : "Reenviar código"}
              </button>
              <button
                type="button"
                onClick={() => { const pf = { fullName: `${firstName.trim()} ${lastName.trim()}`.trim(), phone: phone.trim(), birthDate }; setOtpCode(""); setOtpMessage(null); setPendingEmailVerify(false); refreshIntake(pf); }}
                className="text-xs text-velum-400 underline underline-offset-2 hover:text-velum-700 transition"
              >
                Omitir por ahora y continuar
              </button>
            </div>
          </div>
        </section>
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

                {intakeStep === 3 && (
                  <div className="space-y-4">
                    <h3 className="font-serif text-2xl text-velum-900">Fototipo (Fitzpatrick)</h3>
                    <p className="text-sm text-velum-600">Selecciona el fototipo identificado durante valoración clínica.</p>
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                      {[1, 2, 3, 4, 5, 6].map((value) => (
                        <button
                          key={value}
                          type="button"
                          onClick={() => setIntakeDraft((prev) => ({ ...prev, phototype: value }))}
                          className={`rounded-2xl border px-4 py-3 text-sm font-semibold transition ${
                            intakeDraft.phototype === value
                              ? "border-velum-900 bg-velum-900 text-white shadow-md"
                              : "border-velum-300 bg-white text-velum-700 hover:border-velum-500"
                          }`}
                        >
                          Tipo {value}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

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
                onClick={handleSchedule}
              >
                Confirmar cita
              </Button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};
