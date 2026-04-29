import React from "react";
import { CalendarSync, Link2Off, Link2 } from "lucide-react";
import { Button } from "../../components/ui";
import {
  GoogleCalendarIntegrationStatus,
  GoogleEventFormatMode
} from "../../services/googleCalendarIntegrationService";

type Props = {
  canManage: boolean;
  status: GoogleCalendarIntegrationStatus | null;
  isLoading: boolean;
  isSaving: boolean;
  message: { type: "ok" | "error"; text: string } | null;
  onConnect: () => void;
  onDisconnect: () => void;
  onChangeMode: (mode: GoogleEventFormatMode) => void;
};

const formatDateTime = (value: string | null) => {
  if (!value) {
    return "—";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "—";
  }

  return parsed.toLocaleString("es-MX", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
};

export const AgendaIntegrations: React.FC<Props> = ({
  canManage,
  status,
  isLoading,
  isSaving,
  message,
  onConnect,
  onDisconnect,
  onChangeMode
}) => {
  const connected = Boolean(status?.connected);

  return (
    <div className="bg-white border border-velum-200 p-5 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-widest text-velum-500">Configuración → Agenda → Integraciones</p>
          <h3 className="font-sans font-bold text-velum-900 text-lg tracking-tight mt-1 flex items-center gap-2">
            <CalendarSync size={18} /> Google Calendar
          </h3>
          <p className="text-xs text-velum-500 mt-1">
            Sincronización bidireccional de citas (VELUM ↔ Google) con control de privacidad.
          </p>
        </div>

        {connected ? (
          <Button
            variant="outline"
            size="sm"
            onClick={onDisconnect}
            isLoading={isSaving}
            className="gap-2"
            disabled={!canManage}
          >
            <Link2Off size={14} /> Desconectar
          </Button>
        ) : (
          <Button
            size="sm"
            onClick={onConnect}
            isLoading={isSaving || isLoading}
            className="gap-2"
            disabled={!canManage}
          >
            <Link2 size={14} /> Conectar
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3 text-sm">
        <div className="border border-velum-200 px-3 py-2">
          <p className="text-[10px] uppercase tracking-widest text-velum-500">Estado</p>
          <p className="mt-1 font-semibold text-velum-900">{connected ? "Conectado" : "No conectado"}</p>
        </div>
        <div className="border border-velum-200 px-3 py-2">
          <p className="text-[10px] uppercase tracking-widest text-velum-500">Cuenta</p>
          <p className="mt-1 font-semibold text-velum-900">{status?.email ?? "—"}</p>
        </div>
        <div className="border border-velum-200 px-3 py-2">
          <p className="text-[10px] uppercase tracking-widest text-velum-500">Última sincronización</p>
          <p className="mt-1 font-semibold text-velum-900">{formatDateTime(status?.lastSyncAt ?? null)}</p>
        </div>
        <div className="border border-velum-200 px-3 py-2">
          <p className="text-[10px] uppercase tracking-widest text-velum-500">Expiración watch</p>
          <p className="mt-1 font-semibold text-velum-900">{formatDateTime(status?.watchExpiration ?? null)}</p>
        </div>
      </div>

      <div className="max-w-sm">
        <label className="text-xs uppercase tracking-widest text-velum-600 block">
          Formato del evento
          <select
            value={status?.eventFormatMode ?? "complete"}
            onChange={(event) => onChangeMode(event.target.value as GoogleEventFormatMode)}
            className="mt-2 w-full border border-velum-300 bg-velum-50 px-3 py-2 text-sm"
            disabled={!connected || isSaving || !canManage}
          >
            <option value="complete">Completo (nombre + tratamiento + pago)</option>
            <option value="private">Privado (sin nombre / sin tratamiento)</option>
          </select>
        </label>
        {!canManage && (
          <p className="mt-2 text-xs text-velum-500">
            Solo administradores pueden cambiar esta integración.
          </p>
        )}
      </div>

      {message && (
        <div
          className={`text-xs border px-3 py-2 ${
            message.type === "ok"
              ? "bg-success-50 border-success-100 text-success-700"
              : "bg-danger-50 border-danger-100 text-danger-700"
          }`}
        >
          {message.text}
        </div>
      )}
    </div>
  );
};
