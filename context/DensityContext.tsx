import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';

// DensityContext — controla la densidad visual de primitives (Card, PageHeader,
// y futuros DataTable/List). Pensado para que el panel admin pueda alternar
// entre 'comfortable' (default, mismo look de siempre) y 'compact' (≈30% menos
// vertical, ideal para tablas con muchos registros).
//
// Persistencia: localStorage 'velum:density'. Solo se respeta en rutas envueltas
// por <DensityProvider>. Sin provider, useDensity() retorna 'comfortable'.
//
// No es un theme — es independiente de dark mode. Un usuario admin puede
// preferir compact sin tocar tema.

export type Density = 'comfortable' | 'compact';

const STORAGE_KEY = 'velum:density';

interface DensityContextValue {
  density: Density;
  setDensity: (d: Density) => void;
  toggleDensity: () => void;
}

const DensityCtx = createContext<DensityContextValue | undefined>(undefined);

export const DensityProvider: React.FC<{
  children: React.ReactNode;
  /** Densidad inicial si no hay valor persistido. Default: comfortable. */
  defaultDensity?: Density;
}> = ({ children, defaultDensity = 'comfortable' }) => {
  const [density, setDensityState] = useState<Density>(() => {
    if (typeof window === 'undefined') return defaultDensity;
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      return stored === 'compact' || stored === 'comfortable' ? stored : defaultDensity;
    } catch {
      return defaultDensity;
    }
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, density);
    } catch {
      // localStorage puede fallar en modo privado / cuotas — no bloqueante.
    }
    // Atributo en <html> para hooks CSS futuros (data-density="compact").
    document.documentElement.setAttribute('data-density', density);
  }, [density]);

  const setDensity = useCallback((d: Density) => setDensityState(d), []);
  const toggleDensity = useCallback(
    () => setDensityState((d) => (d === 'comfortable' ? 'compact' : 'comfortable')),
    [],
  );

  return (
    <DensityCtx.Provider value={{ density, setDensity, toggleDensity }}>
      {children}
    </DensityCtx.Provider>
  );
};

/**
 * Retorna la densidad actual. Sin provider, default 'comfortable'.
 * Usar en primitives que necesiten leer densidad (Card, PageHeader, etc.).
 */
export function useDensity(): Density {
  const ctx = useContext(DensityCtx);
  return ctx?.density ?? 'comfortable';
}

/**
 * Acceso completo al contexto (incluye setters). Usar en el toggle.
 * Lanza si se usa fuera de DensityProvider — protege contra bugs silenciosos.
 */
export function useDensityControls(): DensityContextValue {
  const ctx = useContext(DensityCtx);
  if (!ctx) {
    throw new Error('useDensityControls debe usarse dentro de <DensityProvider>');
  }
  return ctx;
}
