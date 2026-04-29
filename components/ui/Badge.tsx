import React from 'react';

// Badge — chip de estado/categoría. NO confundir con Button (no es interactivo).
//
// Decisiones:
// - 6 intents cubren todos los estados de dominio: neutral, accent, success,
//   warning, danger, info.
// - dot=true muestra puntito de status — útil para "Activo/Pausado/Cancelado".
// - Sin sizes (siempre xs/compact) — si necesitas algo más grande, probablemente
//   quieres un Card o una Tag; este componente es deliberadamente pequeño.

export type BadgeIntent = 'neutral' | 'accent' | 'success' | 'warning' | 'danger' | 'info';

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  intent?: BadgeIntent;
  dot?: boolean;
}

const intentStyles: Record<BadgeIntent, { bg: string; fg: string; dot: string }> = {
  neutral: { bg: 'bg-velum-100',   fg: 'text-velum-700',  dot: 'bg-velum-500' },
  accent:  { bg: 'bg-velum-900',   fg: 'text-velum-50',   dot: 'bg-velum-300' },
  success: { bg: 'bg-success-50',  fg: 'text-success-700', dot: 'bg-success-500' },
  warning: { bg: 'bg-warning-50',  fg: 'text-warning-700', dot: 'bg-warning-500' },
  danger:  { bg: 'bg-danger-50',   fg: 'text-danger-700',  dot: 'bg-danger-500' },
  info:    { bg: 'bg-info-50',     fg: 'text-info-700',    dot: 'bg-info-500' },
};

export const Badge: React.FC<BadgeProps> = ({
  intent = 'neutral',
  dot = false,
  className = '',
  children,
  ...props
}) => {
  const styles = intentStyles[intent];
  return (
    <span
      className={[
        'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full',
        'text-[10px] font-bold uppercase tracking-widest leading-relaxed',
        styles.bg,
        styles.fg,
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      {...props}
    >
      {dot && <span className={['h-1.5 w-1.5 rounded-full', styles.dot].join(' ')} aria-hidden="true" />}
      {children}
    </span>
  );
};
