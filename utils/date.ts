/**
 * Parsea una fecha en formato ISO ("YYYY-MM-DD") o "DD/MM/YYYY" a Date local.
 * Las strings ISO de solo fecha se fuerzan a hora local para evitar el desfase UTC.
 */
export const parseMxDate = (value?: string): Date | null => {
  if (!value) return null;
  const direct = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? new Date(`${value}T00:00:00`)
    : new Date(value);
  if (!Number.isNaN(direct.getTime())) return direct;

  const match = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return null;
  const [, day, month, year] = match;
  const parsed = new Date(Number(year), Number(month) - 1, Number(day));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

/** Convierte una fecha a clave local "YYYY-MM-DD" sin depender del timezone del motor JS. */
export const toLocalDateKey = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

/** Retorna una nueva Date desplazada N días respecto a la original. */
export const plusDays = (date: Date, days: number): Date => {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
};

/** Retorna el día de la semana (0=Dom … 6=Sáb) para una clave "YYYY-MM-DD". */
export const weekDayForDateKey = (dateKey: string): number => {
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Date(year, (month ?? 1) - 1, day ?? 1).getDay();
};
