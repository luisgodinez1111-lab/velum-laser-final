import React from 'react';
import { Rows3, Rows2 } from 'lucide-react';
import { IconButton } from './IconButton';
import { Tooltip } from './Tooltip';
import { useDensityControls } from '../../context/DensityContext';

// DensityToggle — alterna entre densidad confortable y compacta. Pensado para
// el header del panel admin. La densidad la lee cualquier primitive con
// soporte (Card, PageHeader). Persiste en localStorage vía DensityContext.

interface DensityToggleProps {
  /** Visual size del IconButton. */
  size?: 'xs' | 'sm' | 'md' | 'lg';
  /** Variant del IconButton. */
  variant?: 'ghost' | 'outline' | 'secondary';
  className?: string;
}

export const DensityToggle: React.FC<DensityToggleProps> = ({
  size = 'sm',
  variant = 'ghost',
  className,
}) => {
  const { density, toggleDensity } = useDensityControls();
  const isCompact = density === 'compact';
  // Iconos: Rows3 (más filas) cuando está comfortable y va a switch a compact;
  // Rows2 cuando está compact y va a aflojar a comfortable.
  const Icon = isCompact ? Rows2 : Rows3;
  const label = isCompact ? 'Cambiar a densidad confortable' : 'Cambiar a densidad compacta';
  return (
    <Tooltip content={label} placement="bottom">
      <IconButton
        size={size}
        variant={variant}
        icon={<Icon />}
        aria-label={label}
        aria-pressed={isCompact}
        onClick={toggleDensity}
        className={className}
      />
    </Tooltip>
  );
};
