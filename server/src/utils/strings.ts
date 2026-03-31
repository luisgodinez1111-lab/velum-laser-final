/** Convierte un valor desconocido a string trimmed; retorna '' si no es string. */
export const clean = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

/** Valida formato básico de correo electrónico. */
export const validEmail = (email: string): boolean => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
