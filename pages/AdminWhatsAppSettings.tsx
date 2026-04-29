import React, { useEffect, useState } from "react";
import { apiFetch } from "../services/apiClient";
import { Link } from "react-router-dom";
import { Button } from "../components/ui";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";

type ConfigState = {
  phoneNumberId: string;
  templateName: string;
  reminderTemplateName: string;
  paymentReminderTemplateName: string;
  templateLang: string;
  allowConsole: boolean;
  accessToken: string;
};

const asString = (v: unknown, fallback = ""): string => (typeof v === "string" ? v : fallback);

const api = (path: string, init?: RequestInit) =>
  apiFetch<any>(path.replace(/^\/api/, ""), init);

export const AdminWhatsAppSettings: React.FC<{ embedded?: boolean }> = ({ embedded = false }) => {
  const { isAuthenticated, isSessionLoading: isLoading, user } = useAuth();
  const toast = useToast();

  const [form, setForm] = useState<ConfigState>({
    phoneNumberId: "",
    templateName: "velum_otp_code",
    reminderTemplateName: "",
    paymentReminderTemplateName: "",
    templateLang: "es_MX",
    allowConsole: false,
    accessToken: ""
  });

  const [tokenMasked, setTokenMasked] = useState("");
  const [configured, setConfigured] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const [testPhone, setTestPhone] = useState("");
  const [testCode, setTestCode] = useState("123456");
  const [isTesting, setIsTesting] = useState(false);

  useEffect(() => {
    if (isLoading) return;
    if (!isAuthenticated || (user?.role !== "admin" && user?.role !== "system")) return;

    const load = async () => {
      try {
        const out = await api("/api/v1/admin/integrations/whatsapp");
        setConfigured(Boolean(out?.configured));
        setTokenMasked(asString(out?.accessTokenMasked));
        setForm((prev) => ({
          ...prev,
          phoneNumberId: asString(out?.phoneNumberId),
          templateName: asString(out?.templateName, "velum_otp_code"),
          reminderTemplateName: asString(out?.reminderTemplateName, ""),
          paymentReminderTemplateName: asString(out?.paymentReminderTemplateName, ""),
          templateLang: asString(out?.templateLang, "es_MX"),
          allowConsole: Boolean(out?.allowConsole),
          accessToken: ""
        }));
      } catch (e: any) {
        toast.error(asString(e?.message, "No se pudo cargar la configuración de WhatsApp"));
      }
    };

    void load();
  }, [isAuthenticated, isLoading, user?.role, embedded]);

  const save = async () => {
    setIsSaving(true);
    try {
      const payload: any = {
        phoneNumberId: form.phoneNumberId,
        templateName: form.templateName,
        reminderTemplateName: form.reminderTemplateName,
        paymentReminderTemplateName: form.paymentReminderTemplateName,
        templateLang: form.templateLang,
        allowConsole: form.allowConsole
      };
      if (form.accessToken.trim()) payload.accessToken = form.accessToken.trim();

      const out = await api("/api/v1/admin/integrations/whatsapp", {
        method: "PUT",
        body: JSON.stringify(payload)
      });

      setConfigured(Boolean(out?.configured));
      setTokenMasked(asString(out?.accessTokenMasked));
      setForm((prev) => ({ ...prev, accessToken: "" }));
      toast.success(asString(out?.message, "Configuración guardada"));
    } catch (e: any) {
      toast.error(asString(e?.message, "No se pudo guardar la configuración"));
    } finally {
      setIsSaving(false);
    }
  };

  const sendTest = async () => {
    if (!testPhone.trim()) {
      toast.warning("El teléfono de prueba es obligatorio");
      return;
    }

    setIsTesting(true);
    try {
      const out = await api("/api/v1/admin/integrations/whatsapp/test", {
        method: "POST",
        body: JSON.stringify({ to: testPhone.trim(), previewCode: testCode.trim() || "123456" })
      });
      toast.success(asString(out?.message, "Mensaje de prueba enviado"));
    } catch (e: any) {
      toast.error(asString(e?.message, "No se pudo enviar el mensaje de prueba"));
    } finally {
      setIsTesting(false);
    }
  };

  if (isLoading) {
    if (embedded) return <div className="space-y-4">{[1, 2].map((i) => <div key={i} className="h-24 bg-velum-100 rounded-2xl animate-pulse" />)}</div>;
    return <div className="max-w-5xl mx-auto px-4 py-10">Cargando...</div>;
  }
  if (!embedded && !isAuthenticated) return null;

  if (user?.role !== "admin" && user?.role !== "system") {
    if (embedded) return null;
    return (
      <div className="max-w-4xl mx-auto px-4 py-10">
        <h1 className="font-sans font-bold text-velum-900 text-2xl tracking-tight">Acceso denegado</h1>
        <p className="text-sm text-velum-600 mt-2">Solo admin/system puede configurar WhatsApp.</p>
      </div>
    );
  }

  const formContent = (
    <div className="space-y-6">
      {/* Status + config */}
      <div className="rounded-2xl border border-velum-200 bg-white p-6 space-y-4">
        <div className="flex items-center gap-3">
          <div className={`h-2.5 w-2.5 rounded-full ${configured ? "bg-success-500" : "bg-warning-500"}`} />
          <p className="text-sm text-velum-700">
            <strong>Estado:</strong> {configured ? "Configurado" : "Incompleto"}
            {tokenMasked && <span className="ml-1 text-velum-500">({tokenMasked})</span>}
          </p>
        </div>

        <div>
          <label className="mb-1 block text-xs uppercase tracking-wide text-velum-500">Access Token Meta</label>
          <input
            type="password"
            className="w-full rounded-xl border border-velum-200 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-velum-900/20 focus:border-velum-700 transition"
            value={form.accessToken}
            onChange={(e) => setForm((p) => ({ ...p, accessToken: e.target.value }))}
            placeholder={tokenMasked ? "Dejar vacío para conservar token actual" : "Pega token Meta"}
          />
        </div>

        <div>
          <label className="mb-1 block text-xs uppercase tracking-wide text-velum-500">Phone Number ID</label>
          <input
            className="w-full rounded-xl border border-velum-200 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-velum-900/20 focus:border-velum-700 transition"
            value={form.phoneNumberId}
            onChange={(e) => setForm((p) => ({ ...p, phoneNumberId: e.target.value }))}
            placeholder="1005308739334309"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="mb-1 block text-xs uppercase tracking-wide text-velum-500">Template OTP (código de acceso)</label>
            <input
              className="w-full rounded-xl border border-velum-200 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-velum-900/20 focus:border-velum-700 transition"
              value={form.templateName}
              onChange={(e) => setForm((p) => ({ ...p, templateName: e.target.value }))}
              placeholder="velum_otp_code"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs uppercase tracking-wide text-velum-500">Template recordatorio de cita</label>
            <input
              className="w-full rounded-xl border border-velum-200 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-velum-900/20 focus:border-velum-700 transition"
              value={form.reminderTemplateName}
              onChange={(e) => setForm((p) => ({ ...p, reminderTemplateName: e.target.value }))}
              placeholder="velum_appointment_reminder"
            />
            <p className="text-[10px] text-velum-400 mt-1">Parámetros: nombre, fecha, hora, tratamiento (opcional)</p>
          </div>
          <div>
            <label className="mb-1 block text-xs uppercase tracking-wide text-velum-500">Template recordatorio de pago</label>
            <input
              className="w-full rounded-xl border border-velum-200 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-velum-900/20 focus:border-velum-700 transition"
              value={form.paymentReminderTemplateName}
              onChange={(e) => setForm((p) => ({ ...p, paymentReminderTemplateName: e.target.value }))}
              placeholder="velum_payment_reminder"
            />
            <p className="text-[10px] text-velum-400 mt-1">Parámetros: nombre, monto, fecha de renovación</p>
          </div>
          <div>
            <label className="mb-1 block text-xs uppercase tracking-wide text-velum-500">Template Lang</label>
            <input
              className="w-full rounded-xl border border-velum-200 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-velum-900/20 focus:border-velum-700 transition"
              value={form.templateLang}
              onChange={(e) => setForm((p) => ({ ...p, templateLang: e.target.value }))}
              placeholder="es_MX"
            />
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm text-velum-700 cursor-pointer">
          <input
            type="checkbox"
            checked={form.allowConsole}
            onChange={(e) => setForm((p) => ({ ...p, allowConsole: e.target.checked }))}
          />
          Permitir fallback a consola (solo desarrollo)
        </label>

        <Button onClick={save} disabled={isSaving}>
          {isSaving ? "Guardando..." : "Guardar configuración"}
        </Button>
      </div>

      {/* Test send */}
      <div className="rounded-2xl border border-velum-200 bg-white p-6 space-y-4">
        <h3 className="font-sans font-bold text-velum-900 text-lg tracking-tight">Prueba de envío</h3>
        <p className="text-xs text-velum-500">
          Envía un mensaje de prueba al número indicado para verificar que la integración funciona.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="mb-1 block text-xs uppercase tracking-wide text-velum-500">Teléfono destino</label>
            <input
              className="w-full rounded-xl border border-velum-200 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-velum-900/20 focus:border-velum-700 transition"
              value={testPhone}
              onChange={(e) => setTestPhone(e.target.value)}
              placeholder="+52 614 494 7274"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs uppercase tracking-wide text-velum-500">Código de prueba</label>
            <input
              className="w-full rounded-xl border border-velum-200 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-velum-900/20 focus:border-velum-700 transition"
              value={testCode}
              onChange={(e) => setTestCode(e.target.value)}
              placeholder="123456"
            />
          </div>
        </div>

        <Button variant="outline" onClick={sendTest} disabled={isTesting || !configured}>
          {isTesting ? "Enviando..." : "Enviar mensaje de prueba"}
        </Button>

        {!configured && (
          <p className="text-xs text-warning-700">Guarda una configuración válida antes de enviar pruebas.</p>
        )}
      </div>
    </div>
  );

  if (embedded) {
    return formContent;
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-10">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="font-sans font-bold text-velum-900 text-3xl tracking-[-0.02em]">Configuración WhatsApp (Meta)</h1>
        <Link to="/admin">
          <Button variant="outline">Volver a Admin</Button>
        </Link>
      </div>
      {formContent}
    </div>
  );
};
