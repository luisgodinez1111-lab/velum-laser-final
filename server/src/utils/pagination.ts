/** Parsea y normaliza parámetros de paginación desde query string. */
export const parsePagination = (
  query: Record<string, unknown>,
  opts: { maxLimit?: number; defaultLimit?: number } = {}
) => {
  const maxLimit     = opts.maxLimit     ?? 100;
  const defaultLimit = opts.defaultLimit ?? 50;
  const page  = Math.max(1, parseInt(String(query.page  ?? "1"), 10));
  const limit = Math.min(maxLimit, Math.max(1, parseInt(String(query.limit ?? String(defaultLimit)), 10)));
  return { page, limit, skip: (page - 1) * limit };
};
