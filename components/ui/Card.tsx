import React, { forwardRef } from 'react';
import { useDensity, type Density } from '../../context/DensityContext';

// Card — superficie genérica para agrupar contenido relacionado.
//
// Decisiones:
// - 3 variants cubren 95% de casos: elevated (shadow, fondo blanco — modales,
//   panels destacados), bordered (border + bg, default — listings), subtle
//   (sin border, fondo velum-50 — secciones internas).
// - interactive=true agrega hover/focus/cursor-pointer para cards clickeables
//   (típico en grid de membresías, tarjetas de pacientes, etc.).
// - padding como prop separado — algunos casos quieren padding cero (cards
//   con imagen full-bleed arriba).
// - density: hereda del DensityContext si no se pasa explícito. En modo
//   `compact` el padding `md` y `lg` se reducen un escalón para vistas admin
//   con alta densidad de datos. `none` y `sm` no cambian.
// - asChild no implementado para mantener simplicidad — si se necesita Link
//   wrapper, hacer <Link><Card>...</Card></Link>.

export type CardVariant = 'elevated' | 'bordered' | 'subtle';
export type CardPadding = 'none' | 'sm' | 'md' | 'lg';

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: CardVariant;
  padding?: CardPadding;
  interactive?: boolean;
  /** Override del DensityContext. Si se omite, hereda. */
  density?: Density;
}

const variantStyles: Record<CardVariant, string> = {
  elevated: 'bg-white border border-velum-100 shadow-md dark:bg-velum-900 dark:border-velum-800',
  bordered: 'bg-white border border-velum-200 shadow-sm dark:bg-velum-900 dark:border-velum-800',
  subtle:   'bg-velum-50 border border-velum-100 dark:bg-velum-800/40 dark:border-velum-800',
};

// Padding por densidad. `compact` baja un escalón en md/lg para ahorrar
// vertical en tablas admin sin volver el contenido cramped.
const paddingStyles: Record<Density, Record<CardPadding, string>> = {
  comfortable: {
    none: 'p-0',
    sm:   'p-4',
    md:   'p-6',
    lg:   'p-8',
  },
  compact: {
    none: 'p-0',
    sm:   'p-3',
    md:   'p-4',
    lg:   'p-6',
  },
};

const interactiveStyles =
  'cursor-pointer transition-all duration-base ease-standard ' +
  'hover:shadow-lg hover:-translate-y-0.5 hover:border-velum-300 dark:hover:border-velum-700 ' +
  'focus:outline-none focus-visible:shadow-focus active:translate-y-0';

export const Card = forwardRef<HTMLDivElement, CardProps>(
  (
    {
      variant = 'bordered',
      padding = 'md',
      interactive = false,
      density,
      className = '',
      children,
      tabIndex,
      ...props
    },
    ref,
  ) => {
    const ctxDensity = useDensity();
    const effectiveDensity = density ?? ctxDensity;
    return (
      <div
        ref={ref}
        className={[
          'rounded-lg',
          variantStyles[variant],
          paddingStyles[effectiveDensity][padding],
          interactive ? interactiveStyles : '',
          className,
        ]
          .filter(Boolean)
          .join(' ')}
        tabIndex={interactive && tabIndex === undefined ? 0 : tabIndex}
        {...props}
      >
        {children}
      </div>
    );
  },
);

Card.displayName = 'Card';

// ── Sub-componentes opcionales ────────────────────────────────────────────────
// Para Cards estructuradas con header/body/footer. Uso opcional — un Card
// simple con padding directo sigue funcionando.

export const CardHeader: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({
  className = '',
  ...props
}) => (
  <div
    className={['mb-4 pb-4 border-b border-velum-100 dark:border-velum-800', className].filter(Boolean).join(' ')}
    {...props}
  />
);

export const CardTitle: React.FC<React.HTMLAttributes<HTMLHeadingElement>> = ({
  className = '',
  ...props
}) => (
  <h3
    className={['font-serif text-xl text-velum-900 dark:text-velum-50 leading-tight', className].filter(Boolean).join(' ')}
    {...props}
  />
);

export const CardDescription: React.FC<React.HTMLAttributes<HTMLParagraphElement>> = ({
  className = '',
  ...props
}) => (
  <p
    className={['mt-1.5 text-sm text-velum-500 dark:text-velum-400 leading-relaxed', className].filter(Boolean).join(' ')}
    {...props}
  />
);

export const CardFooter: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({
  className = '',
  ...props
}) => (
  <div
    className={['mt-6 pt-4 border-t border-velum-100 dark:border-velum-800 flex items-center justify-end gap-3', className]
      .filter(Boolean)
      .join(' ')}
    {...props}
  />
);
