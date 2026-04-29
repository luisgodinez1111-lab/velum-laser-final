import React, { forwardRef } from 'react';

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
// - asChild no implementado para mantener simplicidad — si se necesita Link
//   wrapper, hacer <Link><Card>...</Card></Link>.

export type CardVariant = 'elevated' | 'bordered' | 'subtle';
export type CardPadding = 'none' | 'sm' | 'md' | 'lg';

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: CardVariant;
  padding?: CardPadding;
  interactive?: boolean;
}

const variantStyles: Record<CardVariant, string> = {
  elevated: 'bg-white border border-velum-100 shadow-md',
  bordered: 'bg-white border border-velum-200 shadow-sm',
  subtle:   'bg-velum-50 border border-velum-100',
};

const paddingStyles: Record<CardPadding, string> = {
  none: 'p-0',
  sm:   'p-4',
  md:   'p-6',
  lg:   'p-8',
};

const interactiveStyles =
  'cursor-pointer transition-all duration-base ease-standard ' +
  'hover:shadow-lg hover:-translate-y-0.5 hover:border-velum-300 ' +
  'focus:outline-none focus-visible:shadow-focus active:translate-y-0';

export const Card = forwardRef<HTMLDivElement, CardProps>(
  (
    {
      variant = 'bordered',
      padding = 'md',
      interactive = false,
      className = '',
      children,
      tabIndex,
      ...props
    },
    ref,
  ) => (
    <div
      ref={ref}
      className={[
        'rounded-lg',
        variantStyles[variant],
        paddingStyles[padding],
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
  ),
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
    className={['mb-4 pb-4 border-b border-velum-100', className].filter(Boolean).join(' ')}
    {...props}
  />
);

export const CardTitle: React.FC<React.HTMLAttributes<HTMLHeadingElement>> = ({
  className = '',
  ...props
}) => (
  <h3
    className={['font-serif text-xl text-velum-900 leading-tight', className].filter(Boolean).join(' ')}
    {...props}
  />
);

export const CardDescription: React.FC<React.HTMLAttributes<HTMLParagraphElement>> = ({
  className = '',
  ...props
}) => (
  <p
    className={['mt-1.5 text-sm text-velum-500 leading-relaxed', className].filter(Boolean).join(' ')}
    {...props}
  />
);

export const CardFooter: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({
  className = '',
  ...props
}) => (
  <div
    className={['mt-6 pt-4 border-t border-velum-100 flex items-center justify-end gap-3', className]
      .filter(Boolean)
      .join(' ')}
    {...props}
  />
);
