import React, { useEffect, useState } from "react";
import { Toast, useToast } from "../context/ToastContext";
import { CheckCircle, XCircle, AlertTriangle, Info, X } from "lucide-react";

// ── Configuración visual por tipo ─────────────────────────────────────
const CONFIG = {
  success: {
    icon: CheckCircle,
    bar: "bg-green-500",
    icon_class: "text-green-600",
    border: "border-green-200",
    bg: "bg-white",
  },
  error: {
    icon: XCircle,
    bar: "bg-red-500",
    icon_class: "text-red-600",
    border: "border-red-200",
    bg: "bg-white",
  },
  warning: {
    icon: AlertTriangle,
    bar: "bg-amber-400",
    icon_class: "text-amber-500",
    border: "border-amber-200",
    bg: "bg-white",
  },
  info: {
    icon: Info,
    bar: "bg-velum-700",
    icon_class: "text-velum-700",
    border: "border-velum-200",
    bg: "bg-white",
  },
} as const;

// ── Toast individual ──────────────────────────────────────────────────
const ToastItem: React.FC<{ toast: Toast }> = ({ toast }) => {
  const { dismiss } = useToast();
  const [visible, setVisible] = useState(false);

  // Slide-in al montar
  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 16);
    return () => clearTimeout(t);
  }, []);

  const cfg = CONFIG[toast.type];
  const Icon = cfg.icon;

  const handleDismiss = () => {
    setVisible(false);
    setTimeout(() => dismiss(toast.id), 300);
  };

  return (
    <div
      role="alert"
      aria-live="polite"
      className={`
        relative flex items-start gap-3 overflow-hidden rounded-2xl border shadow-lg
        px-4 py-3 pr-10 min-w-[280px] max-w-[360px]
        transition-all duration-300 ease-out
        ${cfg.bg} ${cfg.border}
        ${visible ? "translate-x-0 opacity-100" : "translate-x-8 opacity-0"}
      `}
    >
      {/* Barra de color izquierda */}
      <div className={`absolute left-0 top-0 h-full w-1 rounded-l-2xl ${cfg.bar}`} />

      {/* Ícono */}
      <Icon size={18} className={`mt-0.5 shrink-0 ${cfg.icon_class}`} />

      {/* Mensaje */}
      <p className="flex-1 text-sm leading-snug text-velum-900">{toast.message}</p>

      {/* Cerrar */}
      <button
        type="button"
        onClick={handleDismiss}
        aria-label="Cerrar notificación"
        className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full text-velum-400 transition hover:bg-velum-100 hover:text-velum-700"
      >
        <X size={13} />
      </button>

      {/* Barra de progreso */}
      <div
        className={`absolute bottom-0 left-0 h-0.5 ${cfg.bar} opacity-30`}
        style={{
          width: "100%",
          animation: `toast-progress ${toast.duration}ms linear forwards`,
        }}
      />
    </div>
  );
};

// ── Contenedor global (portal) ────────────────────────────────────────
export const ToastContainer: React.FC = () => {
  const { toasts } = useToast();

  return (
    <>
      {/* Keyframe CSS inyectado una sola vez */}
      <style>{`
        @keyframes toast-progress {
          from { width: 100%; }
          to   { width: 0%; }
        }
      `}</style>

      <div
        aria-label="Notificaciones"
        className="fixed bottom-5 right-5 z-[9999] flex flex-col items-end gap-2"
      >
        {toasts.map((t) => (
          <ToastItem key={t.id} toast={t} />
        ))}
      </div>
    </>
  );
};
