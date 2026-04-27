// OpenTelemetry y Sentry deben inicializarse ANTES de importar Express, Prisma
// o cualquier librería que se quiera auto-instrumentar — el SDK parcha
// prototipos en el momento del import. Orden: OTel primero (más bajo nivel),
// luego Sentry (que se beneficia del trace context de OTel cuando ambos están).
import { initTelemetry } from "./utils/telemetry";
initTelemetry();
import { initSentry } from "./utils/sentry";
initSentry();

import "express-async-errors";
import * as Sentry from "@sentry/node";
import express, { raw } from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import cookieParser from "cookie-parser";
import swaggerUi from "swagger-ui-express";
import { applyRateLimits } from "./config/rateLimits";
import { authRoutes } from "./routes/authRoutes";
import { userRoutes } from "./routes/userRoutes";
import { membershipRoutes } from "./routes/membershipRoutes";
import { documentRoutes } from "./routes/documentRoutes";
import { adminRoutes } from "./routes/adminRoutes";
import { v1LeadRoutes } from "./routes/v1LeadRoutes";
import { v1MedicalIntakeRoutes } from "./routes/v1MedicalIntakeRoutes";
import { v1AppointmentRoutes } from "./routes/v1AppointmentRoutes";
import { v1SessionRoutes } from "./routes/v1SessionRoutes";
import { v1PaymentRoutes } from "./routes/v1PaymentRoutes";
import { v1AuditRoutes } from "./routes/v1AuditRoutes";
import { googleCalendarIntegrationRoutes } from "./routes/googleCalendarIntegrationRoutes";
import { googleCalendarWebhookRoutes } from "./routes/googleCalendarWebhookRoutes";
import { memberSelfServiceRoutes } from "./routes/memberSelfServiceRoutes";
import { adminWhatsappConfigRoutes } from "./routes/adminWhatsappConfigRoutes";
import { adminAccessRoutes } from "./routes/adminAccessRoutes";
import { adminStripeConfigRoutes } from "./routes/adminStripeConfigRoutes";
import { billingCheckoutRoutes } from "./routes/billingCheckoutRoutes";
import { customChargeRoutes } from "./routes/customChargeRoutes";
import { notificationRoutes } from "./routes/notificationRoutes";
import { stripeWebhookRouter } from "./routes/stripeWebhookRoutes";
// Crons + integration worker fueron movidos al proceso `worker` (Fase 1.2.c).
// Ver server/src/worker.ts. El API es ahora puramente stateless — escalable
// horizontalmente sin riesgo de duplicar tareas programadas.
import { env } from "./utils/env";
import { httpLogger, logger } from "./utils/logger";
import { errorHandler } from "./middlewares/error";
import { metricsMiddleware } from "./middlewares/metrics";
import { getSnapshot } from "./services/metricsService";
import { exportRoutes } from "./routes/exportRoutes";
import { reportError } from "./utils/errorReporter";
import { openApiSpec } from "./openapi";
import { prisma } from "./db/prisma";
import { getSseConnectionCount } from "./services/notificationService";
import { requestContext } from "./utils/requestContext";
import { getWorkerStatus } from "./utils/workerRegistry";
import { requireAuth, requireRole } from "./middlewares/auth";
import type { AuthRequest } from "./middlewares/auth";

if (!env.jwtSecret) {
  throw new Error("JWT_SECRET is required");
}

const app = express();
app.set("json replacer", (key: string, value: unknown) => (key === "passwordHash" ? undefined : value));

// ── Health checks ────────────────────────────────────────────────────
const healthHandler = async (_req: express.Request, res: express.Response) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return res.status(200).json({ ok: true, service: "api", db: "ok" });
  } catch {
    return res.status(503).json({ ok: false, service: "api", db: "error" });
  }
};
app.get("/health", healthHandler);
app.get("/api/health", healthHandler);

// ── Detailed health — requires HEALTH_API_KEY o sesión de admin ───────
// Middleware que permite acceso con HEALTH_API_KEY (header x-health-key) o con sesión de admin/system
const healthKeyOrAdmin = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const apiKey = env.healthApiKey;
  if (apiKey && req.headers["x-health-key"] === apiKey) {
    // Acceso por API key: marcar para el hint y continuar sin verificar JWT
    (req as AuthRequest & { _healthKeyAuth?: boolean })._healthKeyAuth = true;
    return next();
  }
  // Sin API key válida: exigir JWT de admin o system
  requireAuth(req as AuthRequest, res, (err?: unknown) => {
    if (err) return next(err);
    requireRole(["admin", "system"])(req as AuthRequest, res, next);
  });
};

app.get("/api/v1/health/detailed", healthKeyOrAdmin, async (req: express.Request, res: express.Response) => {
  const isKeyAuth = !!(req as AuthRequest & { _healthKeyAuth?: boolean })._healthKeyAuth;

  const start = Date.now();
  const checks: Record<string, { ok: boolean; [key: string]: unknown }> = {};

  // Database
  try {
    const dbStart = Date.now();
    await prisma.$queryRaw`SELECT 1`;
    checks.database = { ok: true, latencyMs: Date.now() - dbStart };
  } catch (err) {
    checks.database = { ok: false, error: String(err) };
  }

  // Upload directory accessibility
  try {
    const fs = await import("fs/promises");
    await fs.access(env.uploadDir);
    checks.uploadDir = { ok: true };
  } catch {
    checks.uploadDir = { ok: false, error: `${env.uploadDir} not accessible` };
  }

  // Environment sanity (critical secrets present)
  checks.env = {
    ok: !!env.jwtSecret && !!env.databaseUrl,
    ...(!env.jwtSecret || !env.databaseUrl ? { error: "Missing critical env vars" } : {}),
  };

  // Stripe key present (not reachability — avoids external latency on health checks)
  checks.stripe = { ok: !!env.stripeSecretKey };

  // SSE connections count (informational)
  checks.sse = { ok: true, connections: getSseConnectionCount() };

  // Métricas de negocio (informacional — no afectan el estado ok/503)
  try {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    const [activeMembers, appointmentsToday, pendingIntakes] = await Promise.all([
      prisma.membership.count({ where: { status: "active" } }),
      prisma.appointment.count({
        where: { startAt: { gte: todayStart, lte: todayEnd }, status: { not: "canceled" } },
      }),
      prisma.medicalIntake.count({ where: { status: "submitted" } }),
    ]);
    checks.businessMetrics = { ok: true, activeMembers, appointmentsToday, pendingIntakes };
  } catch {
    checks.businessMetrics = { ok: true, error: "metrics_unavailable" };
  }

  // Worker last-run timestamps
  try {
    const workerStatus = await getWorkerStatus();
    checks.workers = { ok: true, lastRuns: workerStatus };
  } catch {
    checks.workers = { ok: true, lastRuns: {} };
  }

  // Node.js memory usage
  const mem = process.memoryUsage();
  checks.memory = { ok: true, heapUsedMB: Math.round(mem.heapUsed / 1024 / 1024), heapTotalMB: Math.round(mem.heapTotal / 1024 / 1024), rssMB: Math.round(mem.rss / 1024 / 1024) };

  const allOk = Object.values(checks).every((c) => c.ok);

  return res.status(allOk ? 200 : 503).json({
    ok: allOk,
    service: "api",
    version: process.env.npm_package_version ?? "1.0.0",
    uptime: Math.floor(process.uptime()),
    uptimeHuman: `${Math.floor(process.uptime() / 3600)}h ${Math.floor((process.uptime() % 3600) / 60)}m`,
    timestamp: new Date().toISOString(),
    latencyMs: Date.now() - start,
    nodeEnv: env.nodeEnv,
    nodeVersion: process.version,
    checks,
    _hint: isKeyAuth ? "key-auth" : "admin-session",
  });
});

app.get("/api/v1/health/metrics", healthKeyOrAdmin, (_req, res) => {
  return res.json(getSnapshot());
});

app.set("trust proxy", 1);

// ── Request ID — correlaciona logs por request + propaga a servicios externos ──
app.use((req, res, next) => {
  const requestId = (req.headers["x-request-id"] as string) || crypto.randomUUID();
  req.headers["x-request-id"] = requestId;
  res.setHeader("x-request-id", requestId);
  requestContext.run({ requestId }, next);
});

// ── Gzip / Brotli compression ─────────────────────────────────────────
app.use(compression({ level: 6, threshold: 1024 }));
app.use(httpLogger);
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "blob:"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'", "data:"],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"],
      upgradeInsecureRequests: env.nodeEnv === "production" ? [] : null,
    },
  },
  crossOriginEmbedderPolicy: false, // needed for SSE EventSource in some browsers
  hsts: env.nodeEnv === "production"
    ? { maxAge: 31536000, includeSubDomains: true, preload: true }
    : false,
}));
app.use(cors({
  origin: env.corsOrigin.split(",").map((s) => s.trim()),
  credentials: true,
  maxAge: 86400, // preflight cached 24h
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Request-ID", "X-Health-Key"],
}));
app.use(cookieParser());
app.use(metricsMiddleware);

// ── Rate limiting ────────────────────────────────────────────────────
applyRateLimits(app);

// ── Stripe webhook — raw body antes de express.json ──────────────────
// Solo un webhook activo: la versión v1
app.use("/api/v1/stripe/webhook", stripeWebhookRouter);
app.use(express.json({ limit: "1mb" }));

// ── Docs ─────────────────────────────────────────────────────────────
app.use("/docs", swaggerUi.serve, swaggerUi.setup(openApiSpec));

// ── Rutas auth ───────────────────────────────────────────────────────
app.use("/auth", authRoutes);

// ── Rutas generales ──────────────────────────────────────────────────
app.use(userRoutes);
app.use(membershipRoutes);
app.use(documentRoutes);
app.use(adminRoutes);
app.use(v1LeadRoutes);
app.use(v1MedicalIntakeRoutes);
app.use(v1AppointmentRoutes);
app.use(v1SessionRoutes);
app.use(v1PaymentRoutes);
app.use(v1AuditRoutes);
app.use(googleCalendarIntegrationRoutes);
app.use(googleCalendarWebhookRoutes);

// ── Rutas de servicios extendidos ────────────────────────────────────
app.use(memberSelfServiceRoutes);
app.use(adminWhatsappConfigRoutes);
app.use(adminAccessRoutes);
app.use(adminStripeConfigRoutes);
app.use(billingCheckoutRoutes);
app.use(customChargeRoutes);
app.use(notificationRoutes);
app.use(exportRoutes);

// ── Public clinic config ──────────────────────────────────────────────
app.get("/api/v1/clinic/config", (_req, res) => {
  res.json({
    phone:    env.clinicContactPhone,
    whatsapp: env.clinicContactWhatsapp,
    email:    env.clinicContactEmail,
  });
});

// ── Client-side error ingest — fires from AppErrorBoundary ───────────
app.post("/api/v1/errors/client", express.json({ limit: "16kb" }), (req, res) => {
  const { message, stack, componentStack, url } = req.body as Record<string, string>;
  const fakeErr = Object.assign(new Error(message ?? "Client error"), { stack });
  reportError(fakeErr, { source: "frontend", componentStack, url, ip: req.ip });
  return res.status(204).send();
});

// ── Sentry error handler — DEBE ir ANTES del errorHandler custom ─────
// Captura excepciones que lleguen aquí y agrega tags de tenant/usuario vía
// `beforeSend` configurado en utils/sentry.ts. Si Sentry no está inicializado
// (sin DSN), este hook es no-op interno.
Sentry.setupExpressErrorHandler(app);

// ── Error handler (siempre último) ───────────────────────────────────
app.use(errorHandler);

// ── Servidor ─────────────────────────────────────────────────────────
// ── Startup: warn if Prisma migrations are pending ────────────────────
const warnIfMigrationsPending = async () => {
  try {
    const rows = await prisma.$queryRaw<Array<{ migration_name: string }>>`
      SELECT migration_name FROM "_prisma_migrations"
      WHERE finished_at IS NULL AND rolled_back_at IS NULL
      LIMIT 5
    `;
    if (rows.length > 0) {
      logger.warn({ pending: rows.map((r) => r.migration_name) }, "[startup] Prisma migrations are pending — run `prisma migrate deploy`");
    }
  } catch {
    // Table may not exist in fresh installs — not fatal
  }
};

const server = app.listen(env.port, () => {
  logger.info(`API running on :${env.port}`);
  void warnIfMigrationsPending();
  // Crons + integrationWorker viven ahora en el proceso `worker`.
  // No iniciar nada de eso aquí: el API es stateless.
});

// ── Graceful shutdown ─────────────────────────────────────────────────
const shutdown = (signal: string) => {
  logger.info(`[shutdown] ${signal} received — stopping gracefully`);
  server.close(() => {
    prisma.$disconnect().then(() => {
      logger.info("[shutdown] Clean shutdown complete");
      process.exit(0);
    }).catch(() => process.exit(1));
  });
  // Force exit after 10 s if server doesn't close cleanly
  setTimeout(() => {
    logger.error("[shutdown] Forced exit after timeout");
    process.exit(1);
  }, 10_000).unref();
};

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
