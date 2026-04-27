import React from "react";

type Tone = "default" | "subtle" | "accent";
type Padding = "sm" | "md" | "lg";

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  tone?: Tone;
  padding?: Padding;
  /** Eleva con sombra. Útil para cards en backgrounds activos. */
  raised?: boolean;
}

export const Card: React.FC<CardProps> = ({
  tone = "default",
  padding = "md",
  raised = false,
  className = "",
  children,
  ...rest
}) => {
  const tones: Record<Tone, string> = {
    default: "bg-white border-velum-200 text-velum-900",
    subtle:  "bg-velum-100 border-velum-200 text-velum-900",
    accent:  "bg-velum-900 border-velum-900 text-white",
  };
  const paddings: Record<Padding, string> = {
    sm: "p-3",
    md: "p-5",
    lg: "p-8",
  };
  const elevation = raised ? "shadow-md" : "";
  return (
    <div
      className={`rounded-lg border ${tones[tone]} ${paddings[padding]} ${elevation} ${className}`}
      {...rest}
    >
      {children}
    </div>
  );
};

export const CardHeader: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({ className = "", children, ...rest }) => (
  <div className={`flex items-start justify-between gap-4 mb-3 ${className}`} {...rest}>
    {children}
  </div>
);

export const CardTitle: React.FC<React.HTMLAttributes<HTMLHeadingElement>> = ({ className = "", children, ...rest }) => (
  <h3 className={`font-serif text-xl leading-tight ${className}`} {...rest}>{children}</h3>
);

export const CardDescription: React.FC<React.HTMLAttributes<HTMLParagraphElement>> = ({ className = "", children, ...rest }) => (
  <p className={`text-sm text-velum-500 mt-1 ${className}`} {...rest}>{children}</p>
);
