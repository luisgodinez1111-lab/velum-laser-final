import { NextFunction, Request, Response } from "express";
import { logger } from "../utils/logger";
import { ZodError } from "zod";
import { reportError } from "../utils/errorReporter";
import { AppError } from "../utils/AppError";

export const errorHandler = (err: Error, req: Request, res: Response, _next: NextFunction) => {
  const requestId = req.headers["x-request-id"] as string | undefined;

  if (err instanceof ZodError) {
    const fields = err.issues.map((i) => ({ field: i.path.join("."), message: i.message }));
    return res.status(400).json({
      message: "Datos inválidos",
      code: "VALIDATION_ERROR",
      fields,
      requestId,
    });
  }

  // AppError: error de dominio tipado con statusCode y code explícitos
  if (err instanceof AppError) {
    if (err.statusCode >= 500) {
      reportError(err, { method: req.method, path: req.path, requestId, context: err.context });
    } else {
      logger.warn({ err, statusCode: err.statusCode, code: err.code }, "AppError client");
    }
    return res.status(err.statusCode).json({
      message: err.message,
      code: err.code,
      requestId,
    });
  }

  // Compatibilidad con errores legacy que llevan `.status` como propiedad
  const status = (err as Error & { status?: number }).status;
  if (typeof status === "number" && status >= 400 && status < 500) {
    logger.warn({ err, status }, "Client error");
    return res.status(status).json({
      message: err.message || "Error",
      code: "CLIENT_ERROR",
      requestId,
    });
  }

  // 5xx — unexpected server errors: report + alert
  reportError(err, {
    method: req.method,
    path: req.path,
    requestId,
  });
  return res.status(500).json({
    message: "Error interno del servidor",
    code: "INTERNAL_ERROR",
    requestId,
  });
};
