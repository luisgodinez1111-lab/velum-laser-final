import React from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { useDensity, type Density } from '../../context/DensityContext';

// PageHeader — patrón consistente para títulos de página enterprise.
//
// Estructura: Breadcrumbs (opcional) → Title → Description → Actions (right)
//
// API:
//   <PageHeader
//     breadcrumbs={[
//       { label: 'Admin',     to: '/admin' },
//       { label: 'Pacientes', to: '/admin?tab=socias' },
//       { label: 'Sofía M.' }, // último sin to = current
//     ]}
//     title="Sofía Martínez"
//     description="Miembro desde 2024 — Plan Identidad"
//     actions={<><Button>Editar</Button><Button variant="ghost">Más</Button></>}
//   />

export interface BreadcrumbItem {
  label: string;
  to?: string;
}

interface PageHeaderProps {
  breadcrumbs?: BreadcrumbItem[];
  title: string;
  description?: string;
  /** Pre-title eyebrow text — typeset uppercase tracking-widest. */
  eyebrow?: string;
  actions?: React.ReactNode;
  /** Border bottom separator. Default true. */
  bordered?: boolean;
  /** Override del DensityContext. Si se omite, hereda. */
  density?: Density;
  className?: string;
}

// Tabla de estilos por densidad. compact reduce gap vertical y baja un escalón
// el título (4xl → 3xl) sin perder jerarquía. Pensado para vistas admin con
// muchas tablas/cards donde recuperar 24-32px de scroll vale.
const headerStyles: Record<Density, { wrapper: string; title: string; descMt: string; eyebrowMb: string }> = {
  comfortable: {
    wrapper:   'gap-4 pb-6 mb-6',
    title:     'text-3xl md:text-4xl',
    descMt:    'mt-2',
    eyebrowMb: 'mb-2',
  },
  compact: {
    wrapper:   'gap-2 pb-3 mb-4',
    title:     'text-2xl md:text-3xl',
    descMt:    'mt-1',
    eyebrowMb: 'mb-1',
  },
};

export const PageHeader: React.FC<PageHeaderProps> = ({
  breadcrumbs,
  title,
  description,
  eyebrow,
  actions,
  bordered = true,
  density,
  className = '',
}) => {
  const ctxDensity = useDensity();
  const s = headerStyles[density ?? ctxDensity];
  return (
    <header
      className={[
        'flex flex-col',
        s.wrapper,
        bordered ? 'border-b border-velum-200 dark:border-velum-800' : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {breadcrumbs && breadcrumbs.length > 0 && <Breadcrumbs items={breadcrumbs} />}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div className="flex-1 min-w-0">
          {eyebrow && (
            <p className={`text-[10px] font-bold uppercase tracking-[0.25em] text-velum-400 dark:text-velum-500 ${s.eyebrowMb}`}>
              {eyebrow}
            </p>
          )}
          <h1 className={`font-serif ${s.title} text-velum-900 dark:text-velum-50 leading-tight tracking-tight`}>
            {title}
          </h1>
          {description && (
            <p className={`${s.descMt} text-velum-500 dark:text-velum-400 text-sm leading-relaxed max-w-2xl`}>
              {description}
            </p>
          )}
        </div>
        {actions && (
          <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
            {actions}
          </div>
        )}
      </div>
    </header>
  );
};

// ── Breadcrumbs ──────────────────────────────────────────────────────────────
interface BreadcrumbsProps {
  items: BreadcrumbItem[];
  className?: string;
}

export const Breadcrumbs: React.FC<BreadcrumbsProps> = ({ items, className = '' }) => (
  <nav aria-label="Migas de pan" className={className}>
    <ol className="flex items-center gap-1.5 text-xs text-velum-500 dark:text-velum-400 flex-wrap">
      {items.map((item, i) => {
        const isLast = i === items.length - 1;
        return (
          <li key={`${item.label}-${i}`} className="flex items-center gap-1.5">
            {item.to && !isLast ? (
              <Link
                to={item.to}
                className="text-velum-500 dark:text-velum-400 hover:text-velum-900 dark:hover:text-velum-50 transition-colors duration-base ease-standard focus:outline-none focus-visible:shadow-focus rounded px-0.5"
              >
                {item.label}
              </Link>
            ) : (
              <span
                className={isLast ? 'text-velum-900 dark:text-velum-50 font-semibold' : 'text-velum-500 dark:text-velum-400'}
                aria-current={isLast ? 'page' : undefined}
              >
                {item.label}
              </span>
            )}
            {!isLast && (
              <ChevronRight size={12} className="text-velum-300 dark:text-velum-600 flex-shrink-0" aria-hidden="true" />
            )}
          </li>
        );
      })}
    </ol>
  </nav>
);
