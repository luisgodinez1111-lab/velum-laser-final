/**
 * AppError.ts — Error tipado con código de negocio y HTTP status.
 *
 * Uso:
 *   throw new AppError("Cuenta bloqueada", "LOGIN_LOCKED", 429, { retryAfterMs: 900_000 });
 *
 * El middleware de error centralizado (middlewares/error.ts) detecta AppError y serializa
 * automáticamente el `code` en la respuesta JSON: { message, code, context? }
 *
 * Ventajas vs new Error():
 *   - El statusCode vive en el error, no en el controller (no más `(err as any).status`)
 *   - El code permite al frontend manejar casos específicos sin parsear strings
 *   - El context da contexto de debugging sin exponer internals al cliente
 */
export class AppError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode: number,
    public readonly context?: Record<string, unknown>
  ) {
    super(message);
    this.name = "AppError";
    // Mantiene el stack trace correcto en V8
    if (Error.captureStackTrace) Error.captureStackTrace(this, AppError);
  }
}

// ── Errores de dominio comunes ────────────────────────────────────────────────

export const notFound = (resource: string) =>
  new AppError(`${resource} no encontrado`, "NOT_FOUND", 404);

export const forbidden = (msg = "Acceso denegado") =>
  new AppError(msg, "FORBIDDEN", 403);

export const unauthorized = (msg = "No autorizado") =>
  new AppError(msg, "UNAUTHORIZED", 401);

export const conflict = (msg: string, code = "CONFLICT") =>
  new AppError(msg, code, 409);

export const badRequest = (msg: string, code = "BAD_REQUEST") =>
  new AppError(msg, code, 400);
