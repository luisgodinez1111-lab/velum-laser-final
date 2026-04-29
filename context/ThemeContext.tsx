import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';

// ThemeContext — controla el modo claro/oscuro del panel admin.
//
// Persistencia: localStorage 'velum:theme'. Sin override, lee la preferencia
// del sistema (`prefers-color-scheme: dark`) en el primer load. Después de
// que el usuario elige, su elección manda.
//
// El valor 'theme' siempre es 'light' o 'dark' (resuelto). El estado interno
// 'preference' puede ser 'system' | 'light' | 'dark' — más adelante si se
// quiere exponer el modo "seguir sistema". Por ahora simple: dos estados
// resueltos.
//
// Aplicación: agrega/remueve class `dark` en <html>. Tailwind con
// darkMode:'class' aplica las variantes `dark:*`.

export type Theme = 'light' | 'dark';

const STORAGE_KEY = 'velum:theme';

interface ThemeContextValue {
  theme: Theme;
  setTheme: (t: Theme) => void;
  toggleTheme: () => void;
}

const ThemeCtx = createContext<ThemeContextValue | undefined>(undefined);

function readInitial(defaultTheme: Theme): Theme {
  if (typeof window === 'undefined') return defaultTheme;
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === 'light' || stored === 'dark') return stored;
  } catch {
    // localStorage puede fallar en modo privado — caemos al sistema.
  }
  // Sin preferencia guardada, respeta el sistema.
  if (window.matchMedia?.('(prefers-color-scheme: dark)').matches) return 'dark';
  return defaultTheme;
}

export const ThemeProvider: React.FC<{
  children: React.ReactNode;
  /** Default si no hay nada guardado y el sistema no expresa preferencia. */
  defaultTheme?: Theme;
}> = ({ children, defaultTheme = 'light' }) => {
  const [theme, setThemeState] = useState<Theme>(() => readInitial(defaultTheme));

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') root.classList.add('dark');
    else root.classList.remove('dark');
    try {
      window.localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // No bloqueante.
    }
  }, [theme]);

  const setTheme = useCallback((t: Theme) => setThemeState(t), []);
  const toggleTheme = useCallback(
    () => setThemeState((t) => (t === 'light' ? 'dark' : 'light')),
    [],
  );

  return (
    <ThemeCtx.Provider value={{ theme, setTheme, toggleTheme }}>{children}</ThemeCtx.Provider>
  );
};

/** Acceso al theme. Sin provider, default 'light'. */
export function useTheme(): Theme {
  const ctx = useContext(ThemeCtx);
  return ctx?.theme ?? 'light';
}

/** Acceso completo (theme + setters). Usar en el toggle. Lanza fuera de provider. */
export function useThemeControls(): ThemeContextValue {
  const ctx = useContext(ThemeCtx);
  if (!ctx) {
    throw new Error('useThemeControls debe usarse dentro de <ThemeProvider>');
  }
  return ctx;
}
