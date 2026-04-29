import React from 'react';

// Skeleton — placeholder animado mientras se carga contenido real.
//
// Reemplaza a `PageSkeleton.tsx` genérico para casos donde necesitamos un
// skeleton específico (tabla, card, avatar). El shimmer usa keyframe definido
// en tailwind.config (`animate-shimmer`).
//
// API:
//   <Skeleton width="60%" height={20} />
//   <Skeleton variant="circle" size={40} />
//   <Skeleton variant="card" />
//   <SkeletonText lines={3} />
//   <SkeletonTable rows={5} columns={4} />

export type SkeletonVariant = 'rect' | 'circle' | 'pill' | 'card';

interface SkeletonProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'children'> {
  variant?: SkeletonVariant;
  width?: string | number;
  height?: string | number;
  /** Atajo cuadrado (width=height=size). Útil para circle/avatar. */
  size?: string | number;
}

const variantClass: Record<SkeletonVariant, string> = {
  rect:   'rounded-md',
  circle: 'rounded-full',
  pill:   'rounded-full',
  card:   'rounded-lg h-32 w-full',
};

const baseClass =
  'bg-gradient-to-r from-velum-100 via-velum-200 to-velum-100 ' +
  'dark:from-velum-800 dark:via-velum-700 dark:to-velum-800 ' +
  'bg-[length:200%_100%] animate-shimmer';

const toCss = (v?: string | number): string | undefined =>
  v === undefined ? undefined : typeof v === 'number' ? `${v}px` : v;

export const Skeleton: React.FC<SkeletonProps> = ({
  variant = 'rect',
  width,
  height,
  size,
  className = '',
  style,
  ...props
}) => {
  const computedStyle: React.CSSProperties = {
    ...style,
    width: toCss(size ?? width),
    height: toCss(size ?? height),
  };

  return (
    <div
      role="status"
      aria-label="Cargando"
      className={[baseClass, variantClass[variant], className].filter(Boolean).join(' ')}
      style={computedStyle}
      {...props}
    />
  );
};

// ── Composiciones comunes ────────────────────────────────────────────────────

export const SkeletonText: React.FC<{ lines?: number; className?: string }> = ({
  lines = 3,
  className = '',
}) => (
  <div className={['flex flex-col gap-2', className].filter(Boolean).join(' ')}>
    {Array.from({ length: lines }, (_, i) => (
      <Skeleton
        key={i}
        height={12}
        // Última línea más corta para verse natural
        width={i === lines - 1 ? '70%' : '100%'}
      />
    ))}
  </div>
);

export const SkeletonAvatar: React.FC<{ size?: number; className?: string }> = ({
  size = 40,
  className = '',
}) => <Skeleton variant="circle" size={size} className={className} />;

export const SkeletonCard: React.FC<{ className?: string }> = ({ className = '' }) => (
  <div className={['rounded-lg border border-velum-100 bg-white p-6', className].filter(Boolean).join(' ')}>
    <div className="flex items-center gap-4 mb-4">
      <SkeletonAvatar />
      <div className="flex-1 flex flex-col gap-2">
        <Skeleton height={14} width="40%" />
        <Skeleton height={10} width="25%" />
      </div>
    </div>
    <SkeletonText lines={3} />
  </div>
);

export const SkeletonTable: React.FC<{ rows?: number; columns?: number; className?: string }> = ({
  rows = 5,
  columns = 4,
  className = '',
}) => (
  <div className={['rounded-lg border border-velum-100 bg-white overflow-hidden', className].filter(Boolean).join(' ')}>
    {/* Header */}
    <div className="flex items-center gap-4 px-4 py-3 border-b border-velum-100 bg-velum-50">
      {Array.from({ length: columns }, (_, i) => (
        <Skeleton key={i} height={10} width={i === 0 ? '20%' : '15%'} />
      ))}
    </div>
    {/* Rows */}
    <div className="divide-y divide-velum-50">
      {Array.from({ length: rows }, (_, r) => (
        <div key={r} className="flex items-center gap-4 px-4 py-3.5">
          {Array.from({ length: columns }, (_, c) => (
            <Skeleton key={c} height={12} width={c === 0 ? '20%' : '15%'} />
          ))}
        </div>
      ))}
    </div>
  </div>
);
