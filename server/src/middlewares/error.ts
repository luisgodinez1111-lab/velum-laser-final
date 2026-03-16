import { NextFunction, Request, Response } from "express";
import { logger } from "../utils/logger";
import { ZodError } from "zod";

export const errorHandler = (err: Error, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof ZodError) {
    // Return only field names and human-readable messages — never expose internal schema paths
    const fields = err.issues.map((i) => ({ field: i.path.join("."), message: i.message }));
    return res.status(400).json({ message: "Datos inválidos", fields });
  }

  const status = (err as Error & { status?: number }).status;
  if (typeof status === "number" && status >= 400 && status < 600) {
    return res.status(status).json({ message: err.message || "Error" });
  }

  logger.error({ err }, "Unhandled error");
  return res.status(500).json({ message: "Error interno" });
};
