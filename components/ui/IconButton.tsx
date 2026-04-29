import React, { forwardRef } from 'react';
import type { ButtonVariant } from './Button';

// IconButton — botón cuadrado solo-icono. Requiere aria-label obligatorio
// (a11y crítico — sin texto visible, screen readers necesitan el label).
//
// Sizes mapean a touch targets WCAG (mínimo 44x44 en sm).

export type IconButtonSize = 'xs' | 'sm' | 'md' | 'lg';

interface IconButtonProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  variant?: ButtonVariant;
  size?: IconButtonSize;
  icon: React.ReactNode;
  /** Required for screen readers — describe la acción, no el icono. */
  'aria-label': string;
  isLoading?: boolean;
}

const baseStyles =
  'inline-flex items-center justify-center rounded-sm ' +
  'transition-all duration-base ease-standard ' +
  'focus:outline-none focus-visible:shadow-focus ' +
  'disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100';

const variantStyles: Record<ButtonVariant, string> = {
  primary:
    'bg-velum-900 text-velum-50 border border-velum-900 hover:bg-velum-800 active:scale-[0.95] shadow-sm hover:shadow-md',
  secondary:
    'bg-velum-100 text-velum-900 border border-velum-200 hover:bg-velum-200 active:scale-[0.95]',
  outline:
    'bg-transparent text-velum-900 border border-velum-300 hover:bg-velum-900 hover:text-velum-50 hover:border-velum-900 active:scale-[0.95]',
  ghost:
    'bg-transparent text-velum-700 hover:bg-velum-100 hover:text-velum-900 active:scale-[0.95]',
  danger:
    'bg-danger-500 text-white border border-danger-500 hover:bg-danger-700 active:scale-[0.95] focus-visible:shadow-focusDanger',
  link: 'bg-transparent text-velum-900 hover:text-velum-600',
};

const sizeStyles: Record<IconButtonSize, string> = {
  xs: 'h-7  w-7  [&_svg]:h-3.5 [&_svg]:w-3.5',
  sm: 'h-9  w-9  [&_svg]:h-4   [&_svg]:w-4',   // 36px — touch ok móvil
  md: 'h-10 w-10 [&_svg]:h-4.5 [&_svg]:w-4.5',
  lg: 'h-12 w-12 [&_svg]:h-5   [&_svg]:w-5',
};

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  (
    {
      variant = 'ghost',
      size = 'sm',
      icon,
      isLoading = false,
      className = '',
      disabled,
      type = 'button',
      ...props
    },
    ref,
  ) => (
    <button
      ref={ref}
      type={type}
      disabled={disabled || isLoading}
      aria-busy={isLoading || undefined}
      className={[baseStyles, variantStyles[variant], sizeStyles[size], className].filter(Boolean).join(' ')}
      {...props}
    >
      {isLoading ? (
        <svg className="animate-spin-slow" width={16} height={16} viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" fill="none" opacity="0.25" />
          <path d="M22 12a10 10 0 0 0-10-10" stroke="currentColor" strokeWidth="3" fill="none" strokeLinecap="round" />
        </svg>
      ) : (
        icon
      )}
    </button>
  ),
);

IconButton.displayName = 'IconButton';
