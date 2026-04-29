import React, { forwardRef } from 'react';

// Sistema de botones VELUM — primitivo del design system.
//
// Decisiones de diseño:
// - 6 variants cubren ~todos los casos: primary (acción principal), secondary
//   (alternativa), outline (secundaria sin fondo), ghost (acciones suaves dentro
//   de cards), danger (destructivas), link (apariencia de hyperlink).
// - 4 sizes (xs/sm/md/lg) — xs para chips de acción dentro de tablas; lg para
//   CTAs heroicas.
// - leftIcon/rightIcon como ReactNodes — evita className combat con el caller.
// - isLoading bloquea interacción y muestra spinner inline preservando ancho.
// - focus-visible ring usa shadow-focus (token) para consistencia cross-app.
// - Active state baja escala 2% — feedback táctil sin animación pesada.

export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'link';
export type ButtonSize = 'xs' | 'sm' | 'md' | 'lg';

interface ButtonProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  isLoading?: boolean;
  loadingLabel?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  fullWidth?: boolean;
  children?: React.ReactNode;
}

const baseStyles =
  'inline-flex items-center justify-center gap-2 font-sans font-bold uppercase tracking-widest ' +
  'transition-all duration-base ease-standard ' +
  'focus:outline-none focus-visible:shadow-focus ' +
  'disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100 ' +
  'select-none';

const variantStyles: Record<ButtonVariant, string> = {
  primary:
    'bg-velum-900 text-velum-50 border border-velum-900 ' +
    'hover:bg-velum-800 hover:border-velum-800 ' +
    'active:scale-[0.98] active:bg-velum-900 ' +
    'shadow-sm hover:shadow-md ' +
    'dark:bg-velum-50 dark:text-velum-900 dark:border-velum-50 ' +
    'dark:hover:bg-velum-200 dark:hover:border-velum-200',
  secondary:
    'bg-velum-100 text-velum-900 border border-velum-200 ' +
    'hover:bg-velum-200 hover:border-velum-300 ' +
    'active:scale-[0.98] ' +
    'dark:bg-velum-800 dark:text-velum-50 dark:border-velum-700 ' +
    'dark:hover:bg-velum-700 dark:hover:border-velum-600',
  outline:
    'bg-transparent text-velum-900 border border-velum-900 ' +
    'hover:bg-velum-900 hover:text-velum-50 ' +
    'active:scale-[0.98] ' +
    'dark:text-velum-50 dark:border-velum-300 ' +
    'dark:hover:bg-velum-50 dark:hover:text-velum-900',
  ghost:
    'bg-transparent text-velum-700 border border-transparent ' +
    'hover:bg-velum-100 hover:text-velum-900 ' +
    'active:scale-[0.98] ' +
    'dark:text-velum-300 dark:hover:bg-velum-800 dark:hover:text-velum-50',
  danger:
    'bg-danger-500 text-white border border-danger-500 ' +
    'hover:bg-danger-700 hover:border-danger-700 ' +
    'active:scale-[0.98] ' +
    'focus-visible:shadow-focusDanger ' +
    'shadow-sm hover:shadow-md',
  link:
    'bg-transparent text-velum-900 border-0 px-0 py-0 normal-case tracking-normal ' +
    'underline decoration-velum-300 underline-offset-4 ' +
    'hover:decoration-velum-900 hover:text-velum-700',
};

const sizeStyles: Record<ButtonSize, string> = {
  xs: 'text-[10px] px-3 py-1.5 rounded-sm gap-1.5',
  sm: 'text-[11px] px-4 py-2   rounded-sm gap-1.5',
  md: 'text-xs    px-6 py-3    rounded-sm',
  lg: 'text-xs    px-9 py-4    rounded-sm',
};

// Helper exportable: permite a `<Link>`, `<a>`, etc. compartir estilos visuales
// del Button sin duplicar magic className. Uso:
//   <Link to="/x" className={buttonStyles({ variant: 'primary', size: 'lg' })}>...</Link>
export const buttonStyles = ({
  variant = 'primary',
  size = 'md',
  fullWidth = false,
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
} = {}): string =>
  [
    baseStyles,
    variantStyles[variant],
    sizeStyles[size],
    fullWidth ? 'w-full' : '',
    variant === 'link' ? '!px-0 !py-0' : '',
  ]
    .filter(Boolean)
    .join(' ');

const Spinner: React.FC<{ size: ButtonSize }> = ({ size }) => {
  const px = size === 'xs' ? 12 : size === 'sm' ? 14 : 16;
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

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = 'primary',
      size = 'md',
      isLoading = false,
      loadingLabel,
      leftIcon,
      rightIcon,
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
    const linkSizeOverride = variant === 'link' ? '!px-0 !py-0' : '';

    return (
      <button
        ref={ref}
        type={type}
        disabled={disabled || isLoading}
        aria-busy={isLoading || undefined}
        className={[baseStyles, variantStyles[variant], sizeStyles[size], widthClass, linkSizeOverride, className]
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
            {rightIcon && <span className="inline-flex items-center" aria-hidden="true">{rightIcon}</span>}
          </>
        )}
      </button>
    );
  },
);

Button.displayName = 'Button';
