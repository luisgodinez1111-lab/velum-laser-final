import type { Request } from "express";

/**
 * Returns the client IP address from the Express request.
 * Falls back to socket address when req.ip is undefined (rare, but possible
 * if trust proxy is misconfigured or the request comes from a raw TCP socket).
 */
export const safeIp = (req: Request): string =>
  req.ip ?? req.socket?.remoteAddress ?? "unknown";

/**
 * Devuelve req.query con un tipo compatible con Record<string, unknown>.
 * ParsedQs (el tipo de req.query) es estructuralmente compatible, pero el cast
 * es necesario porque sus valores intermedios no asignan a unknown directamente.
 * Centraliza el cast para no repetirlo en cada controller.
 */
export const queryParams = (req: Request): Record<string, unknown> =>
  req.query as unknown as Record<string, unknown>;

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
