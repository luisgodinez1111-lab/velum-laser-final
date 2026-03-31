import type { Request } from "express";

/**
 * Returns the client IP address from the Express request.
 * Falls back to socket address when req.ip is undefined (rare, but possible
 * if trust proxy is misconfigured or the request comes from a raw TCP socket).
 */
export const safeIp = (req: Request): string =>
  req.ip ?? req.socket?.remoteAddress ?? "unknown";

/**
 * Genera la clave de rate limit preferida para un usuario autenticado.
 * Extrae el userId del JWT en cookie sin pasar por el middleware de auth completo.
 * Si no hay token válido, usa la IP como fallback.
 *
 * @param prefix - Prefijo para diferenciar limiters (ej. "user", "admin", "admin-delete")
 */
export const rateLimitKeyByUser = (req: Request, prefix = "user"): string => {
  try {
    const token = (req as { cookies?: Record<string, string> }).cookies?.accessToken;
    if (token) {
      const payload = JSON.parse(
        Buffer.from(token.split(".")[1], "base64url").toString()
      ) as { sub?: string };
      if (typeof payload.sub === "string") return `${prefix}:${payload.sub}`;
    }
  } catch { /* fall through — usar IP */ }
  return req.ip ?? "unknown";
};
