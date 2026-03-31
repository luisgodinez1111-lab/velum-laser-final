import type { Express } from "express";
import rateLimit from "express-rate-limit";
import { rateLimitKeyByUser } from "../utils/request";

/**
 * Aplica todos los rate limiters a la aplicación Express.
 * Debe llamarse antes de montar las rutas pero después de cookieParser.
 */
export const applyRateLimits = (app: Express): void => {
  // Login: máx 5 intentos por 15 min (protección brute-force)
  app.use(
    "/auth/login",
    rateLimit({
      windowMs: 15 * 60 * 1000,
      limit: 5,
      standardHeaders: true,
      legacyHeaders: false,
      message: { message: "Demasiados intentos. Intenta de nuevo en 15 minutos." },
    })
  );

  // Auth general: 20 req/10 min
  app.use(
    "/auth",
    rateLimit({ windowMs: 10 * 60 * 1000, limit: 20, standardHeaders: true, legacyHeaders: false })
  );

  // Rutas de administración y datos sensibles: 60 req/10 min
  app.use(
    [
      "/admin",
      "/api/v1/audit-logs",
      "/api/v1/marketing/events",
      "/api/v1/payments",
      "/api/v1/agenda/admin",
      "/api/integrations/google-calendar",
    ],
    rateLimit({ windowMs: 10 * 60 * 1000, limit: 60, standardHeaders: true, legacyHeaders: false })
  );

  // Documentos/uploads: 30 req/10 min para prevenir abuso
  app.use(
    ["/documents", "/api/v1/documents"],
    rateLimit({ windowMs: 10 * 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false })
  );

  // API docs: prevenir scraping/enumeración
  app.use(
    "/docs",
    rateLimit({ windowMs: 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false })
  );

  // Google Calendar webhook: prevenir replay floods
  app.use(
    "/api/webhooks/google-calendar",
    rateLimit({ windowMs: 60 * 1000, limit: 60, standardHeaders: true, legacyHeaders: false })
  );

  // OTP resend — muy restrictivo para evitar spam
  app.use(
    ["/api/v1/custom-charges/:id/resend-otp", "/api/v1/users/me/password/request-whatsapp-code"],
    rateLimit({
      windowMs: 15 * 60 * 1000,
      limit: 3,
      standardHeaders: true,
      legacyHeaders: false,
      message: { message: "Demasiadas solicitudes de código. Intenta de nuevo en 15 minutos." },
    })
  );

  // Consent OTP send + verify — agresivo para evitar spam de correos OTP
  app.use(
    ["/auth/consent-otp/send", "/auth/consent-otp/verify"],
    rateLimit({
      windowMs: 15 * 60 * 1000,
      limit: 5,
      standardHeaders: true,
      legacyHeaders: false,
      message: { message: "Demasiadas solicitudes de OTP. Intenta de nuevo en 15 minutos." },
    })
  );

  // Custom charges OTP — endpoint público, límite estricto
  app.use(
    "/api/v1/custom-charges",
    rateLimit({ windowMs: 10 * 60 * 1000, limit: 15, standardHeaders: true, legacyHeaders: false })
  );

  // Notificaciones — autenticado pero con límite
  app.use(
    "/api/v1/notifications",
    rateLimit({ windowMs: 10 * 60 * 1000, limit: 120, standardHeaders: true, legacyHeaders: false })
  );

  // Medical intakes — prevenir spam de formularios (15 req/hora)
  app.use(
    "/api/v1/medical-intakes",
    rateLimit({
      windowMs: 60 * 60 * 1000,
      limit: 15,
      standardHeaders: true,
      legacyHeaders: false,
      message: { message: "Demasiadas solicitudes de expediente médico. Intenta de nuevo más tarde." },
    })
  );

  // Confirmación de cita por token: 5 intentos por 5 min por IP
  app.use(
    "/api/v1/appointments/confirm",
    rateLimit({
      windowMs: 5 * 60 * 1000,
      limit: 5,
      standardHeaders: true,
      legacyHeaders: false,
      message: { message: "Demasiados intentos de confirmación. Intenta de nuevo en 5 minutos." },
    })
  );

  // Admin delete OTP — muy estricto por usuario autenticado (10 req/15 min, solo no-GET)
  app.use(
    "/api/v1/admin/access/users",
    rateLimit({
      windowMs: 15 * 60 * 1000,
      limit: 10,
      standardHeaders: true,
      legacyHeaders: false,
      message: { message: "Demasiados intentos. Intenta de nuevo en 15 minutos." },
      skip: (req) => req.method === "GET",
      keyGenerator: (req) => rateLimitKeyByUser(req, "admin-delete"),
    })
  );

  // Creación de pacientes: máx 20 por admin por hora
  app.use(
    "/admin/patients",
    rateLimit({
      windowMs: 60 * 60 * 1000,
      limit: 20,
      standardHeaders: true,
      legacyHeaders: false,
      message: { message: "Límite de creación de pacientes alcanzado. Intenta de nuevo en 1 hora." },
      keyGenerator: (req) => rateLimitKeyByUser(req, "admin"),
      skip: (req) => req.method !== "POST",
    })
  );

  // Fallback global — cubre rutas sin limitador explícito
  // Usa el ID del usuario autenticado si está disponible, o la IP como fallback
  app.use(
    rateLimit({
      windowMs: 10 * 60 * 1000,
      limit: 300,
      standardHeaders: true,
      legacyHeaders: false,
      skip: (req) =>
        req.path === "/api/v1/notifications/stream" ||
        req.path === "/health" ||
        req.path === "/api/health" ||
        req.path === "/api/v1/health/detailed",
      keyGenerator: (req) => rateLimitKeyByUser(req),
    })
  );
};
