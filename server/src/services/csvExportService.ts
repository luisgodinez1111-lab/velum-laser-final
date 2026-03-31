/** Escapa un valor para CSV (RFC 4180): envuelve en comillas y duplica las internas. */
export const escapeCsvField = (v: unknown): string =>
  `"${String(v ?? "").replace(/"/g, '""')}"`;
