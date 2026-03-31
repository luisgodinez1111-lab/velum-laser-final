/**
 * time.ts — Utilidades de tiempo reutilizables.
 *
 * Centraliza conversiones de duración que estaban duplicadas o embebidas en controllers.
 */

/**
 * Convierte una string de expiración tipo "1d", "24h", "30m", "60s" a milisegundos.
 * Retorna 24h por defecto si el formato no es reconocido.
 */
export const parseDurationMs = (expiry: string): number => {
  const match = expiry.match(/^(\d+)([smhd])$/);
  if (!match) return 24 * 60 * 60 * 1000;
  const n = parseInt(match[1], 10);
  switch (match[2]) {
    case 's': return n * 1_000;
    case 'm': return n * 60_000;
    case 'h': return n * 3_600_000;
    case 'd': return n * 86_400_000;
    default:  return 24 * 60 * 60 * 1000;
  }
};
