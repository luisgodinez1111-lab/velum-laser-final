import React, { useEffect, useRef, useState, useCallback } from 'react';

// SectionNav — anchor nav horizontal sticky para pages largas con múltiples
// subsecciones. Cada item apunta a un id (un <SectionHeading id=...>). Al
// click hace smooth scroll al ancla; mientras se scrollea, el ítem activo
// se actualiza automáticamente vía IntersectionObserver.
//
// Decisiones:
// - Visible solo en md+ — en mobile el contenido suele ser corto y un nav
//   horizontal extra ocupa espacio. Si en el futuro se necesita en mobile,
//   un select sería mejor que tabs apretados.
// - sticky con offset top configurable (default 56px = altura de la top bar
//   admin para que se quede pegado debajo).
// - IntersectionObserver con rootMargin negativo arriba para activar el ítem
//   cuando su sección ocupa la franja superior visible.

export interface SectionNavItem {
  id: string;
  label: string;
  /** Icono opcional (lucide). */
  icon?: React.ReactNode;
}

interface SectionNavProps {
  items: SectionNavItem[];
  /** Distancia desde top al hacer scroll. Default 56px (altura admin top bar). */
  topOffset?: number;
  /** Aria label del nav. Default 'Subsecciones de la página'. */
  'aria-label'?: string;
  className?: string;
}

export const SectionNav: React.FC<SectionNavProps> = ({
  items,
  topOffset = 56,
  'aria-label': ariaLabel = 'Subsecciones de la página',
  className = '',
}) => {
  const [activeId, setActiveId] = useState<string | null>(items[0]?.id ?? null);
  // Guardamos referencia al observer para limpiar en cleanup.
  const observerRef = useRef<IntersectionObserver | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined' || !('IntersectionObserver' in window)) return;

    const elements = items
      .map((it) => document.getElementById(it.id))
      .filter((el): el is HTMLElement => el !== null);

    if (elements.length === 0) return;

    // rootMargin: -X% top hace que el ítem se "active" antes de llegar
    // exactamente al borde — UX más natural.
    const observer = new IntersectionObserver(
      (entries) => {
        // De los entries actualmente visibles, escoger el primero (más arriba).
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) {
          setActiveId(visible[0].target.id);
        }
      },
      {
        rootMargin: `-${topOffset + 16}px 0px -60% 0px`,
        threshold: 0,
      },
    );

    elements.forEach((el) => observer.observe(el));
    observerRef.current = observer;

    return () => {
      observer.disconnect();
      observerRef.current = null;
    };
  }, [items, topOffset]);

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLAnchorElement>, id: string) => {
      e.preventDefault();
      const el = document.getElementById(id);
      if (!el) return;
      // scroll-mt-20 en SectionHeading ya cubre el offset; aquí refinamos el
      // smooth scroll. Usamos `window.scrollTo` por consistencia con la app
      // (algunos contenedores admin tienen overflow-y-auto propio, pero el
      // patrón general aquí es scroll de window).
      const rect = el.getBoundingClientRect();
      const targetY = window.scrollY + rect.top - topOffset - 8;
      window.scrollTo({ top: targetY, behavior: 'smooth' });
      // Actualización optimista — el observer la confirmará después.
      setActiveId(id);
    },
    [topOffset],
  );

  if (items.length <= 1) return null;

  return (
    <nav
      aria-label={ariaLabel}
      style={{ top: topOffset }}
      className={[
        'hidden md:block sticky z-[15] -mx-1 px-1 py-2 bg-velum-50/85 backdrop-blur-sm border-b border-velum-100',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <ul className="flex items-center gap-1 overflow-x-auto scrollbar-none">
        {items.map((it) => {
          const active = activeId === it.id;
          return (
            <li key={it.id} className="shrink-0">
              <a
                href={`#${it.id}`}
                onClick={(e) => handleClick(e, it.id)}
                aria-current={active ? 'true' : undefined}
                className={[
                  'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors duration-fast',
                  'focus:outline-none focus-visible:shadow-focus',
                  active
                    ? 'bg-velum-900 text-velum-50'
                    : 'text-velum-600 hover:bg-velum-100 hover:text-velum-900',
                ].join(' ')}
              >
                {it.icon && (
                  <span aria-hidden="true" className="shrink-0">
                    {it.icon}
                  </span>
                )}
                {it.label}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
};
