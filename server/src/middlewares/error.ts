import { NextFunction, Request, Response } from "express";
import { logger } from "../utils/logger";
import { ZodError } from "zod";

export const errorHandler = (err: Error, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof ZodError) {
    return res.status(400).json({ message: "Datos inválidos", issues: err.issues });
  }
  logger.error({ err }, "Unhandled error");
  res.status(500).json({ message: "Error interno" });
};
