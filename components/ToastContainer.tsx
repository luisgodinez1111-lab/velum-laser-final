import React, { useEffect, useState } from "react";
import { Toast, useToast } from "../context/ToastContext";
import { CheckCircle2, XCircle, AlertTriangle, Info, X } from "lucide-react";

// ── Intent → tokens del design system ─────────────────────────────────────────
// Mapea cada tipo de toast a colores semánticos. Usa intent-50/500/700 (capa
// core) en lugar de hex literales o Tailwind palette generics (green/red/amber).
const CONFIG = {
  success: {
    icon: CheckCircle2,
    bar:  "bg-success-500",
    iconColor: "text-success-700",
    iconBg:    "bg-success-50",
    border:    "border-success-100",
  },
  error: {
    icon: XCircle,
    bar:  "bg-danger-500",
    iconColor: "text-danger-700",
    iconBg:    "bg-danger-50",
    border:    "border-danger-100",
  },
  warning: {
    icon: AlertTriangle,
    bar:  "bg-warning-500",
    iconColor: "text-warning-700",
    iconBg:    "bg-warning-50",
    border:    "border-warning-100",
  },
  info: {
    icon: Info,
    bar:  "bg-info-500",
    iconColor: "text-info-700",
    iconBg:    "bg-info-50",
    border:    "border-info-100",
  },
} as const;

// ── Toast individual ──────────────────────────────────────────────────────────
const ToastItem: React.FC<{ toast: Toast }> = ({ toast }) => {
  const { dismiss } = useToast();
  const [visible, setVisible] = useState(false);

  // Entrance: pequeño delay para que el browser pinte el estado inicial
  // (translate-x-8 opacity-0) antes de transicionar al final.
  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 16);
    return () => clearTimeout(t);
  }, []);

  const cfg = CONFIG[toast.type];
  const Icon = cfg.icon;

  const handleDismiss = () => {
    setVisible(false);
    setTimeout(() => dismiss(toast.id), 220);
  };

  return (
    <div
      role="status"
      className={`
        group relative flex items-start gap-3 overflow-hidden rounded-xl border shadow-lg
        bg-white/95 backdrop-blur-md
        px-4 py-3.5 pr-11 min-w-[300px] max-w-[380px]
        transition-all duration-base ease-decelerate
        ${cfg.border}
        ${visible ? "translate-x-0 opacity-100 scale-100" : "translate-x-6 opacity-0 scale-95"}
      `}
    >
      {/* Barra vertical accent izquierda */}
      <div className={`absolute left-0 top-0 h-full w-1 ${cfg.bar}`} aria-hidden="true" />

      {/* Icon container con halo del intent */}
      <div className={`mt-0.5 shrink-0 flex items-center justify-center h-8 w-8 rounded-full ${cfg.iconBg}`}>
        <Icon size={16} className={cfg.iconColor} aria-hidden="true" />
      </div>

      {/* Mensaje */}
      <p className="flex-1 text-sm leading-snug text-velum-900 font-medium pt-1">
        {toast.message}
      </p>

      {/* Cerrar */}
      <button
        type="button"
        onClick={handleDismiss}
        aria-label="Cerrar notificación"
        className="absolute right-2.5 top-2.5 flex h-7 w-7 items-center justify-center rounded-full text-velum-400 transition-all duration-base ease-standard hover:bg-velum-100 hover:text-velum-900 focus:outline-none focus-visible:shadow-focus active:scale-90"
      >
        <X size={14} />
      </button>

      {/* Barra de progreso animada */}
      <div
        className={`absolute bottom-0 left-0 h-[2px] ${cfg.bar} opacity-40`}
        style={{
          width: "100%",
          animation: `toast-progress ${toast.duration}ms linear forwards`,
        }}
        aria-hidden="true"
      />
    </div>
  );
};

// ── Contenedor global ─────────────────────────────────────────────────────────
export const ToastContainer: React.FC = () => {
  const { toasts } = useToast();

  return (
    <div
      aria-label="Notificaciones"
      aria-live="polite"
      aria-relevant="additions"
      // bottom-5 + safe area para iOS home indicator
      className="fixed bottom-5 right-5 z-[9999] flex flex-col items-end gap-2.5 pb-safe pointer-events-none"
    >
      {toasts.map((t) => (
        <div key={t.id} className="pointer-events-auto">
          <ToastItem toast={t} />
        </div>
      ))}
    </div>
  );
};
