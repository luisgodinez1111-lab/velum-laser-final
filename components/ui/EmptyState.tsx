import React from 'react';
import { Button, type ButtonVariant } from './Button';

// EmptyState — placeholder cuando una lista/sección está vacía.
//
// Decisiones:
// - icon prop como ReactNode — el caller pasa <Calendar />, <Inbox /> de lucide
//   o cualquier SVG. Sin opinion sobre iconografía.
// - action opcional con label + onClick + variant — si quieres "Crear primero"
//   o "Refrescar", lo pones; si no, solo informa.
// - secondaryAction para casos con dos vías ("Crear" + "Aprender más").
// - sizes (compact/comfortable/spacious): compact en cards pequeñas,
//   spacious para vistas dedicadas.
//
// vs ErrorState (futuro): EmptyState = "todo bien, no hay datos".
//   ErrorState = "algo falló, hay que reintentar".

export type EmptyStateSize = 'compact' | 'comfortable' | 'spacious';

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
    variant?: ButtonVariant;
    leftIcon?: React.ReactNode;
  };
  secondaryAction?: {
    label: string;
    onClick: () => void;
  };
  size?: EmptyStateSize;
  className?: string;
}

const sizeStyles: Record<EmptyStateSize, { wrapper: string; iconBox: string; title: string; desc: string }> = {
  compact: {
    wrapper: 'py-8 px-4 gap-3',
    iconBox: 'h-12 w-12 [&_svg]:h-5 [&_svg]:w-5',
    title:   'text-sm',
    desc:    'text-xs',
  },
  comfortable: {
    wrapper: 'py-12 px-6 gap-4',
    iconBox: 'h-16 w-16 [&_svg]:h-6 [&_svg]:w-6',
    title:   'text-base',
    desc:    'text-sm',
  },
  spacious: {
    wrapper: 'py-20 px-8 gap-5',
    iconBox: 'h-20 w-20 [&_svg]:h-8 [&_svg]:w-8',
    title:   'text-lg',
    desc:    'text-base',
  },
};

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  description,
  action,
  secondaryAction,
  size = 'comfortable',
  className = '',
}) => {
  const styles = sizeStyles[size];
  return (
    <div
      role="status"
      aria-live="polite"
      className={[
        'flex flex-col items-center justify-center text-center',
        styles.wrapper,
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {icon && (
        <div
          className={`flex items-center justify-center rounded-full bg-velum-100 text-velum-500 dark:bg-velum-800 dark:text-velum-400 ${styles.iconBox}`}
          aria-hidden="true"
        >
          {icon}
        </div>
      )}
      <div className="flex flex-col gap-1.5 max-w-sm">
        <h3 className={`font-serif text-velum-900 dark:text-velum-50 ${styles.title}`}>{title}</h3>
        {description && (
          <p className={`text-velum-500 dark:text-velum-400 leading-relaxed font-light ${styles.desc}`}>
            {description}
          </p>
        )}
      </div>
      {(action || secondaryAction) && (
        <div className="flex flex-col sm:flex-row items-center gap-3 pt-2">
          {action && (
            <Button
              variant={action.variant ?? 'primary'}
              size="sm"
              onClick={action.onClick}
              leftIcon={action.leftIcon}
            >
              {action.label}
            </Button>
          )}
          {secondaryAction && (
            <Button variant="ghost" size="sm" onClick={secondaryAction.onClick}>
              {secondaryAction.label}
            </Button>
          )}
        </div>
      )}
    </div>
  );
};
