import React, { useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { IconButton } from './IconButton';

// Drawer — panel deslizante desde el borde. Para forms largos / detalle de
// recordemos sin perder contexto del listado de fondo.
//
// Decisiones:
// - side: right (default) en desktop, bottom-sheet pattern automático en mobile
//   con prop forceBottom={true}.
// - Sizes según contenido: sm (sidebar), md (form), lg (detail), xl (split view).
// - Misma a11y que Modal: focus trap, ESC, scroll lock.
//
// vs Modal: Drawer cuando el contexto de fondo importa (ej: editar paciente
//   sin perder lista). Modal cuando es decisión binaria atómica.

export type DrawerSide = 'left' | 'right' | 'bottom';
export type DrawerSize = 'sm' | 'md' | 'lg' | 'xl';

interface DrawerProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  children: React.ReactNode;
  side?: DrawerSide;
  size?: DrawerSize;
  closeOnBackdrop?: boolean;
  closeOnEsc?: boolean;
  hideCloseButton?: boolean;
  className?: string;
  'aria-label'?: string;
  /** Footer slot — útil para botones de acción persistentes. */
  footer?: React.ReactNode;
}

const sizeStyles: Record<DrawerSide, Record<DrawerSize, string>> = {
  right: {
    sm: 'w-full max-w-sm',
    md: 'w-full max-w-md',
    lg: 'w-full max-w-lg',
    xl: 'w-full max-w-2xl',
  },
  left: {
    sm: 'w-full max-w-sm',
    md: 'w-full max-w-md',
    lg: 'w-full max-w-lg',
    xl: 'w-full max-w-2xl',
  },
  bottom: {
    sm: 'w-full max-h-[40vh]',
    md: 'w-full max-h-[60vh]',
    lg: 'w-full max-h-[80vh]',
    xl: 'w-full max-h-[95vh]',
  },
};

const positionStyles: Record<DrawerSide, string> = {
  right:  'inset-y-0 right-0',
  left:   'inset-y-0 left-0',
  bottom: 'inset-x-0 bottom-0',
};

const enterAnimation: Record<DrawerSide, string> = {
  right:  'animate-[slide-in-right_220ms_cubic-bezier(0,0,0.2,1)_both]',
  left:   'animate-[slide-in-left_220ms_cubic-bezier(0,0,0.2,1)_both]',
  bottom: 'animate-[slide-in-bottom_220ms_cubic-bezier(0,0,0.2,1)_both]',
};

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

export const Drawer: React.FC<DrawerProps> = ({
  isOpen,
  onClose,
  title,
  description,
  children,
  side = 'right',
  size = 'md',
  closeOnBackdrop = true,
  closeOnEsc = true,
  hideCloseButton = false,
  className = '',
  'aria-label': ariaLabel,
  footer,
}) => {
  const panelRef = useRef<HTMLDivElement>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);
  const titleId = useRef(`drawer-title-${Math.random().toString(36).slice(2, 9)}`).current;
  const descId = useRef(`drawer-desc-${Math.random().toString(36).slice(2, 9)}`).current;

  useEffect(() => {
    if (!isOpen) return;
    previouslyFocusedRef.current = document.activeElement as HTMLElement;

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const firstFocusable = panelRef.current?.querySelector<HTMLElement>(FOCUSABLE);
    firstFocusable?.focus();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && closeOnEsc) {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key === 'Tab' && panelRef.current) {
        const focusables = Array.from(panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE));
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = prevOverflow;
      previouslyFocusedRef.current?.focus?.();
    };
  }, [isOpen, closeOnEsc, onClose]);

  const handleBackdropClick = useCallback((e: React.MouseEvent) => {
    if (e.target === e.currentTarget && closeOnBackdrop) onClose();
  }, [closeOnBackdrop, onClose]);

  if (!isOpen) return null;

  const drawerContent = (
    <div className="fixed inset-0 z-[60] animate-fade-in" onClick={handleBackdropClick}>
      <div className="absolute inset-0 bg-velum-900/50 dark:bg-black/70 backdrop-blur-sm" aria-hidden="true" />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        aria-label={ariaLabel}
        aria-describedby={description ? descId : undefined}
        className={[
          'absolute bg-white dark:bg-velum-900 shadow-2xl flex flex-col',
          positionStyles[side],
          sizeStyles[side][size],
          enterAnimation[side],
          side === 'bottom' ? 'rounded-t-xl' : '',
          className,
        ]
          .filter(Boolean)
          .join(' ')}
      >
        {/* Drag handle visual en bottom-sheet (cosmético, no funcional) */}
        {side === 'bottom' && (
          <div className="flex justify-center pt-3 pb-1" aria-hidden="true">
            <div className="h-1 w-10 rounded-full bg-velum-200 dark:bg-velum-700" />
          </div>
        )}

        {/* Header */}
        {(title || !hideCloseButton) && (
          <div className="flex items-start justify-between gap-4 px-6 pt-5 pb-4 border-b border-velum-100 dark:border-velum-800">
            <div className="flex-1 min-w-0">
              {title && (
                <h2 id={titleId} className="font-serif text-xl text-velum-900 dark:text-velum-50 leading-tight">
                  {title}
                </h2>
              )}
              {description && (
                <p id={descId} className="mt-1.5 text-sm text-velum-500 dark:text-velum-400 leading-relaxed">
                  {description}
                </p>
              )}
            </div>
            {!hideCloseButton && (
              <IconButton
                aria-label="Cerrar panel"
                icon={<X />}
                size="sm"
                variant="ghost"
                onClick={onClose}
              />
            )}
          </div>
        )}

        {/* Body scrolleable */}
        <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>

        {/* Footer persistente — útil para "Guardar / Cancelar" siempre visibles */}
        {footer && (
          <div className="px-6 py-4 border-t border-velum-100 dark:border-velum-800 bg-velum-50/50 dark:bg-velum-800/30 flex items-center justify-end gap-3">
            {footer}
          </div>
        )}
      </div>
    </div>
  );

  return createPortal(drawerContent, document.body);
};
