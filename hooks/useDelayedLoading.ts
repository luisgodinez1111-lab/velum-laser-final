import { useEffect, useState } from "react";

/**
 * Devuelve `true` solo cuando `active` lleva más de `delayMs` en true.
 *
 * Uso: mostrar un indicador de "esto está tardando…" únicamente cuando la
 * carga excede un umbral (por defecto 3 s), sin parpadear en cargas rápidas.
 *
 *   const isSlow = useDelayedLoading(loading); // true si loading > 3s
 */
export const useDelayedLoading = (active: boolean, delayMs = 3000): boolean => {
  const [elapsed, setElapsed] = useState(false);

  useEffect(() => {
    if (!active) {
      setElapsed(false);
      return;
    }
    const timer = setTimeout(() => setElapsed(true), delayMs);
    return () => clearTimeout(timer);
  }, [active, delayMs]);

  return active && elapsed;
};
