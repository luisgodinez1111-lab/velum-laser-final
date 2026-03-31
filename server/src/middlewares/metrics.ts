import type { Request, Response, NextFunction } from "express";
import { inc, recordLatency } from "../services/metricsService";

/** Middleware que registra métricas HTTP automáticamente para cada request. */
export const metricsMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  const start = Date.now();

  res.on("finish", () => {
    const ms = Date.now() - start;
    const route = req.route?.path ?? req.path.replace(/\/[a-z0-9]{20,}/gi, "/:id");
    const status = String(res.statusCode);
    const method = req.method;

    inc("http_req", { method, status: status[0] + "xx" });
    recordLatency(`${method} ${route}`, ms);

    if (res.statusCode >= 500) {
      inc("error|http_5xx", { method, route });
    }
  });

  next();
};
