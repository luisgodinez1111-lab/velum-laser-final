import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";

export type ToastType = "success" | "error" | "warning" | "info";

export interface Toast {
  id: string;
  type: ToastType;
  message: string;
  duration: number;
}

// Acciones (estables) y estado (toasts) van en contextos SEPARADOS: los
// consumidores que solo disparan toasts (useToast) no se re-renderizan cuando
// cambia la lista — solo ToastContainer (useToastState) lo hace. Antes un solo
// context con `toasts` re-renderizaba todas las páginas en cada toast.
interface ToastActions {
  success: (message: string, duration?: number) => void;
  error: (message: string, duration?: number) => void;
  warning: (message: string, duration?: number) => void;
  info: (message: string, duration?: number) => void;
  dismiss: (id: string) => void;
}

const ToastActionsContext = createContext<ToastActions | undefined>(undefined);
const ToastStateContext = createContext<Toast[] | undefined>(undefined);

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const dismiss = useCallback((id: string) => {
    clearTimeout(timers.current.get(id));
    timers.current.delete(id);
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const add = useCallback(
    (type: ToastType, message: string, duration = 4000) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      setToasts((prev) => [...prev.slice(-4), { id, type, message, duration }]);
      const timer = setTimeout(() => dismiss(id), duration);
      timers.current.set(id, timer);
    },
    [dismiss]
  );

  const success = useCallback((m: string, d?: number) => add("success", m, d), [add]);
  const error   = useCallback((m: string, d?: number) => add("error",   m, d), [add]);
  const warning = useCallback((m: string, d?: number) => add("warning", m, d), [add]);
  const info    = useCallback((m: string, d?: number) => add("info",    m, d), [add]);

  // Objeto de acciones con referencia estable durante toda la vida del provider.
  const actions = useMemo<ToastActions>(
    () => ({ success, error, warning, info, dismiss }),
    [success, error, warning, info, dismiss]
  );

  return (
    <ToastActionsContext.Provider value={actions}>
      <ToastStateContext.Provider value={toasts}>
        {children}
      </ToastStateContext.Provider>
    </ToastActionsContext.Provider>
  );
};

/** Acciones de toast (referencia estable — no re-renderiza al cambiar la lista). */
export const useToast = (): ToastActions => {
  const ctx = useContext(ToastActionsContext);
  if (!ctx) throw new Error("useToast must be used within a ToastProvider");
  return ctx;
};

/** Lista de toasts (solo la consume ToastContainer). */
export const useToastState = (): Toast[] => {
  const ctx = useContext(ToastStateContext);
  if (!ctx) throw new Error("useToastState must be used within a ToastProvider");
  return ctx;
};
