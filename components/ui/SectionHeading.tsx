import React from 'react';

// SectionHeading — heading de subsección, equivalente al patrón repetido:
//   <p className="text-[10px] font-bold uppercase tracking-widest text-velum-400 mb-3 flex items-center gap-2">
//     <Icon size={11} /> Título
//   </p>
// y al alternativo:
//   <h2 className="text-xs font-bold uppercase tracking-widest text-velum-500 mb-3">Título</h2>
//
// Uso:
//   <SectionHeading>Distribución por plan</SectionHeading>
//   <SectionHeading icon={<Wallet size={11} />}>Historial de pagos</SectionHeading>
//   <SectionHeading id="cobranza" icon={<HandCoins size={11} />}>Cola de cobranza</SectionHeading>
//
// El `id` permite usarlo como anchor para SectionNav. Renderiza <h2> por
// default — semánticamente debe ir bajo el <h1> del PageHeader.

interface SectionHeadingProps {
  children: React.ReactNode;
  /** Icono a la izquierda. Tamaño recomendado: 11-12. */
  icon?: React.ReactNode;
  /** Acciones a la derecha (botón refresh, link "ver todos", etc.). */
  actions?: React.ReactNode;
  /** Anchor id para deep-links / SectionNav. */
  id?: string;
  /** Heading level — h2 por default. h3 para sub-subsecciones. */
  as?: 'h2' | 'h3' | 'h4';
  className?: string;
}

export const SectionHeading: React.FC<SectionHeadingProps> = ({
  children,
  icon,
  actions,
  id,
  as: Tag = 'h2',
  className = '',
}) => (
  <div
    className={['flex items-center justify-between mb-3 gap-3', className]
      .filter(Boolean)
      .join(' ')}
  >
    <Tag
      id={id}
      className="text-[11px] font-bold uppercase tracking-widest text-velum-500 flex items-center gap-2 scroll-mt-20"
    >
      {icon && <span aria-hidden="true" className="text-velum-400">{icon}</span>}
      {children}
    </Tag>
    {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
  </div>
);
