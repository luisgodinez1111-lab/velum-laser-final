import React, { useCallback, useEffect, useRef, useState } from "react";
import { Bell, Check, CheckCheck, Loader2 } from "lucide-react";
import { apiFetch } from "../services/apiClient";

type Notification = {
  id: string;
  type: string;
  title: string;
  body?: string;
  read: boolean;
  createdAt: string;
};

const POLL_INTERVAL_MS = 30_000;

const typeIcon: Record<string, string> = {
  custom_charge_created:   "💳",
  custom_charge_accepted:  "✅",
  custom_charge_paid:      "💰",
  appointment_booked:      "🗓️",
  appointment_confirmed:   "✔️",
  appointment_cancelled:   "❌",
  appointment_deposit_paid:"📅",
  membership_activated:    "⭐",
  membership_renewed:      "🔄",
  new_member:              "👤",
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
  const panelRef = useRef<HTMLDivElement>(null);

  // Poll unread count
  const fetchCount = useCallback(async () => {
    try {
      const data = await apiFetch<{ count: number }>("/v1/notifications/unread-count");
      setCount(data.count);
    } catch { /* silent */ }
  }, []);

  useEffect(() => {
    void fetchCount();
    const timer = setInterval(fetchCount, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [fetchCount]);

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
      try {
        const data = await apiFetch<{ items: Notification[]; unread: number }>("/v1/notifications?limit=30");
        setItems(data.items);
        setCount(data.unread);
      } catch { /* silent */ } finally {
        setLoading(false);
      }
    }
  };

  const markOne = async (id: string) => {
    try {
      await apiFetch(`/v1/notifications/${id}/read`, { method: "POST" });
      setItems((prev) => prev.map((n) => n.id === id ? { ...n, read: true } : n));
      setCount((c) => Math.max(0, c - 1));
    } catch { /* silent */ }
  };

  const markAll = async () => {
    try {
      await apiFetch("/v1/notifications/read-all", { method: "POST" });
      setItems((prev) => prev.map((n) => ({ ...n, read: true })));
      setCount(0);
    } catch { /* silent */ }
  };

  return (
    <div className="relative" ref={panelRef}>
      {/* Bell button */}
      <button
        onClick={openPanel}
        className="relative flex items-center justify-center w-9 h-9 rounded-full border border-velum-200 bg-white hover:border-velum-400 transition shadow-sm"
        aria-label="Notificaciones"
        aria-expanded={open}
      >
        <Bell size={16} className="text-velum-700" />
        {count > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-bold px-1 leading-none">
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
        <div className="absolute right-0 mt-2 w-80 sm:w-96 z-50 origin-top-right rounded-2xl border border-velum-200 bg-white shadow-xl ring-1 ring-black/5 flex flex-col max-h-[480px]">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-velum-100">
            <p className="text-[11px] font-bold uppercase tracking-widest text-velum-500">Notificaciones</p>
            {count > 0 && (
              <button
                onClick={markAll}
                className="flex items-center gap-1 text-[11px] text-velum-500 hover:text-velum-800 transition"
              >
                <CheckCheck size={13} />
                Marcar todas como leídas
              </button>
            )}
          </div>

          {/* Body */}
          <div className="overflow-y-auto flex-1">
            {loading ? (
              <div className="flex items-center justify-center py-10">
                <Loader2 size={20} className="animate-spin text-velum-300" />
              </div>
            ) : items.length === 0 ? (
              <div className="py-10 text-center">
                <Bell size={28} className="text-velum-200 mx-auto mb-2" />
                <p className="text-sm text-velum-400">Sin notificaciones</p>
              </div>
            ) : (
              <ul>
                {items.map((n) => (
                  <li
                    key={n.id}
                    className={`flex items-start gap-3 px-4 py-3 border-b border-velum-50 last:border-0 transition ${
                      n.read ? "bg-white" : "bg-amber-50/40"
                    }`}
                  >
                    <span className="text-lg leading-none mt-0.5 shrink-0">
                      {typeIcon[n.type] ?? "🔔"}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm leading-snug ${n.read ? "text-velum-600" : "text-velum-900 font-semibold"}`}>
                        {n.title}
                      </p>
                      {n.body && (
                        <p className="text-xs text-velum-400 mt-0.5 line-clamp-2">{n.body}</p>
                      )}
                      <p className="text-[10px] text-velum-300 mt-1">{timeAgo(n.createdAt)}</p>
                    </div>
                    {!n.read && (
                      <button
                        onClick={() => markOne(n.id)}
                        title="Marcar como leída"
                        className="shrink-0 p-1 rounded-lg text-velum-300 hover:text-velum-700 hover:bg-velum-100 transition"
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
