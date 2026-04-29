import React, { useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { IconButton } from './IconButton';

// Modal — diálogo modal centrado con backdrop, focus trap, ESC, ARIA dialog.
//
// Patrón enterprise: portal en document.body para evitar stacking context
// issues, focus management automático, scroll lock en body cuando abierto.
//
// API:
//   <Modal isOpen={open} onClose={() => setOpen(false)} title="Confirmar">
//     <p>¿Estás segura?</p>
//     <ModalFooter>
//       <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
//       <Button variant="primary" onClick={handleConfirm}>Confirmar</Button>
//     </ModalFooter>
//   </Modal>
//
// vs Drawer: Modal centrado para confirmaciones/forms cortos.
//   Drawer lateral para forms largos / vistas auxiliares.

export type ModalSize = 'sm' | 'md' | 'lg' | 'xl' | 'full';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  children: React.ReactNode;
  size?: ModalSize;
  /** Cerrar al hacer click en backdrop. Default true. False para forms críticos. */
  closeOnBackdrop?: boolean;
  /** Cerrar al presionar ESC. Default true. False solo si tienes razón fuerte. */
  closeOnEsc?: boolean;
  /** Esconde el botón X. Útil cuando el flujo requiere acción explícita. */
  hideCloseButton?: boolean;
  /** className extra para el panel del modal (no el backdrop). */
  className?: string;
  /** Etiqueta accesible para screen readers cuando no hay title visible. */
  'aria-label'?: string;
}

const sizeStyles: Record<ModalSize, string> = {
  sm:   'max-w-sm',
  md:   'max-w-md',
  lg:   'max-w-2xl',
  xl:   'max-w-4xl',
  full: 'max-w-[95vw] h-[90vh]',
};

// Selectores de elementos focusables — usado por focus trap
const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  description,
  children,
  size = 'md',
  closeOnBackdrop = true,
  closeOnEsc = true,
  hideCloseButton = false,
  className = '',
  'aria-label': ariaLabel,
}) => {
  const panelRef = useRef<HTMLDivElement>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);
  const titleId = useRef(`modal-title-${Math.random().toString(36).slice(2, 9)}`).current;
  const descId = useRef(`modal-desc-${Math.random().toString(36).slice(2, 9)}`).current;

  // Focus trap + ESC + scroll lock
  useEffect(() => {
    if (!isOpen) return;

    // Guarda foco previo para restaurarlo al cerrar (a11y crítico)
    previouslyFocusedRef.current = document.activeElement as HTMLElement;

    // Lock body scroll
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    // Focus al primer elemento focusable del modal
    const firstFocusable = panelRef.current?.querySelector<HTMLElement>(FOCUSABLE);
    firstFocusable?.focus();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && closeOnEsc) {
        e.stopPropagation();
        onClose();
        return;
      }

      // Focus trap: Tab cycle dentro del modal
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
      // Restaura foco al elemento previo al abrir el modal
      previouslyFocusedRef.current?.focus?.();
    };
  }, [isOpen, closeOnEsc, onClose]);

  if (!isOpen) return null;

  const handleBackdropClick = useCallback((e: React.MouseEvent) => {
    if (e.target === e.currentTarget && closeOnBackdrop) {
      onClose();
    }
  }, [closeOnBackdrop, onClose]);

  const modalContent = (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 sm:p-6 animate-fade-in"
      onClick={handleBackdropClick}
    >
      {/* Backdrop con blur */}
      <div className="absolute inset-0 bg-velum-900/60 backdrop-blur-sm" aria-hidden="true" />

      {/* Panel */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        aria-label={ariaLabel}
        aria-describedby={description ? descId : undefined}
        className={[
          'relative w-full bg-white rounded-xl shadow-xl border border-velum-100',
          'flex flex-col max-h-[90vh] overflow-hidden',
          'animate-scale-in',
          sizeStyles[size],
          className,
        ]
          .filter(Boolean)
          .join(' ')}
      >
        {/* Header */}
        {(title || !hideCloseButton) && (
          <div className="flex items-start justify-between gap-4 px-6 pt-6 pb-4 border-b border-velum-100">
            <div className="flex-1 min-w-0">
              {title && (
                <h2 id={titleId} className="font-serif text-xl text-velum-900 leading-tight">
                  {title}
                </h2>
              )}
              {description && (
                <p id={descId} className="mt-1.5 text-sm text-velum-500 leading-relaxed">
                  {description}
                </p>
              )}
            </div>
            {!hideCloseButton && (
              <IconButton
                aria-label="Cerrar diálogo"
                icon={<X />}
                size="sm"
                variant="ghost"
                onClick={onClose}
              />
            )}
          </div>
        )}

        {/* Body — scrolleable */}
        <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
};

// ── ModalFooter — barra de acciones al final ─────────────────────────────────
// Convención: secundarios izquierda, primario derecha.
export const ModalFooter: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({
  className = '',
  children,
  ...props
}) => (
  <div
    className={[
      'flex items-center justify-end gap-3 px-6 py-4 border-t border-velum-100 bg-velum-50/50 -mx-6 -mb-5 mt-6',
      className,
    ]
      .filter(Boolean)
      .join(' ')}
    {...props}
  >
    {children}
  </div>
);
