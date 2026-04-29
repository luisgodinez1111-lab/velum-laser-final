import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useMemo,
  useRef,
  useCallback,
} from 'react';
import { Search, CornerDownLeft, ArrowUp, ArrowDown } from 'lucide-react';

// CommandPalette — paleta tipo Cmd+K para navegación rápida y acciones globales.
//
// API en dos partes:
//
//   1. <CommandPaletteProvider>  → maneja estado open/close + hotkey global
//                                  (Cmd+K en Mac, Ctrl+K en Win/Linux).
//   2. <CommandPalette commands={...} /> → UI. Se monta una vez dentro del
//                                  provider. Recibe la lista de comandos
//                                  como prop (puede ser dinámica/derivada).
//
// Hook `useCommandPalette()` expone { open, close, toggle, isOpen } para
// abrirla/cerrarla desde botones u otros atajos.
//
// Filtrado: token-based AND (cada palabra del query debe aparecer en label,
// hint, group o keywords). No fuzzy match completo — más predecible y rápido
// para listas de 50-200 comandos típicas en panel admin.
//
// A11y:
//   - role="dialog" aria-modal en el contenedor
//   - role="listbox" en lista, role="option" + aria-selected en items
//   - flecha ↑↓ navega, Enter ejecuta, Esc cierra
//   - focus auto al input al abrir
//   - close en click backdrop
//
// El componente reutiliza el patrón visual del Modal (z-[60], backdrop
// velum-900/40 + blur, border velum-100, animate-scale-in).

export interface CommandItem {
  id: string;
  label: string;
  /** Texto secundario (subtítulo o contexto). Se muestra a la derecha. */
  hint?: string;
  /** Grupo visual. Items con mismo grupo se renderizan juntos. */
  group?: string;
  /** Icono lucide-react (componente). */
  icon?: React.ComponentType<{ size?: number | string; className?: string }>;
  /** Atajo a mostrar como kbd. Sólo display — no se registra. */
  shortcut?: string;
  /** Tokens adicionales para matching (sinónimos, IDs, etc.). */
  keywords?: string[];
  /** Acción al seleccionar. Si retorna Promise, se await antes de cerrar. */
  perform: () => void | Promise<void>;
}

// ── Provider + hook ─────────────────────────────────────────────────────────

interface CommandPaletteContextValue {
  open: () => void;
  close: () => void;
  toggle: () => void;
  isOpen: boolean;
}

const Ctx = createContext<CommandPaletteContextValue | undefined>(undefined);

export const CommandPaletteProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [isOpen, setIsOpen] = useState(false);

  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);
  const toggle = useCallback(() => setIsOpen((v) => !v), []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Cmd+K (Mac) / Ctrl+K (Win/Linux) toggle
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  return <Ctx.Provider value={{ open, close, toggle, isOpen }}>{children}</Ctx.Provider>;
};

export function useCommandPalette(): CommandPaletteContextValue {
  const ctx = useContext(Ctx);
  if (!ctx) {
    throw new Error('useCommandPalette debe usarse dentro de <CommandPaletteProvider>');
  }
  return ctx;
}

// ── UI ──────────────────────────────────────────────────────────────────────

interface CommandPaletteProps {
  commands: CommandItem[];
  placeholder?: string;
  emptyText?: string;
  /** Footer label (branding sutil). Default 'VELUM Command'. */
  footerLabel?: string;
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({
  commands,
  placeholder = 'Buscar comandos, pacientes, secciones...',
  emptyText = 'Sin resultados',
  footerLabel = 'VELUM Command',
}) => {
  const { isOpen, close } = useCommandPalette();
  const [query, setQuery] = useState('');
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Filtrado token-AND. Vacío = todos.
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands;
    const tokens = q.split(/\s+/).filter(Boolean);
    return commands.filter((c) => {
      const haystack = [c.label, c.hint ?? '', c.group ?? '', ...(c.keywords ?? [])]
        .join(' ')
        .toLowerCase();
      return tokens.every((t) => haystack.includes(t));
    });
  }, [commands, query]);

  // Agrupado para render. Mantiene orden de aparición de cada grupo.
  const grouped = useMemo(() => {
    const map = new Map<string, CommandItem[]>();
    for (const c of filtered) {
      const g = c.group ?? 'General';
      if (!map.has(g)) map.set(g, []);
      map.get(g)!.push(c);
    }
    return Array.from(map.entries());
  }, [filtered]);

  // Reset al abrir + foco al input.
  useEffect(() => {
    if (!isOpen) return;
    setQuery('');
    setActiveIdx(0);
    // setTimeout para esperar el paint del modal antes de enfocar.
    const t = setTimeout(() => inputRef.current?.focus(), 0);
    return () => clearTimeout(t);
  }, [isOpen]);

  // Reset índice activo cuando cambia el filtro.
  useEffect(() => {
    setActiveIdx(0);
  }, [query]);

  // Body scroll lock mientras está abierto.
  useEffect(() => {
    if (!isOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [isOpen]);

  // Mantiene el item activo a la vista.
  useEffect(() => {
    if (!isOpen) return;
    const el = listRef.current?.querySelector<HTMLElement>(`[data-idx="${activeIdx}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [activeIdx, isOpen]);

  const exec = useCallback(
    async (cmd: CommandItem) => {
      close();
      try {
        await cmd.perform();
      } catch (err) {
        // No reabrimos el palette en error — la sección destino se hace cargo
        // del feedback (toast/etc.). Logueamos para debugging.
        console.error('[CommandPalette] perform failed:', err);
      }
    },
    [close],
  );

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIdx((i) => Math.min(filtered.length - 1, i + 1));
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx((i) => Math.max(0, i - 1));
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      const cmd = filtered[activeIdx];
      if (cmd) void exec(cmd);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Paleta de comandos"
      className="fixed inset-0 z-[60] flex items-start justify-center pt-[12vh] px-4 animate-fade"
    >
      {/* Backdrop — click cierra */}
      <div
        className="absolute inset-0 bg-velum-900/40 dark:bg-black/70 backdrop-blur-sm"
        aria-hidden="true"
        onClick={close}
      />

      {/* Panel */}
      <div className="relative w-full max-w-xl bg-white dark:bg-velum-900 rounded-xl shadow-xl border border-velum-100 dark:border-velum-800 overflow-hidden animate-scale-in">
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 border-b border-velum-100 dark:border-velum-800">
          <Search size={16} className="text-velum-400 shrink-0" aria-hidden="true" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={placeholder}
            aria-label="Buscar"
            aria-autocomplete="list"
            aria-controls="command-palette-listbox"
            className="flex-1 py-3.5 bg-transparent text-velum-900 dark:text-velum-50 placeholder:text-velum-400 dark:placeholder:text-velum-500 text-sm outline-none"
          />
          <kbd className="hidden sm:inline-flex items-center px-2 h-6 rounded text-[10px] font-mono font-bold uppercase tracking-wide text-velum-500 dark:text-velum-400 bg-velum-50 dark:bg-velum-800 border border-velum-200 dark:border-velum-700">
            esc
          </kbd>
        </div>

        {/* Resultados */}
        <div
          ref={listRef}
          id="command-palette-listbox"
          role="listbox"
          aria-label="Comandos disponibles"
          className="max-h-[50vh] overflow-y-auto py-2"
        >
          {filtered.length === 0 ? (
            <p className="px-4 py-8 text-sm text-center text-velum-500 dark:text-velum-400">{emptyText}</p>
          ) : (
            grouped.map(([group, items]) => (
              <div key={group} className="mb-1 last:mb-0">
                <p className="px-4 py-1 text-[10px] font-bold uppercase tracking-widest text-velum-400 dark:text-velum-500">
                  {group}
                </p>
                <ul>
                  {items.map((c) => {
                    const flatIdx = filtered.indexOf(c);
                    const active = flatIdx === activeIdx;
                    const Icon = c.icon;
                    return (
                      <li key={c.id}>
                        <button
                          type="button"
                          role="option"
                          aria-selected={active}
                          data-idx={flatIdx}
                          onMouseEnter={() => setActiveIdx(flatIdx)}
                          onClick={() => void exec(c)}
                          className={[
                            'w-full flex items-center gap-3 px-4 py-2.5 text-left text-sm transition-colors duration-fast',
                            active
                              ? 'bg-velum-100 text-velum-900 dark:bg-velum-800 dark:text-velum-50'
                              : 'text-velum-700 hover:bg-velum-50 dark:text-velum-300 dark:hover:bg-velum-800/40',
                          ].join(' ')}
                        >
                          {Icon && (
                            <Icon
                              size={16}
                              className="shrink-0 text-velum-500 dark:text-velum-400"
                            />
                          )}
                          <span className="flex-1 truncate">{c.label}</span>
                          {c.hint && (
                            <span className="hidden sm:inline text-xs text-velum-400 dark:text-velum-500 truncate max-w-[40%]">
                              {c.hint}
                            </span>
                          )}
                          {c.shortcut && (
                            <kbd className="text-[10px] font-mono text-velum-500 dark:text-velum-400 bg-velum-50 dark:bg-velum-800 border border-velum-200 dark:border-velum-700 rounded px-1.5 py-0.5">
                              {c.shortcut}
                            </kbd>
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))
          )}
        </div>

        {/* Footer hints */}
        <div className="flex items-center justify-between px-4 py-2 border-t border-velum-100 dark:border-velum-800 bg-velum-50/60 dark:bg-velum-800/30 text-[11px] text-velum-500 dark:text-velum-400">
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1">
              <ArrowUp size={11} aria-hidden="true" />
              <ArrowDown size={11} aria-hidden="true" />
              navegar
            </span>
            <span className="inline-flex items-center gap-1">
              <CornerDownLeft size={11} aria-hidden="true" />
              abrir
            </span>
          </div>
          <span className="hidden sm:inline tracking-widest">{footerLabel}</span>
        </div>
      </div>
    </div>
  );
};
