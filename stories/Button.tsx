import React from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  /** Loading state — disables clicks y muestra spinner. */
  loading?: boolean;
}

/**
 * Botón canónico del design system.
 * Solo usa tokens vía Tailwind classes — NO hex literales.
 */
export const Button: React.FC<ButtonProps> = ({
  variant = "primary",
  size = "md",
  loading = false,
  disabled,
  className = "",
  children,
  ...rest
}) => {
  const base = "inline-flex items-center justify-center font-medium rounded-md transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-velum-700 focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed";

  const variants: Record<Variant, string> = {
    primary:   "bg-velum-900 text-white hover:bg-velum-800",
    secondary: "bg-velum-100 text-velum-900 hover:bg-velum-200 border border-velum-200",
    ghost:     "bg-transparent text-velum-900 hover:bg-velum-100",
    danger:    "bg-danger-500 text-white hover:bg-danger-700",
  };

  const sizes: Record<Size, string> = {
    sm: "h-8 px-3 text-sm",
    md: "h-10 px-4 text-base",
    lg: "h-12 px-6 text-lg",
  };

  return (
    <button
      type={rest.type ?? "button"}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={`${base} ${variants[variant]} ${sizes[size]} ${className}`}
      {...rest}
    >
      {loading ? (
        <span className="inline-block w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin mr-2" />
      ) : null}
      {children}
    </button>
  );
};
