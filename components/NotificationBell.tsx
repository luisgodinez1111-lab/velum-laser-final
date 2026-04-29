import React, { useCallback, useEffect, useRef, useState } from "react";
import { Bell, Check, CheckCheck, AlertCircle, BellOff } from "lucide-react";
import { apiFetch, buildApiUrl } from "../services/apiClient";
import { EmptyState, Skeleton } from "./ui";

const SSE_BACKOFF_INITIAL_MS = 1_000;
const SSE_BACKOFF_MAX_MS = 30_000;

type Notification = {
  id: string;
  type: string;
  title: string;
  body?: string;
  read: boolean;
  createdAt: string;
};

const typeIcon: Record<string, string> = {
  custom_charge_created:    "💳",
  custom_charge_accepted:   "✅",
  custom_charge_paid:       "💰",
  appointment_booked:       "🗓️",
  appointment_confirmed:    "✔️",
  appointment_cancelled:    "❌",
  appointment_deposit_paid: "📅",
  membership_activated:     "⭐",
  membership_renewed:       "🔄",
  membership_past_due:      "⚠️",
  membership_renewing_soon: "🔔",
  new_member:               "👤",
  intake_approved:          "✅",
  intake_rejected:          "❌",
};

function timeAgo(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return "ahora";
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
}

export const NotificationBell: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState(0);
  const [items, setItems] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState(false);
  const [sseError, setSseError] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const sseFailCountRef = useRef(0);

  // SSE reconnection state
  const esRef             = useRef<EventSource | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const backoffRef        = useRef(SSE_BACKOFF_INITIAL_MS);
  const lastNotifAtRef    = useRef<string | null>(null);
  const unmountedRef      = useRef(false);

  // Poll unread count
  const fetchCount = useCallback(async () => {
    try {
      const data = await apiFetch<{ count: number }>("/v1/notifications/unread-count");
      setCount(data.count);
    } catch { /* silent */ }
  }, []);

  const connectSSE = useCallback(() => {
    if (unmountedRef.current) return;

    // Build URL with ?since= for catch-up on reconnect
    const since = lastNotifAtRef.current;
    const url = since
      ? buildApiUrl(`/v1/notifications/stream?since=${encodeURIComponent(since)}`)
      : buildApiUrl("/v1/notifications/stream");

    const es = new EventSource(url, { withCredentials: true });
    esRef.current = es;

    es.onopen = () => {
      // Connection established — reset backoff and error state
      backoffRef.current = SSE_BACKOFF_INITIAL_MS;
      sseFailCountRef.current = 0;
      setSseError(false);
    };

    es.onmessage = (event) => {
      try {
        const notification: Notification = JSON.parse(event.data as string);
        lastNotifAtRef.current = notification.createdAt;
        setItems((prev) => [notification, ...prev]);
        setCount((c) => c + 1);
      } catch {
        // heartbeat or SSE comment line — ignore
      }
    };

    es.onerror = () => {
      // Close the broken connection and schedule reconnect with exponential backoff
      es.close();
      esRef.current = null;
      if (unmountedRef.current) return;
      sseFailCountRef.current += 1;
      // Show persistent error after 3 failed reconnects
      if (sseFailCountRef.current >= 3) setSseError(true);
      const delay = backoffRef.current;
      backoffRef.current = Math.min(delay * 2, SSE_BACKOFF_MAX_MS);
      reconnectTimerRef.current = setTimeout(connectSSE, delay);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    unmountedRef.current = false;
    void fetchCount();
    connectSSE();

    return () => {
      unmountedRef.current = true;
      if (reconnectTimerRef.current !== null) clearTimeout(reconnectTimerRef.current);
      esRef.current?.close();
    };
  }, [fetchCount, connectSSE]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const openPanel = async () => {
    const next = !open;
    setOpen(next);
    if (next) {
      setLoading(true);
      setFetchError(false);
      try {
        const data = await apiFetch<{ items: Notification[]; unread: number }>("/v1/notifications?limit=30");
        setItems(data.items);
        setCount(data.unread);
      } catch {
        setFetchError(true);
      } finally {
        setLoading(false);
      }
    }
  };

  const markOne = async (id: string) => {
    // Optimistic update — revert on failure
    setItems((prev) => prev.map((n) => n.id === id ? { ...n, read: true } : n));
    setCount((c) => Math.max(0, c - 1));
    try {
      await apiFetch(`/v1/notifications/${id}/read`, { method: "POST" });
    } catch {
      // Revert on error
      setItems((prev) => prev.map((n) => n.id === id ? { ...n, read: false } : n));
      setCount((c) => c + 1);
    }
  };

  const markAll = async () => {
    // Optimistic update — revert on failure
    const prev = items.map((n) => ({ ...n }));
    const prevCount = count;
    setItems((p) => p.map((n) => ({ ...n, read: true })));
    setCount(0);
    try {
      await apiFetch("/v1/notifications/read-all", { method: "POST" });
    } catch {
      setItems(prev);
      setCount(prevCount);
    }
  };

  return (
    <div className="relative" ref={panelRef}>
      {/* Bell button */}
      <button
        onClick={openPanel}
        className={`group relative flex items-center justify-center w-9 h-9 rounded-full border bg-white shadow-sm transition-all duration-base ease-standard hover:border-velum-400 hover:shadow focus:outline-none focus-visible:shadow-focus active:scale-95 ${
          sseError ? "border-warning-500" : "border-velum-200"
        }`}
        aria-label={count > 0 ? `Notificaciones — ${count} sin leer` : "Notificaciones"}
        aria-expanded={open}
        title={sseError ? "Sin conexión en tiempo real — reintentando" : undefined}
      >
        <Bell size={16} className={`transition-transform duration-base ease-standard group-hover:scale-110 ${sseError ? "text-warning-500" : "text-velum-700"}`} />
        {count > 0 && (
          <span
            aria-live="polite"
            aria-atomic="true"
            className="absolute -top-1 -right-1 min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-danger-500 text-white text-[10px] font-bold px-1 leading-none ring-2 ring-white animate-scale-in"
          >
            {count > 99 ? "99+" : count}
          </span>
        )}
      </button>

      {/* Backdrop */}
      {open && (
        <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} aria-hidden="true" />
      )}

      {/* Panel */}
      {open && (
        <div className="absolute right-0 mt-2 w-80 sm:w-96 z-50 origin-top-right rounded-xl border border-velum-200 bg-white/95 backdrop-blur-md shadow-xl ring-1 ring-black/5 flex flex-col max-h-[480px] animate-scale-in">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-velum-100">
            <p className="text-[11px] font-bold uppercase tracking-widest text-velum-500">Notificaciones</p>
            {count > 0 && (
              <button
                onClick={markAll}
                className="group flex items-center gap-1.5 text-[11px] font-medium text-velum-500 hover:text-velum-900 transition-colors duration-base ease-standard focus:outline-none focus-visible:shadow-focus rounded px-1.5 py-0.5"
              >
                <CheckCheck size={13} className="transition-transform duration-base ease-standard group-hover:scale-110" />
                Marcar todas
              </button>
            )}
          </div>

          {/* Fetch error banner */}
          {fetchError && (
            <div className="px-4 py-2.5 bg-danger-50 border-b border-danger-100 text-xs text-danger-700 flex items-center gap-2">
              <AlertCircle size={12} className="shrink-0" />
              <span>No se pudieron cargar las notificaciones.</span>
            </div>
          )}

          {/* SSE error banner */}
          {sseError && (
            <div className="px-4 py-2.5 bg-warning-50 border-b border-warning-100 text-xs text-warning-700 flex items-center gap-2">
              <AlertCircle size={12} className="shrink-0" />
              <span>Sin tiempo real — reintentando…</span>
            </div>
          )}

          {/* Body */}
          <div className="overflow-y-auto flex-1">
            {loading ? (
              <div className="flex flex-col gap-3 p-4">
                {Array.from({ length: 3 }, (_, i) => (
                  <div key={i} className="flex items-start gap-3">
                    <Skeleton variant="circle" size={28} />
                    <div className="flex-1 flex flex-col gap-1.5">
                      <Skeleton height={12} width="70%" />
                      <Skeleton height={10} width="50%" />
                    </div>
                  </div>
                ))}
              </div>
            ) : items.length === 0 ? (
              <EmptyState
                icon={<BellOff />}
                title="Sin notificaciones"
                description="Te avisaremos aquí cuando haya algo nuevo."
                size="comfortable"
              />
            ) : (
              <ul>
                {items.map((n) => (
                  <li
                    key={n.id}
                    className={`group flex items-start gap-3 px-4 py-3 border-b border-velum-50 last:border-0 transition-colors duration-base ease-standard ${
                      n.read ? "bg-transparent hover:bg-velum-50" : "bg-velum-50/60 hover:bg-velum-100/60"
                    }`}
                  >
                    {/* Unread indicator dot */}
                    <span className="relative shrink-0 mt-1.5">
                      <span className="text-lg leading-none" aria-hidden="true">
                        {typeIcon[n.type] ?? "🔔"}
                      </span>
                      {!n.read && (
                        <span className="absolute -top-0.5 -left-0.5 w-2 h-2 rounded-full bg-danger-500 ring-2 ring-white" aria-hidden="true" />
                      )}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm leading-snug ${n.read ? "text-velum-600" : "text-velum-900 font-semibold"}`}>
                        {n.title}
                      </p>
                      {n.body && (
                        <p className="text-xs text-velum-500 mt-0.5 line-clamp-2 leading-relaxed">{n.body}</p>
                      )}
                      <p className="text-[10px] text-velum-400 mt-1.5 uppercase tracking-wider">{timeAgo(n.createdAt)}</p>
                    </div>
                    {!n.read && (
                      <button
                        onClick={() => markOne(n.id)}
                        aria-label="Marcar como leída"
                        title="Marcar como leída"
                        className="shrink-0 flex items-center justify-center h-7 w-7 rounded-full text-velum-400 opacity-0 group-hover:opacity-100 hover:text-velum-900 hover:bg-white transition-all duration-base ease-standard focus:outline-none focus-visible:shadow-focus focus-visible:opacity-100"
                      >
                        <Check size={13} />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
