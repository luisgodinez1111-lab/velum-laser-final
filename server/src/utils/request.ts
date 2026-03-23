import type { Request } from "express";

/**
 * Returns the client IP address from the Express request.
 * Falls back to socket address when req.ip is undefined (rare, but possible
 * if trust proxy is misconfigured or the request comes from a raw TCP socket).
 */
export const safeIp = (req: Request): string =>
  req.ip ?? req.socket?.remoteAddress ?? "unknown";
