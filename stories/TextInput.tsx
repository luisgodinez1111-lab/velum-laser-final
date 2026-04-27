import React, { useId } from "react";

export interface TextInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  /** Texto de ayuda bajo el input */
  helper?: string;
  /** Mensaje de error — cuando se setea, prevalece sobre `helper` y aplica estilo de error */
  error?: string;
  /** Etiqueta a la derecha del input — útil para "MXN", "@dominio.com", iconos */
  trailing?: React.ReactNode;
}

export const TextInput: React.FC<TextInputProps> = ({
  label,
  helper,
  error,
  trailing,
  id: idProp,
  className = "",
  required,
  ...rest
}) => {
  const reactId = useId();
  const id = idProp ?? reactId;
  const hint = error ?? helper;
  const hintId = hint ? `${id}-hint` : undefined;
  const isInvalid = Boolean(error);

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium text-velum-900">
        {label} {required && <span className="text-danger-500" aria-hidden>*</span>}
      </label>
      <div className={`flex items-center bg-white border rounded-md transition-colors focus-within:ring-2 focus-within:ring-velum-700 ${isInvalid ? "border-danger-500" : "border-velum-300 focus-within:border-velum-700"}`}>
        <input
          id={id}
          required={required}
          aria-invalid={isInvalid || undefined}
          aria-describedby={hintId}
          className={`flex-1 h-10 px-3 bg-transparent text-velum-900 placeholder:text-velum-400 outline-none disabled:opacity-50 disabled:cursor-not-allowed ${className}`}
          {...rest}
        />
        {trailing && <span className="px-3 text-sm text-velum-500">{trailing}</span>}
      </div>
      {hint && (
        <span
          id={hintId}
          className={`text-xs ${isInvalid ? "text-danger-700" : "text-velum-500"}`}
        >
          {hint}
        </span>
      )}
    </div>
  );
};
