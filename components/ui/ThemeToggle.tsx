import React from 'react';
import { Sun, Moon } from 'lucide-react';
import { IconButton } from './IconButton';
import { Tooltip } from './Tooltip';
import { useThemeControls } from '../../context/ThemeContext';

// ThemeToggle — alterna light/dark. Pensado para la top bar del admin.
// Persiste en localStorage vía ThemeProvider.

interface ThemeToggleProps {
  size?: 'xs' | 'sm' | 'md' | 'lg';
  variant?: 'ghost' | 'outline' | 'secondary';
  className?: string;
}

export const ThemeToggle: React.FC<ThemeToggleProps> = ({
  size = 'sm',
  variant = 'ghost',
  className,
}) => {
  const { theme, toggleTheme } = useThemeControls();
  const isDark = theme === 'dark';
  const Icon = isDark ? Sun : Moon;
  const label = isDark ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro';
  return (
    <Tooltip content={label} placement="bottom">
      <IconButton
        size={size}
        variant={variant}
        icon={<Icon />}
        aria-label={label}
        aria-pressed={isDark}
        onClick={toggleTheme}
        className={className}
      />
    </Tooltip>
  );
};
