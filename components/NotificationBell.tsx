import React, { useState, useEffect, useRef } from 'react';
import { Bell, X, Check } from 'lucide-react';
import { notificationService, NotificationData } from '../services/notificationService';

export const NotificationBell: React.FC = () => {
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifications, setNotifications] = useState<NotificationData[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  // Fetch unread count on mount and periodically
  useEffect(() => {
    fetchUnreadCount();
    const interval = setInterval(fetchUnreadCount, 30000); // every 30s
    return () => clearInterval(interval);
  }, []);

  // Close panel on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [isOpen]);

  const fetchUnreadCount = async () => {
    try {
      const { count } = await notificationService.getUnreadCount();
      setUnreadCount(count);
    } catch { /* ignore */ }
  };

  const openPanel = async () => {
    setIsOpen(!isOpen);
    if (!isOpen) {
      setLoading(true);
      try {
        const data = await notificationService.getMyNotifications(15);
        setNotifications(data);
      } catch { /* ignore */ }
      finally { setLoading(false); }
    }
  };

  const handleMarkRead = async (id: string) => {
    await notificationService.markAsRead(id);
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, readAt: new Date().toISOString(), status: 'read' as const } : n));
    setUnreadCount(prev => Math.max(0, prev - 1));
  };

  const handleMarkAllRead = async () => {
    await notificationService.markAllAsRead();
    setNotifications(prev => prev.map(n => ({ ...n, readAt: new Date().toISOString(), status: 'read' as const })));
    setUnreadCount(0);
  };

  const timeAgo = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'ahora';
    if (mins < 60) return `${mins}m`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h`;
    return `${Math.floor(hrs / 24)}d`;
  };

  return (
    <div className="relative" ref={panelRef}>
      <button onClick={openPanel} className="relative p-2 text-velum-600 hover:text-velum-900 transition-colors">
        <Bell size={20} />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 bg-red-600 text-white text-[9px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 bg-white border border-velum-200 shadow-xl z-50 animate-fade-in">
          {/* Header */}
          <div className="flex justify-between items-center px-4 py-3 border-b border-velum-100">
            <span className="text-xs font-bold uppercase tracking-widest text-velum-700">Notificaciones</span>
            <div className="flex gap-2">
              {unreadCount > 0 && (
                <button onClick={handleMarkAllRead} className="text-[10px] text-velum-500 hover:text-velum-900">
                  <Check size={12} className="inline mr-0.5" />Marcar todas
                </button>
              )}
              <button onClick={() => setIsOpen(false)} className="text-velum-400 hover:text-velum-900">
                <X size={14} />
              </button>
            </div>
          </div>

          {/* Body */}
          <div className="max-h-80 overflow-y-auto">
            {loading ? (
              <div className="py-8 text-center text-velum-400 text-xs">Cargando...</div>
            ) : notifications.length === 0 ? (
              <div className="py-8 text-center text-velum-400 text-xs">Sin notificaciones</div>
            ) : (
              notifications.map(n => (
                <div
                  key={n.id}
                  className={`px-4 py-3 border-b border-velum-50 hover:bg-velum-50 cursor-pointer ${!n.readAt ? 'bg-blue-50/40' : ''}`}
                  onClick={() => !n.readAt && handleMarkRead(n.id)}
                >
                  <div className="flex justify-between items-start">
                    <p className="text-xs font-bold text-velum-900">{n.title}</p>
                    <span className="text-[10px] text-velum-400 whitespace-nowrap ml-2">{timeAgo(n.createdAt)}</span>
                  </div>
                  <p className="text-[11px] text-velum-600 mt-0.5 leading-snug">{n.body}</p>
                  {!n.readAt && (
                    <span className="inline-block w-1.5 h-1.5 bg-blue-500 rounded-full mt-1"></span>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};
