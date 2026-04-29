import React, { forwardRef } from 'react';

// PillButton — CTA emocional estilo Apple híbrido.
//
// Diferencia con <Button> (legacy editorial):
// - Pill (rounded-full), font-semibold (no bold uppercase), tracking normal.
// - Pensado para CTAs heroicos del cliente (Dashboard hero, Memberships
//   activar plan, Agenda agendar) y para alertas accionables admin.
// - Para acciones internas en tablas/forms admin, seguir usando <Button>.
//
// Decisiones:
// - 3 variants cubren los 3 contextos del lenguaje pill:
//     primary       → solid velum-900 sobre claro (CTA destacado neutro)
//     outlineLight  → outline sobre fondo claro (CTA secundaria sobre canvas)
//     outlineDark   → outline sobre fondo oscuro (bg-velum-900 — hero contextual)
// - 3 sizes (sm/md/lg) con padding asimétrico (pl > pr) para acomodar el
//   chevron sin que el texto luzca centrado raro.
// - showChevron renderiza un ChevronRight con animación group-hover translate-x.
//   Si pasas tu propio rightIcon, no se duplica.
// - isLoading bloquea interacción y muestra spinner inline preservando ancho.

import { ChevronRight } from 'lucide-react';

export type PillButtonVariant = 'primary' | 'outlineLight' | 'outlineDark';
export type PillButtonSize = 'sm' | 'md' | 'lg';

interface PillButtonProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  variant?: PillButtonVariant;
  size?: PillButtonSize;
  isLoading?: boolean;
  loadingLabel?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  /** Si true, agrega un chevron a la derecha que se desplaza en hover. Ignorado si pasas rightIcon. */
  showChevron?: boolean;
  fullWidth?: boolean;
  children?: React.ReactNode;
}

const baseStyles =
  'group inline-flex items-center justify-center gap-1.5 font-sans font-semibold ' +
  'rounded-full border transition-all duration-base ease-standard ' +
  'focus:outline-none focus-visible:shadow-focus ' +
  'disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100 ' +
  'select-none active:scale-[0.98]';

const variantStyles: Record<PillButtonVariant, string> = {
  // Solid sobre claro — CTA primaria neutra. Lleva peso por color, no por borde.
  primary:
    'bg-velum-900 text-white border-transparent ' +
    'hover:bg-velum-800 ' +
    'dark:bg-velum-50 dark:text-velum-900 ' +
    'dark:hover:bg-velum-200',

  // Outline sobre claro — CTA secundaria que se llena al hover (inversión).
  outlineLight:
    'bg-transparent text-velum-900 border-velum-900/20 ' +
    'hover:bg-velum-900 hover:text-white hover:border-velum-900 ' +
    'dark:text-velum-50 dark:border-velum-50/30 ' +
    'dark:hover:bg-velum-50 dark:hover:text-velum-900 dark:hover:border-velum-50',

  // Outline sobre oscuro (bg-velum-900) — el caso del hero "próxima cita".
  // Invierte a blanco sólido en hover (como apple.com).
  outlineDark:
    'bg-transparent text-white border-white/30 ' +
    'hover:bg-white hover:text-velum-900 hover:border-white',
};

const sizeStyles: Record<PillButtonSize, string> = {
  sm: 'text-[13px] pl-4 pr-3 py-2',
  md: 'text-[14px] pl-5 pr-4 py-2.5',
  lg: 'text-[15px] pl-6 pr-5 py-3',
};

const chevronSizes: Record<PillButtonSize, number> = {
  sm: 14,
  md: 15,
  lg: 16,
};

const Spinner: React.FC<{ size: PillButtonSize }> = ({ size }) => {
  const px = size === 'sm' ? 14 : size === 'md' ? 16 : 18;
  return (
    <svg
      className="animate-spin-slow"
      width={px}
      height={px}
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" fill="none" opacity="0.25" />
      <path
        d="M22 12a10 10 0 0 0-10-10"
        stroke="currentColor"
        strokeWidth="3"
        fill="none"
        strokeLinecap="round"
      />
    </svg>
  );
};

export const PillButton = forwardRef<HTMLButtonElement, PillButtonProps>(
  (
    {
      variant = 'primary',
      size = 'md',
      isLoading = false,
      loadingLabel,
      leftIcon,
      rightIcon,
      showChevron = false,
      fullWidth = false,
      className = '',
      children,
      disabled,
      type = 'button',
      ...props
    },
    ref,
  ) => {
    const widthClass = fullWidth ? 'w-full' : '';
    const resolvedRightIcon =
      rightIcon ??
      (showChevron ? (
        <ChevronRight
          size={chevronSizes[size]}
          className="transition-transform duration-base ease-standard group-hover:translate-x-0.5"
          aria-hidden="true"
        />
      ) : null);

    return (
      <button
        ref={ref}
        type={type}
        disabled={disabled || isLoading}
        aria-busy={isLoading || undefined}
        className={[baseStyles, variantStyles[variant], sizeStyles[size], widthClass, className]
          .filter(Boolean)
          .join(' ')}
        {...props}
      >
        {isLoading ? (
          <>
            <Spinner size={size} />
            {loadingLabel ?? children}
          </>
        ) : (
          <>
            {leftIcon && <span className="inline-flex items-center" aria-hidden="true">{leftIcon}</span>}
            {children}
            {resolvedRightIcon && (
              <span className="inline-flex items-center" aria-hidden="true">{resolvedRightIcon}</span>
            )}
          </>
        )}
      </button>
    );
  },
);

PillButton.displayName = 'PillButton';
