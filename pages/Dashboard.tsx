import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  Calendar,
  CheckCircle,
  CreditCard,
  ExternalLink,
  FileText,
  KeyRound,
  Loader2,
  User,
  Zap,
  ClipboardList
} from "lucide-react";
import { Button } from "../components/Button";
import { SignaturePad } from "../components/SignaturePad";
import { useAuth } from "../context/AuthContext";
import { redirectToCustomerPortal } from "../services/stripeService";
import { documentService, memberService } from "../services/dataService";
import { LegalDocument, Member } from "../types";
import { clinicalService, SessionTreatment } from "../services/clinicalService";
import { useToast } from "../context/ToastContext";

type TabKey = "overview" | "citas" | "profile" | "security" | "records" | "historial" | "billing";

type MeProfile = {
  fullName: string;
  email: string;
  phone: string;
};

const asString = (v: unknown, fallback = ""): string => (typeof v === "string" ? v : fallback);

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

const AppointmentCard: React.FC<{ appt: import("../services/clinicalService").Appointment; past?: boolean }> = ({ appt, past }) => {
  const { label, cls } = apptStatusLabel(appt.status);
  const start = new Date(appt.startAt);
  const end = new Date(appt.endAt);
  return (
    <div className={`bg-white border rounded-2xl p-4 flex items-start justify-between gap-4 ${past ? "border-velum-100 opacity-80" : "border-velum-200"}`}>
      <div className="flex gap-4 items-start">
        <div className="shrink-0 w-12 text-center">
          <p className="text-xs text-velum-500 uppercase">{start.toLocaleDateString("es-MX", { month: "short" })}</p>
          <p className="text-2xl font-serif text-velum-900 leading-none">{start.getDate()}</p>
          <p className="text-xs text-velum-500">{start.getFullYear()}</p>
        </div>
        <div>
          <p className="font-semibold text-velum-900 text-sm">
            {start.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })}
            {" — "}
            {end.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })}
          </p>
          {appt.treatment && <p className="text-xs text-velum-600 mt-0.5">{appt.treatment.name}</p>}
          {appt.cabin && <p className="text-xs text-velum-500 mt-0.5">Cabina: {appt.cabin.name}</p>}
          {appt.canceledReason && <p className="text-xs text-red-600 mt-1">Motivo: {appt.canceledReason}</p>}
        </div>
      </div>
      <span className={`shrink-0 text-xs px-2 py-0.5 border rounded-full font-semibold ${cls}`}>{label}</span>
    </div>
  );
};

const getPasswordChecks = (value: string) => ({
  length: value.length >= 8,
  upper: /[A-Z]/.test(value),
  lower: /[a-z]/.test(value),
  number: /[0-9]/.test(value),
  special: /[^A-Za-z0-9]/.test(value)
});

const api = async (path: string, init?: RequestInit) => {
  const response = await fetch(path, {
    credentials: "include",
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {})
    }
  });

  let body: any = {};
  try {
    body = await response.json();
  } catch {
    body = {};
  }

  if (!response.ok) {
    throw new Error(asString(body?.message, `Error ${response.status}`));
  }

  return body;
};

export const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const { user, isAuthenticated, isLoading: isAuthLoading } = useAuth();
  const toast = useToast();

  const [activeTab, setActiveTab] = useState<TabKey>("overview");

  const [memberData, setMemberData] = useState<Member | null>(null);
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [sessions, setSessions] = useState<SessionTreatment[]>([]);
  const [isLoadingSessions, setIsLoadingSessions] = useState(false);
  const [appointments, setAppointments] = useState<import("../services/clinicalService").Appointment[]>([]);
  const [isLoadingAppointments, setIsLoadingAppointments] = useState(false);

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

  const passwordChecks = useMemo(() => getPasswordChecks(newPassword), [newPassword]);

  useEffect(() => {
    if (isAuthLoading) return;

    if (!isAuthenticated) {
      navigate("/agenda?mode=login", { replace: true });
      return;
    }

    const load = async () => {
      setIsLoadingData(true);
      try {
        if (user?.role === "member") {
          const data = await memberService.getById(user.id);
          setMemberData(data || null);
        }

        const me = await api("/api/v1/users/me/profile");
        setProfile({
          fullName: asString(me?.fullName),
          email: asString(me?.email, asString(user?.email)),
          phone: asString(me?.phone)
        });
      } catch (error) {
        console.error(error);
      } finally {
        setIsLoadingData(false);
      }

      setIsLoadingSessions(true);
      try {
        const sessionData = await clinicalService.getMySessions();
        setSessions(sessionData);
      } catch {
        setSessions([]);
      } finally {
        setIsLoadingSessions(false);
      }

      setIsLoadingAppointments(true);
      try {
        const apptData = await clinicalService.listMyAppointments();
        setAppointments(apptData);
      } catch {
        setAppointments([]);
      } finally {
        setIsLoadingAppointments(false);
      }
    };

    void load();
  }, [isAuthLoading, isAuthenticated, navigate, user?.email, user?.id, user?.role]);

  const handlePortalAccess = async () => {
    await redirectToCustomerPortal();
  };

  const initiateSigning = (doc: LegalDocument) => {
    setCurrentDocToSign(doc);
    setShowSignatureModal(true);
  };

  const handleSignatureSave = async (signatureData: string) => {
    if (!currentDocToSign || !user) return;
    try {
      await documentService.signDocument(currentDocToSign.id, signatureData);
      const updated = await memberService.getById(user.id);
      setMemberData(updated || null);
    } finally {
      setShowSignatureModal(false);
      setCurrentDocToSign(null);
    }
  };

  const handleSaveProfile = async () => {
    if (!profile.fullName.trim() || !profile.email.trim() || !profile.phone.trim()) {
      toast.warning("Nombre, correo y teléfono son obligatorios.");
      return;
    }

    setIsSavingProfile(true);
    try {
      const out = await api("/api/v1/users/me/profile", {
        method: "PUT",
        body: JSON.stringify({
          fullName: profile.fullName.trim(),
          email: profile.email.trim(),
          phone: profile.phone.trim()
        })
      });

      setProfile((prev) => ({
        ...prev,
        fullName: asString(out?.profile?.fullName, prev.fullName),
        email: asString(out?.profile?.email, prev.email),
        phone: asString(out?.profile?.phone, prev.phone)
      }));

      toast.success(asString(out?.message, "Perfil actualizado correctamente."));
    } catch (error: any) {
      toast.error(asString(error?.message, "No se pudo actualizar el perfil."));
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handleRequestWhatsappCode = async () => {
    if (!profile.phone.trim()) {
      toast.warning("Primero registra tu teléfono en la pestaña Perfil.");
      return;
    }

    setIsSendingCode(true);
    try {
      const out = await api("/api/v1/users/me/password/request-whatsapp-code", {
        method: "POST",
        body: JSON.stringify({ phone: profile.phone.trim() })
      });

      toast.info(asString(out?.message, "Código enviado por WhatsApp."));
    } catch (error: any) {
      toast.error(asString(error?.message, "No se pudo enviar el código."));
    } finally {
      setIsSendingCode(false);
    }
  };

  const handleChangePassword = async () => {
    if (!currentPassword || !newPassword || !confirmPassword || !whatsappCode) {
      toast.warning("Completa todos los campos: contraseña actual, nueva, confirmación y código.");
      return;
    }

    if (newPassword !== confirmPassword) {
      toast.warning("La confirmación de contraseña no coincide.");
      return;
    }

    const ok =
      passwordChecks.length &&
      passwordChecks.upper &&
      passwordChecks.lower &&
      passwordChecks.number &&
      passwordChecks.special;

    if (!ok) {
      toast.warning("La nueva contraseña no cumple la política de seguridad.");
      return;
    }

    setIsUpdatingPassword(true);
    try {
      const out = await api("/api/v1/users/me/password", {
        method: "POST",
        body: JSON.stringify({
          currentPassword,
          newPassword,
          whatsappCode
        })
      });

      toast.success(asString(out?.message, "Contraseña actualizada correctamente."));
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setWhatsappCode("");
    } catch (error: any) {
      toast.error(asString(error?.message, "No se pudo actualizar la contraseña."));
    } finally {
      setIsUpdatingPassword(false);
    }
  };

  if (isAuthLoading || (isAuthenticated && isLoadingData)) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="animate-spin text-velum-400" size={32} />
      </div>
    );
  }

  if (!isAuthenticated) return null;

  const documents = (memberData as any)?.clinical?.documents || [];
  const pendingDocs = documents.filter((d: any) => !d.signed).length;

  const upcomingAppointments = appointments.filter(
    (a) => (a.status === "scheduled" || a.status === "confirmed") && new Date(a.startAt) >= new Date()
  ).sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime());

  const pastAppointments = appointments.filter(
    (a) => a.status === "completed" || a.status === "canceled" || a.status === "no_show" ||
      ((a.status === "scheduled" || a.status === "confirmed") && new Date(a.startAt) < new Date())
  ).sort((a, b) => new Date(b.startAt).getTime() - new Date(a.startAt).getTime());

  const tabs: Array<{ key: TabKey; label: string }> = [
    { key: "overview", label: "Resumen" },
    { key: "citas", label: `Citas${appointments.length > 0 ? ` (${appointments.length})` : ""}` },
    { key: "profile", label: "Perfil" },
    { key: "security", label: "Seguridad" },
    { key: "records", label: "Expedientes" },
    { key: "historial", label: `Historial${sessions.length > 0 ? ` (${sessions.length})` : ""}` },
    { key: "billing", label: "Pagos" }
  ];

  return (
    <div className="max-w-5xl mx-auto px-4 py-10 animate-fade-in">
      <h1 className="text-3xl font-serif text-velum-900 mb-6">Panel del cliente</h1>

      <div className="mb-6 flex flex-wrap gap-2">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            className={`rounded-xl px-4 py-2 text-sm border transition ${
              activeTab === tab.key
                ? "bg-velum-900 text-white border-velum-900"
                : "bg-white text-velum-700 border-velum-300 hover:border-velum-500"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "overview" && (
        <div className="grid gap-6">
          <div className="bg-white border border-velum-200 rounded-2xl p-6 flex items-center gap-4">
            <div className="h-14 w-14 rounded-full bg-velum-100 flex items-center justify-center text-velum-700">
              <User size={28} />
            </div>
            <div>
              <p className="text-lg font-semibold text-velum-900">{profile.fullName || "Cliente Velum"}</p>
              <p className="text-sm text-velum-600">{profile.email || user?.email}</p>
              <p className="text-xs text-velum-500 mt-1">{profile.phone || "Sin telefono registrado"}</p>
            </div>
          </div>

          <div className="grid sm:grid-cols-3 gap-4">
            <div className="bg-white border border-velum-200 rounded-2xl p-5">
              <p className="text-xs uppercase tracking-wide text-velum-500">Próxima cita</p>
              {upcomingAppointments.length > 0 ? (
                <>
                  <p className="mt-2 text-lg font-semibold text-velum-900">
                    {new Date(upcomingAppointments[0].startAt).toLocaleDateString("es-MX", { weekday: "short", day: "numeric", month: "short" })}
                  </p>
                  <p className="mt-0.5 text-sm text-velum-600">
                    {new Date(upcomingAppointments[0].startAt).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })}
                    {upcomingAppointments[0].treatment ? ` — ${upcomingAppointments[0].treatment.name}` : ""}
                  </p>
                  <button onClick={() => setActiveTab("citas")} className="mt-2 text-xs text-velum-700 underline underline-offset-2">
                    Ver todas las citas
                  </button>
                </>
              ) : (
                <>
                  <p className="mt-2 text-sm font-semibold text-velum-900">Sin citas programadas</p>
                  <Link to="/agenda" className="mt-1 block text-xs text-velum-700 underline underline-offset-2">Agendar ahora</Link>
                </>
              )}
            </div>
            <div className="bg-white border border-velum-200 rounded-2xl p-5">
              <p className="text-xs uppercase tracking-wide text-velum-500">Sesiones completadas</p>
              <p className="mt-2 text-2xl font-semibold text-velum-900">{sessions.length}</p>
              <button onClick={() => setActiveTab("historial")} className="mt-1 text-xs text-velum-700 underline underline-offset-2">
                Ver historial
              </button>
            </div>
            <div className="bg-white border border-velum-200 rounded-2xl p-5">
              <p className="text-xs uppercase tracking-wide text-velum-500">Documentos</p>
              <p className="mt-2 text-2xl font-semibold text-velum-900">{pendingDocs} pendientes</p>
              <p className="mt-1 text-sm text-velum-600">Firma para mantener tu expediente completo.</p>
            </div>
          </div>

          <div className="bg-white border border-velum-200 rounded-2xl p-6">
            <div className="flex items-center gap-3 mb-3">
              <Calendar size={18} className="text-velum-700" />
              <p className="font-semibold text-velum-900">Accesos rapidos</p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link to="/agenda">
                <Button variant="outline">Ir a agenda</Button>
              </Link>
              <Button variant="outline" onClick={handlePortalAccess}>
                <ExternalLink size={14} className="mr-2" />
                Portal de cliente
              </Button>
            </div>
          </div>
        </div>
      )}

      {activeTab === "citas" && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Calendar size={18} className="text-velum-700" />
              <h2 className="font-serif text-xl text-velum-900">Mis citas</h2>
            </div>
            <Link to="/agenda">
              <Button variant="outline" size="sm">+ Nueva cita</Button>
            </Link>
          </div>

          {isLoadingAppointments && (
            <div className="flex justify-center py-10">
              <Loader2 className="animate-spin text-velum-400" size={24} />
            </div>
          )}

          {!isLoadingAppointments && upcomingAppointments.length > 0 && (
            <div>
              <p className="text-xs uppercase tracking-widest text-velum-500 mb-3">Próximas</p>
              <div className="space-y-3">
                {upcomingAppointments.map((appt) => (
                  <AppointmentCard key={appt.id} appt={appt} />
                ))}
              </div>
            </div>
          )}

          {!isLoadingAppointments && upcomingAppointments.length === 0 && (
            <div className="bg-white border border-velum-200 rounded-2xl p-8 text-center">
              <Calendar size={32} className="mx-auto mb-3 text-velum-300" />
              <p className="text-sm text-velum-600">No tienes citas programadas.</p>
              <Link to="/agenda" className="mt-3 inline-block">
                <Button size="sm">Agendar cita</Button>
              </Link>
            </div>
          )}

          {!isLoadingAppointments && pastAppointments.length > 0 && (
            <div>
              <p className="text-xs uppercase tracking-widest text-velum-500 mb-3">Historial de citas</p>
              <div className="space-y-2">
                {pastAppointments.slice(0, 10).map((appt) => (
                  <AppointmentCard key={appt.id} appt={appt} past />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === "profile" && (
        <div className="bg-white border border-velum-200 rounded-2xl p-6 space-y-4">
          <h2 className="font-serif text-xl text-velum-900">Informacion personal</h2>

          <div>
            <label className="mb-1 block text-xs uppercase tracking-wide text-velum-500">Nombre completo</label>
            <input
              className="w-full rounded-xl border border-velum-300 px-4 py-3 text-sm"
              value={profile.fullName}
              onChange={(e) => setProfile((p) => ({ ...p, fullName: e.target.value }))}
              placeholder="Nombre y apellido"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs uppercase tracking-wide text-velum-500">Correo</label>
            <input
              className="w-full rounded-xl border border-velum-300 px-4 py-3 text-sm"
              value={profile.email}
              onChange={(e) => setProfile((p) => ({ ...p, email: e.target.value }))}
              placeholder="correo@dominio.com"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs uppercase tracking-wide text-velum-500">Telefono</label>
            <input
              className="w-full rounded-xl border border-velum-300 px-4 py-3 text-sm"
              value={profile.phone}
              onChange={(e) => setProfile((p) => ({ ...p, phone: e.target.value }))}
              placeholder="+52 55 1234 5678"
            />
          </div>

          <Button onClick={handleSaveProfile} disabled={isSavingProfile}>
            {isSavingProfile ? "Guardando..." : "Guardar perfil"}
          </Button>
        </div>
      )}

      {activeTab === "security" && (
        <div className="bg-white border border-velum-200 rounded-2xl p-6 space-y-4">
          <h2 className="font-serif text-xl text-velum-900">Seguridad y contrasena</h2>

          <div className="rounded-xl border border-velum-200 bg-velum-50 p-4">
            <p className="text-sm text-velum-700 mb-2">
              Antes de cambiar contrasena debes solicitar un codigo por WhatsApp.
            </p>
            <Button variant="outline" onClick={handleRequestWhatsappCode} disabled={isSendingCode}>
              <KeyRound size={14} className="mr-2" />
              {isSendingCode ? "Enviando..." : "Enviar codigo por WhatsApp"}
            </Button>
          </div>

          <div>
            <label className="mb-1 block text-xs uppercase tracking-wide text-velum-500">Codigo de WhatsApp</label>
            <input
              className="w-full rounded-xl border border-velum-300 px-4 py-3 text-sm"
              value={whatsappCode}
              onChange={(e) => setWhatsappCode(e.target.value)}
              placeholder="6 digitos"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs uppercase tracking-wide text-velum-500">Contrasena actual</label>
            <input
              type="password"
              className="w-full rounded-xl border border-velum-300 px-4 py-3 text-sm"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
            />
          </div>

          <div>
            <label className="mb-1 block text-xs uppercase tracking-wide text-velum-500">Nueva contrasena</label>
            <input
              type="password"
              className="w-full rounded-xl border border-velum-300 px-4 py-3 text-sm"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
          </div>

          <div>
            <label className="mb-1 block text-xs uppercase tracking-wide text-velum-500">Confirmar contrasena</label>
            <input
              type="password"
              className="w-full rounded-xl border border-velum-300 px-4 py-3 text-sm"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
            <span className={passwordChecks.length ? "text-green-700" : "text-velum-500"}>8 caracteres</span>
            <span className={passwordChecks.upper ? "text-green-700" : "text-velum-500"}>1 mayuscula</span>
            <span className={passwordChecks.lower ? "text-green-700" : "text-velum-500"}>1 minuscula</span>
            <span className={passwordChecks.number ? "text-green-700" : "text-velum-500"}>1 numero</span>
            <span className={passwordChecks.special ? "text-green-700" : "text-velum-500"}>1 simbolo</span>
          </div>

          <Button onClick={handleChangePassword} disabled={isUpdatingPassword}>
            {isUpdatingPassword ? "Actualizando..." : "Cambiar contrasena"}
          </Button>
        </div>
      )}

      {activeTab === "records" && (
        <div className="bg-white border border-velum-200 rounded-2xl p-6 space-y-4">
          <h2 className="font-serif text-xl text-velum-900">Expedientes y documentos</h2>

          {pendingDocs > 0 && (
            <div className="rounded-xl border border-orange-200 bg-orange-50 p-4 flex items-start gap-3">
              <AlertTriangle className="text-orange-600 mt-0.5" size={18} />
              <p className="text-sm text-orange-800">
                Tienes {pendingDocs} documento(s) pendiente(s) de firma.
              </p>
            </div>
          )}

          <div className="space-y-2">
            {documents.length === 0 && <p className="text-sm text-velum-600">Aun no hay documentos cargados.</p>}
            {documents.map((doc: any) => (
              <div key={doc.id} className="flex items-center justify-between rounded-xl border border-velum-200 p-3">
                <div className="flex items-center gap-2">
                  <FileText size={16} className="text-velum-500" />
                  <span className="text-sm text-velum-800">{doc.title}</span>
                </div>
                {doc.signed ? (
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-green-700">
                    <CheckCircle size={12} /> Firmado
                  </span>
                ) : (
                  <Button size="sm" onClick={() => initiateSigning(doc)}>
                    Firmar
                  </Button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === "historial" && (
        <div className="bg-white border border-velum-200 rounded-2xl p-6 space-y-4">
          <div className="flex items-center gap-3">
            <ClipboardList size={18} className="text-velum-700" />
            <h2 className="font-serif text-xl text-velum-900">Historial de sesiones</h2>
          </div>

          {isLoadingSessions && (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="animate-spin text-velum-400" size={24} />
            </div>
          )}

          {!isLoadingSessions && sessions.length === 0 && (
            <div className="text-center py-10 text-velum-500">
              <Zap size={32} className="mx-auto mb-3 opacity-30" />
              <p className="text-sm">Aun no hay sesiones registradas.</p>
              <p className="text-xs mt-1">Tus sesiones de tratamiento aparecerán aquí una vez que el personal las registre.</p>
            </div>
          )}

          {!isLoadingSessions && sessions.length > 0 && (
            <div className="space-y-3">
              {sessions.map((session) => {
                const params = session.laserParametersJson as Record<string, unknown> | null;
                const dateStr = new Date(session.createdAt).toLocaleDateString("es-MX", { day: "2-digit", month: "long", year: "numeric" });
                return (
                  <div key={session.id} className="border border-velum-200 rounded-xl p-4 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-xs uppercase tracking-widest text-velum-500">{dateStr}</p>
                        {params?.zona && (
                          <p className="font-semibold text-velum-900 mt-0.5">{String(params.zona)}</p>
                        )}
                      </div>
                      <span className="text-xs px-2 py-0.5 border border-emerald-200 bg-emerald-50 text-emerald-700 rounded-full font-semibold shrink-0">
                        Completada
                      </span>
                    </div>

                    {params && Object.keys(params).length > 0 && (
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        {params.fluencia && (
                          <div className="bg-velum-50 rounded-lg p-2 text-center">
                            <p className="text-[10px] uppercase text-velum-500">Fluencia</p>
                            <p className="text-sm font-semibold text-velum-900 mt-0.5">{String(params.fluencia)}</p>
                          </div>
                        )}
                        {params.frecuencia && (
                          <div className="bg-velum-50 rounded-lg p-2 text-center">
                            <p className="text-[10px] uppercase text-velum-500">Frecuencia</p>
                            <p className="text-sm font-semibold text-velum-900 mt-0.5">{String(params.frecuencia)}</p>
                          </div>
                        )}
                        {params.spot && (
                          <div className="bg-velum-50 rounded-lg p-2 text-center">
                            <p className="text-[10px] uppercase text-velum-500">Spot</p>
                            <p className="text-sm font-semibold text-velum-900 mt-0.5">{String(params.spot)}</p>
                          </div>
                        )}
                        {params.passes && (
                          <div className="bg-velum-50 rounded-lg p-2 text-center">
                            <p className="text-[10px] uppercase text-velum-500">Pasadas</p>
                            <p className="text-sm font-semibold text-velum-900 mt-0.5">{String(params.passes)}</p>
                          </div>
                        )}
                      </div>
                    )}

                    {session.notes && (
                      <div>
                        <p className="text-[10px] uppercase text-velum-500 mb-1">Notas de la sesión</p>
                        <p className="text-sm text-velum-700">{session.notes}</p>
                      </div>
                    )}

                    {session.adverseEvents && (
                      <div className="bg-amber-50 border border-amber-200 rounded-lg p-2">
                        <p className="text-[10px] uppercase text-amber-600 mb-1">Eventos adversos registrados</p>
                        <p className="text-sm text-amber-800">{session.adverseEvents}</p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {activeTab === "billing" && (
        <div className="bg-white border border-velum-200 rounded-2xl p-6 space-y-4">
          <h2 className="font-serif text-xl text-velum-900">Facturacion y pagos</h2>
          <div className="rounded-xl border border-velum-200 p-4 flex items-start gap-3">
            <CreditCard className="text-velum-700 mt-0.5" size={18} />
            <div>
              <p className="text-sm text-velum-700">Administra metodos de pago, facturas y renovaciones.</p>
              <Button variant="outline" className="mt-3" onClick={handlePortalAccess}>
                <ExternalLink size={14} className="mr-2" />
                Portal de cliente
              </Button>
            </div>
          </div>
        </div>
      )}

      {showSignatureModal && currentDocToSign && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <SignaturePad
            title={`Firmar: ${currentDocToSign.title}`}
            onCancel={() => setShowSignatureModal(false)}
            onSave={handleSignatureSave}
          />
        </div>
      )}
    </div>
  );
};
