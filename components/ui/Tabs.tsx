import React, { createContext, useContext, useId, useRef, useState, useCallback, useEffect } from 'react';

// Tabs — sistema accesible siguiendo WAI-ARIA Tabs Pattern.
//
// Keyboard support (a11y crítico):
//   - ArrowLeft/ArrowRight: navegar entre tabs (con wrap-around)
//   - Home/End: primer/último tab
//   - Enter/Space: activar tab focuseado
//   - Tab: salta del tab activo al panel
//
// API:
//   <Tabs value={tab} onChange={setTab}>
//     <TabsList>
//       <TabsTrigger value="overview">Resumen</TabsTrigger>
//       <TabsTrigger value="history">Historial</TabsTrigger>
//     </TabsList>
//     <TabsContent value="overview">...</TabsContent>
//     <TabsContent value="history">...</TabsContent>
//   </Tabs>

interface TabsContextValue {
  value: string;
  onChange: (value: string) => void;
  baseId: string;
  registerTab: (value: string) => void;
  tabs: string[];
}

const TabsContext = createContext<TabsContextValue | null>(null);

const useTabsContext = (): TabsContextValue => {
  const ctx = useContext(TabsContext);
  if (!ctx) throw new Error('Tabs subcomponents must be inside <Tabs>');
  return ctx;
};

interface TabsProps {
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
  className?: string;
}

export const Tabs: React.FC<TabsProps> = ({ value, onChange, children, className = '' }) => {
  const baseId = useId();
  const tabsRef = useRef<string[]>([]);

  const registerTab = useCallback((tabValue: string) => {
    if (!tabsRef.current.includes(tabValue)) {
      tabsRef.current = [...tabsRef.current, tabValue];
    }
  }, []);

  return (
    <TabsContext.Provider
      value={{ value, onChange, baseId, registerTab, tabs: tabsRef.current }}
    >
      <div className={['flex flex-col', className].filter(Boolean).join(' ')}>{children}</div>
    </TabsContext.Provider>
  );
};

// ── TabsList ──────────────────────────────────────────────────────────────────
interface TabsListProps {
  children: React.ReactNode;
  className?: string;
  /** Estilo de la línea inferior. Default: underline. fullWidth distribuye los triggers. */
  variant?: 'underline' | 'pills' | 'segmented';
  fullWidth?: boolean;
}

export const TabsList: React.FC<TabsListProps> = ({
  children,
  className = '',
  variant = 'underline',
  fullWidth = false,
}) => {
  const variantClass: Record<NonNullable<TabsListProps['variant']>, string> = {
    underline:  'border-b border-velum-200 dark:border-velum-800 gap-1',
    pills:      'gap-1.5 p-1 bg-velum-100 dark:bg-velum-800/40 rounded-lg',
    segmented:  'border border-velum-200 dark:border-velum-800 rounded-lg overflow-hidden divide-x divide-velum-200 dark:divide-velum-800',
  };

  return (
    <div
      role="tablist"
      className={[
        'flex items-center',
        fullWidth ? 'w-full' : '',
        variantClass[variant],
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      data-variant={variant}
    >
      {children}
    </div>
  );
};

// ── TabsTrigger ──────────────────────────────────────────────────────────────
interface TabsTriggerProps {
  value: string;
  children: React.ReactNode;
  disabled?: boolean;
  /** Badge opcional al lado del label (ej: count de items). */
  badge?: React.ReactNode;
  className?: string;
}

export const TabsTrigger: React.FC<TabsTriggerProps> = ({
  value,
  children,
  disabled = false,
  badge,
  className = '',
}) => {
  const ctx = useTabsContext();
  const isActive = ctx.value === value;
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    ctx.registerTab(value);
  }, [ctx, value]);

  // Keyboard nav siguiendo WAI-ARIA Tabs Pattern
  const handleKeyDown = (e: React.KeyboardEvent) => {
    const tablist = triggerRef.current?.parentElement;
    if (!tablist) return;
    const tabs = Array.from(tablist.querySelectorAll<HTMLButtonElement>('[role="tab"]:not([disabled])'));
    const currentIndex = tabs.findIndex((t) => t === document.activeElement);
    if (currentIndex === -1) return;

    let nextIndex: number | null = null;
    switch (e.key) {
      case 'ArrowRight': nextIndex = (currentIndex + 1) % tabs.length; break;
      case 'ArrowLeft':  nextIndex = (currentIndex - 1 + tabs.length) % tabs.length; break;
      case 'Home':       nextIndex = 0; break;
      case 'End':        nextIndex = tabs.length - 1; break;
    }

    if (nextIndex !== null) {
      e.preventDefault();
      const next = tabs[nextIndex];
      next.focus();
      const nextValue = next.dataset.value;
      if (nextValue) ctx.onChange(nextValue);
    }
  };

  // Estilos según variant del padre — leídos del data-variant del tablist
  const tabId = `${ctx.baseId}-tab-${value}`;
  const panelId = `${ctx.baseId}-panel-${value}`;

  return (
    <button
      ref={triggerRef}
      role="tab"
      type="button"
      id={tabId}
      data-value={value}
      aria-selected={isActive}
      aria-controls={panelId}
      tabIndex={isActive ? 0 : -1}
      disabled={disabled}
      onClick={() => !disabled && ctx.onChange(value)}
      onKeyDown={handleKeyDown}
      className={[
        'group relative flex items-center gap-2 px-4 py-2.5',
        'text-[11px] font-bold uppercase tracking-widest',
        'transition-all duration-base ease-standard',
        'focus:outline-none focus-visible:shadow-focus rounded-sm',
        'disabled:opacity-40 disabled:cursor-not-allowed',
        // Base — variant-aware via data-variant del padre, manejado con CSS sibling
        // Para underline:
        'data-[variant=underline]:border-b-2 data-[variant=underline]:-mb-px',
        isActive
          ? 'text-velum-900 dark:text-velum-50 group-data-[variant=underline]:border-velum-900 dark:group-data-[variant=underline]:border-velum-50'
          : 'text-velum-500 hover:text-velum-900 dark:text-velum-400 dark:hover:text-velum-50',
        // Pills variant
        'group-data-[variant=pills]:rounded-md',
        isActive ? 'group-data-[variant=pills]:bg-white group-data-[variant=pills]:shadow-sm dark:group-data-[variant=pills]:bg-velum-700' : '',
        // Segmented variant
        isActive ? 'group-data-[variant=segmented]:bg-velum-900 group-data-[variant=segmented]:text-velum-50 dark:group-data-[variant=segmented]:bg-velum-50 dark:group-data-[variant=segmented]:text-velum-900' : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {children}
      {badge && <span className="ml-1">{badge}</span>}
    </button>
  );
};

// ── TabsContent ──────────────────────────────────────────────────────────────
interface TabsContentProps {
  value: string;
  children: React.ReactNode;
  className?: string;
  /** Lazy: solo renderiza cuando este tab se ha activado al menos una vez. */
  lazy?: boolean;
  /** Force mount: mantiene el panel en DOM siempre (útil para preservar form state). */
  forceMount?: boolean;
}

export const TabsContent: React.FC<TabsContentProps> = ({
  value,
  children,
  className = '',
  lazy = false,
  forceMount = false,
}) => {
  const ctx = useTabsContext();
  const isActive = ctx.value === value;
  const [hasBeenActive, setHasBeenActive] = useState(isActive);

  useEffect(() => {
    if (isActive) setHasBeenActive(true);
  }, [isActive]);

  const panelId = `${ctx.baseId}-panel-${value}`;
  const tabId = `${ctx.baseId}-tab-${value}`;

  // Render rules:
  //   - forceMount=true → siempre en DOM (form state preserved)
  //   - lazy=true       → solo después de la 1ra activación
  //   - default         → solo si está activo
  if (!forceMount && !isActive && (!lazy || !hasBeenActive)) return null;

  return (
    <div
      role="tabpanel"
      id={panelId}
      aria-labelledby={tabId}
      hidden={!isActive}
      tabIndex={0}
      className={[
        'pt-6 focus:outline-none',
        isActive ? 'animate-fade-in' : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {children}
    </div>
  );
};
