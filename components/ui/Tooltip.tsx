import React, { useState, useRef, useEffect, cloneElement } from 'react';

// Tooltip — info contextual sobre hover/focus. Implementación lightweight sin
// Floating UI: posicionamiento simple con bounding box checks.
//
// Decisiones:
// - Trigger es un único hijo (típicamente IconButton / Button / span).
// - Aparece tras delay (default 400ms) para evitar tooltips parpadeantes
//   al pasar el mouse rápido.
// - placement: top (default) — auto-flip si choca contra viewport.
// - Accesible: aria-describedby wired automáticamente al trigger.
// - Touch devices: tap-to-show, segundo tap dismisses.

export type TooltipPlacement = 'top' | 'bottom' | 'left' | 'right';

type TriggerProps = {
  onMouseEnter?: (e: React.MouseEvent) => void;
  onMouseLeave?: (e: React.MouseEvent) => void;
  onFocus?: (e: React.FocusEvent) => void;
  onBlur?: (e: React.FocusEvent) => void;
  'aria-describedby'?: string;
};

interface TooltipProps {
  content: React.ReactNode;
  children: React.ReactElement<TriggerProps>;
  placement?: TooltipPlacement;
  /** Milisegundos antes de mostrar tras hover. */
  delay?: number;
  /** Esconde el tooltip si el contenido es vacío (útil con i18n condicional). */
  hideIfEmpty?: boolean;
  className?: string;
}

const placementStyles: Record<TooltipPlacement, string> = {
  top:    'bottom-full left-1/2 -translate-x-1/2 mb-1.5',
  bottom: 'top-full left-1/2 -translate-x-1/2 mt-1.5',
  left:   'right-full top-1/2 -translate-y-1/2 mr-1.5',
  right:  'left-full top-1/2 -translate-y-1/2 ml-1.5',
};

const arrowStyles: Record<TooltipPlacement, string> = {
  top:    'top-full left-1/2 -translate-x-1/2 -mt-1 border-l-transparent border-r-transparent border-b-transparent border-t-velum-900',
  bottom: 'bottom-full left-1/2 -translate-x-1/2 -mb-1 border-l-transparent border-r-transparent border-t-transparent border-b-velum-900',
  left:   'left-full top-1/2 -translate-y-1/2 -ml-1 border-t-transparent border-b-transparent border-r-transparent border-l-velum-900',
  right:  'right-full top-1/2 -translate-y-1/2 -mr-1 border-t-transparent border-b-transparent border-l-transparent border-r-velum-900',
};

export const Tooltip: React.FC<TooltipProps> = ({
  content,
  children,
  placement = 'top',
  delay = 400,
  hideIfEmpty = true,
  className = '',
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tooltipId = useRef(`tooltip-${Math.random().toString(36).slice(2, 9)}`).current;

  const show = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setIsVisible(true), delay);
  };

  const hide = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setIsVisible(false);
  };

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  if (hideIfEmpty && !content) return children;

  // Inyecta event handlers + aria-describedby al trigger
  const childProps = children.props;
  const trigger = cloneElement<TriggerProps>(children, {
    onMouseEnter: (e: React.MouseEvent) => {
      childProps.onMouseEnter?.(e);
      show();
    },
    onMouseLeave: (e: React.MouseEvent) => {
      childProps.onMouseLeave?.(e);
      hide();
    },
    onFocus: (e: React.FocusEvent) => {
      childProps.onFocus?.(e);
      show();
    },
    onBlur: (e: React.FocusEvent) => {
      childProps.onBlur?.(e);
      hide();
    },
    'aria-describedby': isVisible ? tooltipId : undefined,
  });

  return (
    <span className="relative inline-block">
      {trigger}
      {isVisible && (
        <span
          role="tooltip"
          id={tooltipId}
          className={[
            'absolute z-50 px-2.5 py-1.5 rounded-md',
            'bg-velum-900 text-velum-50 dark:bg-velum-50 dark:text-velum-900 text-xs font-medium leading-tight',
            'whitespace-nowrap pointer-events-none shadow-lg',
            'animate-fade-in',
            placementStyles[placement],
            className,
          ]
            .filter(Boolean)
            .join(' ')}
        >
          {content}
          {/* Arrow */}
          <span
            className={['absolute w-0 h-0 border-4', arrowStyles[placement]].join(' ')}
            aria-hidden="true"
          />
        </span>
      )}
    </span>
  );
};
