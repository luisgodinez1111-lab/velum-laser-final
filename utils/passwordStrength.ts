// Política de fuerza de contraseña — fuente ÚNICA en el frontend.
// Debe mantenerse en paridad con `server/src/utils/auth.ts:validatePasswordStrength`
// (12+ caracteres, mayúscula, minúscula, número y símbolo).

export type PasswordChecks = {
  length: boolean;
  upper: boolean;
  lower: boolean;
  number: boolean;
  special: boolean;
};

export const getPasswordChecks = (value: string): PasswordChecks => ({
  length: value.length >= 12,
  upper: /[A-Z]/.test(value),
  lower: /[a-z]/.test(value),
  number: /[0-9]/.test(value),
  special: /[^A-Za-z0-9]/.test(value),
});

/** Número de reglas cumplidas (0-5). */
export const passwordScore = (value: string): number =>
  Object.values(getPasswordChecks(value)).filter(Boolean).length;

/** True si la contraseña cumple TODA la política. */
export const isPasswordValid = (value: string): boolean =>
  Object.values(getPasswordChecks(value)).every(Boolean);
