import React, { forwardRef, useId } from 'react';

// TextField — input completo con label, helper text, error state, prefix/suffix.
//
// Decisiones:
// - useId() genera id único si caller no lo provee — garantiza htmlFor correcto.
// - error tiene prioridad sobre helperText (estándar Material/Adobe Spectrum).
// - prefix/suffix son ReactNodes (típicamente icons o texto corto).
// - aria-invalid + aria-describedby wired automáticamente.
// - sizes mapean a alturas estándar (sm=36, md=44, lg=52) — 44 cumple touch
//   target mínimo WCAG.

export type TextFieldSize = 'sm' | 'md' | 'lg';

interface TextFieldProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size' | 'prefix'> {
  label?: string;
  helperText?: string;
  error?: string;
  prefix?: React.ReactNode;
  suffix?: React.ReactNode;
  size?: TextFieldSize;
  required?: boolean;
  /** Marca el field como obligatorio sin mostrar el asterisco rojo (label opcional). */
  hideRequiredAsterisk?: boolean;
}

const sizeStyles: Record<TextFieldSize, { input: string; wrapper: string }> = {
  sm: { input: 'h-9 text-sm px-3',  wrapper: 'gap-2' },
  md: { input: 'h-11 text-sm px-4', wrapper: 'gap-2.5' },
  lg: { input: 'h-13 text-base px-4', wrapper: 'gap-3' },
};

export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(
  (
    {
      label,
      helperText,
      error,
      prefix,
      suffix,
      size = 'md',
      required = false,
      hideRequiredAsterisk = false,
      id: idProp,
      className = '',
      disabled,
      ...props
    },
    ref,
  ) => {
    const reactId = useId();
    const id = idProp ?? `tf-${reactId}`;
    const helperId = helperText ? `${id}-helper` : undefined;
    const errorId = error ? `${id}-error` : undefined;
    const describedBy = [errorId, helperId].filter(Boolean).join(' ') || undefined;

    const hasError = !!error;

    const inputClasses = [
      'w-full bg-white text-velum-900 placeholder:text-velum-400',
      'dark:bg-velum-900 dark:text-velum-50 dark:placeholder:text-velum-500',
      'border rounded-md transition-all duration-base ease-standard',
      'focus:outline-none focus-visible:shadow-focus',
      'disabled:bg-velum-50 disabled:text-velum-400 disabled:cursor-not-allowed',
      'dark:disabled:bg-velum-800/40 dark:disabled:text-velum-500',
      sizeStyles[size].input,
      hasError
        ? 'border-danger-500 focus-visible:shadow-focusDanger'
        : 'border-velum-200 hover:border-velum-300 focus:border-velum-900 dark:border-velum-700 dark:hover:border-velum-600 dark:focus:border-velum-400',
      prefix ? 'pl-10' : '',
      suffix ? 'pr-10' : '',
    ]
      .filter(Boolean)
      .join(' ');

    return (
      <div className={['flex flex-col', sizeStyles[size].wrapper, className].filter(Boolean).join(' ')}>
        {label && (
          <label
            htmlFor={id}
            className="text-[11px] font-bold uppercase tracking-widest text-velum-700 dark:text-velum-300"
          >
            {label}
            {required && !hideRequiredAsterisk && (
              <span className="ml-1 text-danger-500" aria-hidden="true">*</span>
            )}
          </label>
        )}

        <div className="relative">
          {prefix && (
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-velum-400 dark:text-velum-500" aria-hidden="true">
              {prefix}
            </div>
          )}
          <input
            ref={ref}
            id={id}
            disabled={disabled}
            required={required}
            aria-invalid={hasError || undefined}
            aria-describedby={describedBy}
            className={inputClasses}
            {...props}
          />
          {suffix && (
            <div className="absolute inset-y-0 right-0 flex items-center pr-3 text-velum-400 dark:text-velum-500">
              {suffix}
            </div>
          )}
        </div>

        {error && (
          <p id={errorId} role="alert" className="text-xs text-danger-700 leading-tight">
            {error}
          </p>
        )}
        {!error && helperText && (
          <p id={helperId} className="text-xs text-velum-500 dark:text-velum-400 leading-tight">
            {helperText}
          </p>
        )}
      </div>
    );
  },
);

TextField.displayName = 'TextField';
