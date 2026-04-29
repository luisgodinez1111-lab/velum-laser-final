import React from 'react';
import { Link, useLocation } from 'react-router-dom';

// MobileBottomNav — barra de navegación inferior fija para móvil.
//
// Estándar enterprise: en móvil, la nav superior se aleja del thumb del usuario.
// Una bottom nav siempre visible reduce la fricción a 1 tap para las rutas
// principales. Patrón usado por Instagram, Twitter, Stripe Dashboard, etc.
//
// Decisiones:
// - Solo se monta en móvil (md:hidden) — desktop sigue con nav superior.
// - Active state: icon + label en velum-900, indicador top elegante.
// - Safe-area iOS: padding-bottom respeta env(safe-area-inset-bottom).
// - Items con badges opcionales (ej: notificaciones unread).
// - Renderiza Link de react-router-dom para SPA navigation.

export interface BottomNavItem {
  to: string;
  label: string;
  icon: React.ReactNode;
  /** Badge numérico opcional (ej: unread count). 0 oculta el badge. */
  badge?: number;
  /** Match exacto de path. Default: prefix match para sub-rutas. */
  exact?: boolean;
}

interface MobileBottomNavProps {
  items: BottomNavItem[];
  className?: string;
}

export const MobileBottomNav: React.FC<MobileBottomNavProps> = ({ items, className = '' }) => {
  const location = useLocation();

  const isActive = (item: BottomNavItem): boolean => {
    if (item.exact) return location.pathname === item.to;
    if (item.to === '/') return location.pathname === '/';
    return location.pathname.startsWith(item.to);
  };

  return (
    <nav
      role="navigation"
      aria-label="Navegación principal móvil"
      className={[
        // Fija abajo, solo móvil
        'fixed bottom-0 inset-x-0 z-40 md:hidden',
        // Glass effect + border top
        'bg-white/95 backdrop-blur-xl border-t border-velum-200',
        // Safe-area iOS
        'pb-safe',
        // Subtle shadow upward
        'shadow-[0_-4px_12px_-4px_rgb(0_0_0_/_0.06)]',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <ul
        className="grid items-stretch"
        style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}
      >
        {items.map((item) => {
          const active = isActive(item);
          return (
            <li key={item.to} className="flex">
              <Link
                to={item.to}
                aria-current={active ? 'page' : undefined}
                className={[
                  'group relative flex flex-1 flex-col items-center justify-center gap-1 px-1 py-2.5',
                  'transition-colors duration-base ease-standard',
                  'focus:outline-none focus-visible:bg-velum-50',
                  active ? 'text-velum-900' : 'text-velum-500 hover:text-velum-700',
                ].join(' ')}
              >
                {/* Active indicator top */}
                {active && (
                  <span
                    className="absolute top-0 left-1/2 -translate-x-1/2 h-0.5 w-8 rounded-b-full bg-velum-900 animate-fade-in-down"
                    aria-hidden="true"
                  />
                )}

                {/* Icon + badge */}
                <div className="relative">
                  <span
                    className={[
                      'transition-transform duration-base ease-standard inline-flex',
                      active ? 'scale-110' : 'group-hover:scale-105',
                    ].join(' ')}
                  >
                    {item.icon}
                  </span>
                  {item.badge !== undefined && item.badge > 0 && (
                    <span
                      aria-label={`${item.badge} notificaciones`}
                      className="absolute -top-1.5 -right-2 min-w-[16px] h-4 px-1 flex items-center justify-center rounded-full bg-danger-500 text-white text-[9px] font-bold leading-none ring-2 ring-white"
                    >
                      {item.badge > 99 ? '99+' : item.badge}
                    </span>
                  )}
                </div>

                {/* Label */}
                <span
                  className={[
                    'text-[10px] font-bold uppercase tracking-[0.12em] leading-none',
                    active ? 'opacity-100' : 'opacity-80',
                  ].join(' ')}
                >
                  {item.label}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
};
