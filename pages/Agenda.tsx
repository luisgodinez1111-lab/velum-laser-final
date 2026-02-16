import React, { useEffect, useMemo, useState } from "react";
import { Button } from "../components/Button";
import { ChevronLeft, ChevronRight, Lock, User, Sparkles } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { Link } from "react-router-dom";
import { clinicalService, MedicalIntake } from "../services/clinicalService";

type ViewState = "intro" | "login" | "register" | "intake" | "calendar";
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

export const Agenda: React.FC = () => {
  const { login, register, isAuthenticated, user } = useAuth();

  const [viewState, setViewState] = useState<ViewState>("intro");
  const [appointmentType] = useState<AppointmentType>("standard");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");

  const [intakeStep, setIntakeStep] = useState(1);
  const [intake, setIntake] = useState<MedicalIntake | null>(null);
  const [intakeDraft, setIntakeDraft] = useState<IntakeDraft>(emptyIntakeDraft);
  const [intakeError, setIntakeError] = useState<string | null>(null);
  const [isSavingIntake, setIsSavingIntake] = useState(false);

  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [appointmentMessage, setAppointmentMessage] = useState<string | null>(null);
  const [isScheduling, setIsScheduling] = useState(false);

  const days = Array.from({ length: 30 }, (_, i) => i + 1);
  const times = ["09:00", "10:00", "11:00", "12:00", "13:00", "15:00", "16:00", "17:00", "18:00", "19:00"];

  const refreshIntake = async () => {
    if (!isAuthenticated) {
      return;
    }

    try {
      const current = await clinicalService.getMyMedicalIntake();
      setIntake(current);
      setIntakeDraft({
        personalJson: (current.personalJson as IntakeDraft["personalJson"]) ?? {},
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
      setViewState("intake");
    }
  };

  useEffect(() => {
    if (isAuthenticated) {
      refreshIntake();
    }
  }, [isAuthenticated]);

  const calendarMonth = useMemo(() => {
    const now = new Date();
    return now.toLocaleDateString("es-MX", { month: "long", year: "numeric" });
  }, []);

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAppointmentMessage(null);
    try {
      await login(email, password);
      await refreshIntake();
    } catch {
      setAppointmentMessage("Credenciales incorrectas.");
    }
  };

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAppointmentMessage(null);
    try {
      await register({ email, password, firstName, lastName });
      await refreshIntake();
    } catch {
      setAppointmentMessage("No se pudo completar el registro.");
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
    if (!selectedDay || !selectedTime) {
      return;
    }

    setIsScheduling(true);
    setAppointmentMessage(null);

    try {
      const [hours, minutes] = selectedTime.split(":").map(Number);
      const startAt = new Date();
      startAt.setHours(0, 0, 0, 0);
      startAt.setDate(startAt.getDate() + (selectedDay - 1));
      startAt.setHours(hours, minutes, 0, 0);

      const endAt = new Date(startAt.getTime() + 45 * 60 * 1000);

      await clinicalService.createAppointment({
        startAt: startAt.toISOString(),
        endAt: endAt.toISOString(),
        reason: appointmentType === "valuation" ? "valuation" : "laser_session"
      });

      setAppointmentMessage("Cita agendada correctamente.");
      setSelectedDay(null);
      setSelectedTime(null);
    } catch (error: any) {
      setAppointmentMessage(error?.message ?? "No se pudo agendar la cita.");
    } finally {
      setIsScheduling(false);
    }
  };

  if (!isAuthenticated && viewState === "intro") {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center px-4 max-w-4xl mx-auto animate-fade-in">
        <div className="text-center mb-12">
          <Lock className="mx-auto mb-6 text-velum-400" size={48} />
          <h1 className="text-4xl font-serif text-velum-900 italic mb-4">Agenda Exclusiva</h1>
          <p className="text-velum-600 font-light max-w-md mx-auto">
            Accede a nuestro calendario para gestionar tus sesiones.
            Si es tu primera vez, regístrate para completar expediente clínico.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 w-full max-w-2xl">
          <div
            onClick={() => setViewState("login")}
            className="cursor-pointer group bg-white p-10 border border-velum-200 hover:border-velum-900 transition-all duration-300 text-center hover:shadow-xl"
          >
            <User className="mx-auto mb-6 text-velum-800 group-hover:scale-110 transition-transform" size={40} />
            <h3 className="font-serif text-2xl mb-2 text-velum-900">Soy Socio</h3>
            <p className="text-xs text-velum-500 uppercase tracking-widest mt-2">Iniciar Sesión</p>
          </div>

          <div
            onClick={() => setViewState("register")}
            className="cursor-pointer group bg-velum-900 p-10 border border-velum-900 hover:bg-velum-800 transition-all duration-300 text-center hover:shadow-xl"
          >
            <Sparkles className="mx-auto mb-6 text-velum-50 group-hover:scale-110 transition-transform" size={40} />
            <h3 className="font-serif text-2xl mb-2 text-velum-50">Primera Vez</h3>
            <p className="text-xs text-velum-300 uppercase tracking-widest mt-2">Registro de Valoración</p>
          </div>
        </div>
      </div>
    );
  }

  if (!isAuthenticated && viewState === "login") {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center px-4 animate-fade-in">
        <div className="w-full max-w-md bg-white p-8 border border-velum-200 shadow-sm relative">
          <button onClick={() => setViewState("intro")} className="absolute top-4 left-4 text-velum-400 hover:text-velum-900">
            <ChevronLeft size={24} />
          </button>
          <h2 className="font-serif text-2xl text-center mb-6 pt-4">Bienvenido de nuevo</h2>
          <form onSubmit={handleLoginSubmit} className="space-y-6">
            <div>
              <label className="block text-xs uppercase tracking-widest text-velum-600 mb-2">Correo Electrónico</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required className="w-full p-3 border border-velum-300 bg-velum-50 focus:border-velum-900 outline-none transition-colors" placeholder="ana.garcia@gmail.com" />
            </div>
            <div>
              <label className="block text-xs uppercase tracking-widest text-velum-600 mb-2">Contraseña</label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required className="w-full p-3 border border-velum-300 bg-velum-50 focus:border-velum-900 outline-none transition-colors" placeholder="hashed_secret_123" />
            </div>
            <Button type="submit" className="w-full">Entrar a la Agenda</Button>
          </form>
          {appointmentMessage && <p className="text-xs text-red-600 mt-4">{appointmentMessage}</p>}
        </div>
      </div>
    );
  }

  if (!isAuthenticated && viewState === "register") {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center px-4 animate-fade-in">
        <div className="w-full max-w-md bg-white p-8 border border-velum-200 shadow-sm relative">
          <button onClick={() => setViewState("intro")} className="absolute top-4 left-4 text-velum-400 hover:text-velum-900">
            <ChevronLeft size={24} />
          </button>
          <h2 className="font-serif text-2xl text-center mb-6 pt-4">Crear cuenta</h2>
          <form onSubmit={handleRegisterSubmit} className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs uppercase tracking-widest text-velum-600 mb-2">Nombre</label>
                <input type="text" value={firstName} onChange={(e) => setFirstName(e.target.value)} required className="w-full p-3 border border-velum-300 bg-velum-50 focus:border-velum-900 outline-none transition-colors" placeholder="Ana" />
              </div>
              <div>
                <label className="block text-xs uppercase tracking-widest text-velum-600 mb-2">Apellido</label>
                <input type="text" value={lastName} onChange={(e) => setLastName(e.target.value)} required className="w-full p-3 border border-velum-300 bg-velum-50 focus:border-velum-900 outline-none transition-colors" placeholder="García" />
              </div>
            </div>
            <div>
              <label className="block text-xs uppercase tracking-widest text-velum-600 mb-2">Correo Electrónico</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required className="w-full p-3 border border-velum-300 bg-velum-50 focus:border-velum-900 outline-none transition-colors" placeholder="ana.garcia@gmail.com" />
            </div>
            <div>
              <label className="block text-xs uppercase tracking-widest text-velum-600 mb-2">Contraseña</label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required className="w-full p-3 border border-velum-300 bg-velum-50 focus:border-velum-900 outline-none transition-colors" placeholder="••••••••" />
            </div>
            <Button type="submit" className="w-full">Crear cuenta</Button>
          </form>
          {appointmentMessage && <p className="text-xs text-red-600 mt-4">{appointmentMessage}</p>}
        </div>
      </div>
    );
  }

  if (viewState === "intake") {
    return (
      <div className="max-w-3xl mx-auto px-4 py-8 animate-fade-in">
        <h1 className="text-3xl font-serif italic text-velum-900 mb-2">Expediente Médico</h1>
        <p className="text-sm text-velum-600 mb-8">Paso {intakeStep} de 4. Debes completar y enviar para habilitar agenda.</p>

        <div className="bg-white border border-velum-200 shadow-sm p-6 space-y-6">
          {intakeStep === 1 && (
            <>
              <h3 className="font-serif text-xl">Datos personales</h3>
              <input
                className="w-full p-3 border border-velum-300"
                placeholder="Nombre completo"
                value={intakeDraft.personalJson.fullName ?? ""}
                onChange={(e) => setIntakeDraft((prev) => ({ ...prev, personalJson: { ...prev.personalJson, fullName: e.target.value } }))}
              />
              <input
                className="w-full p-3 border border-velum-300"
                placeholder="Teléfono"
                value={intakeDraft.personalJson.phone ?? ""}
                onChange={(e) => setIntakeDraft((prev) => ({ ...prev, personalJson: { ...prev.personalJson, phone: e.target.value } }))}
              />
              <input
                className="w-full p-3 border border-velum-300"
                type="date"
                value={intakeDraft.personalJson.birthDate ?? ""}
                onChange={(e) => setIntakeDraft((prev) => ({ ...prev, personalJson: { ...prev.personalJson, birthDate: e.target.value } }))}
              />
            </>
          )}

          {intakeStep === 2 && (
            <>
              <h3 className="font-serif text-xl">Historial clínico</h3>
              <textarea
                className="w-full p-3 border border-velum-300"
                placeholder="Alergias"
                value={intakeDraft.historyJson.allergies ?? ""}
                onChange={(e) => setIntakeDraft((prev) => ({ ...prev, historyJson: { ...prev.historyJson, allergies: e.target.value } }))}
              />
              <textarea
                className="w-full p-3 border border-velum-300"
                placeholder="Medicamentos actuales"
                value={intakeDraft.historyJson.medications ?? ""}
                onChange={(e) => setIntakeDraft((prev) => ({ ...prev, historyJson: { ...prev.historyJson, medications: e.target.value } }))}
              />
              <textarea
                className="w-full p-3 border border-velum-300"
                placeholder="Condiciones de piel"
                value={intakeDraft.historyJson.skinConditions ?? ""}
                onChange={(e) => setIntakeDraft((prev) => ({ ...prev, historyJson: { ...prev.historyJson, skinConditions: e.target.value } }))}
              />
            </>
          )}

          {intakeStep === 3 && (
            <>
              <h3 className="font-serif text-xl">Fototipo (Fitzpatrick)</h3>
              <div className="grid grid-cols-3 gap-3">
                {[1, 2, 3, 4, 5, 6].map((value) => (
                  <button
                    key={value}
                    onClick={() => setIntakeDraft((prev) => ({ ...prev, phototype: value }))}
                    className={`py-3 border ${intakeDraft.phototype === value ? "border-velum-900 bg-velum-900 text-white" : "border-velum-300"}`}
                  >
                    Tipo {value}
                  </button>
                ))}
              </div>
            </>
          )}

          {intakeStep === 4 && (
            <>
              <h3 className="font-serif text-xl">Consentimiento</h3>
              <label className="flex items-center gap-3 text-sm">
                <input
                  type="checkbox"
                  checked={intakeDraft.consentAccepted}
                  onChange={(e) => setIntakeDraft((prev) => ({ ...prev, consentAccepted: e.target.checked }))}
                />
                Declaro que la información es correcta y autorizo tratamiento.
              </label>
              <input
                className="w-full p-3 border border-velum-300"
                placeholder="Nombre para firma"
                value={intakeDraft.signatureKey ?? ""}
                onChange={(e) => setIntakeDraft((prev) => ({ ...prev, signatureKey: e.target.value }))}
              />
            </>
          )}

          {intakeError && <p className="text-xs text-red-600">{intakeError}</p>}

          <div className="flex justify-between items-center pt-4 border-t border-velum-100">
            <Button variant="outline" onClick={() => setIntakeStep((prev) => Math.max(prev - 1, 1))} disabled={intakeStep === 1 || isSavingIntake}>
              Atrás
            </Button>

            {intakeStep < 4 ? (
              <Button onClick={handleNextIntakeStep} isLoading={isSavingIntake}>
                Guardar y continuar
              </Button>
            ) : (
              <Button onClick={handleSubmitIntake} isLoading={isSavingIntake}>
                Enviar expediente
              </Button>
            )}
          </div>
        </div>

        {intake?.status && <p className="text-xs text-velum-500 mt-4">Estado actual: {intake.status}</p>}
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 animate-fade-in">
      <div className="flex justify-between items-end mb-10 border-b border-velum-100 pb-4">
        <div>
          <h1 className="text-3xl font-serif italic text-velum-900 mb-2">
            Agenda {appointmentType === "valuation" ? "de Valoración" : "Personal"}
          </h1>
          <p className="text-velum-600 font-light text-sm">
            Hola, {user?.name}. Gestiona tus próximas sesiones.
          </p>
        </div>
        <Link to="/dashboard" className="text-xs text-velum-900 font-bold underline mr-4">Ir a Mi Cuenta</Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
        <div className="bg-white p-6 border border-velum-200 shadow-sm">
          <div className="flex justify-between items-center mb-6">
            <h3 className="font-serif text-lg capitalize">{calendarMonth}</h3>
            <div className="flex gap-2">
              <button className="p-1 opacity-40 cursor-not-allowed"><ChevronLeft size={20} /></button>
              <button className="p-1 opacity-40 cursor-not-allowed"><ChevronRight size={20} /></button>
            </div>
          </div>
          <div className="grid grid-cols-7 gap-2 text-center text-sm mb-2 text-velum-400 font-bold uppercase text-[10px]">
            <div>D</div><div>L</div><div>M</div><div>M</div><div>J</div><div>V</div><div>S</div>
          </div>
          <div className="grid grid-cols-7 gap-2">
            {days.map((d) => (
              <button
                key={d}
                onClick={() => setSelectedDay(d)}
                className={`
                  aspect-square flex items-center justify-center text-sm transition-colors duration-200
                  ${selectedDay === d
                    ? "bg-velum-900 text-white shadow-md"
                    : "hover:bg-velum-100 text-velum-800"}
                `}
              >
                {d}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col h-full">
          <h3 className="font-serif text-lg mb-6">Horarios Disponibles {selectedDay ? `para +${selectedDay - 1} días` : ""}</h3>

          {!selectedDay ? (
            <div className="flex-1 flex items-center justify-center border border-dashed border-velum-300 bg-velum-50 text-velum-400 text-sm p-8 text-center">
              <p>Selecciona un día en el calendario para ver la disponibilidad.</p>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-3 mb-8">
              {times.map((t) => (
                <button
                  key={t}
                  onClick={() => setSelectedTime(t)}
                  className={`
                    py-2 border text-sm transition-all duration-200
                    ${selectedTime === t
                      ? "border-velum-900 bg-velum-900 text-white shadow-md transform scale-105"
                      : "border-velum-200 text-velum-800 hover:border-velum-400 hover:bg-velum-50"}
                  `}
                >
                  {t}
                </button>
              ))}
            </div>
          )}

          <div className="mt-auto pt-6 border-t border-velum-100">
            <Button className="w-full" disabled={!selectedDay || !selectedTime || isScheduling} isLoading={isScheduling} onClick={handleSchedule}>
              Confirmar Cita
            </Button>
            {appointmentMessage && <p className="text-xs mt-3 text-velum-700">{appointmentMessage}</p>}
          </div>
        </div>
      </div>
    </div>
  );
};
