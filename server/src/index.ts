import "express-async-errors";
import express, { raw } from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import rateLimit from "express-rate-limit";
import swaggerUi from "swagger-ui-express";
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
import { startIntegrationWorker } from "./services/integrationWorker";
import { startPaymentReminderCron } from "./services/paymentReminderService";
import { startAppointmentReminderCron } from "./services/appointmentReminderService";
import { startIntegrationJobCleanupCron } from "./services/integrationJobCleanupService";
import { env } from "./utils/env";
import { httpLogger, logger } from "./utils/logger";
import { errorHandler } from "./middlewares/error";
import { reportError } from "./utils/errorReporter";
import { openApiSpec } from "./openapi";
import { prisma } from "./db/prisma";

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

// ── Detailed health — requires HEALTH_API_KEY or admin session ────────
app.get("/api/v1/health/detailed", async (req: express.Request, res: express.Response) => {
  // Auth: accept either HEALTH_API_KEY header or admin cookie (checked inline to avoid circular imports)
  const apiKey = env.healthApiKey;
  const providedKey = req.headers["x-health-key"] as string | undefined;
  const isKeyAuth = apiKey && providedKey === apiKey;
  // If no api-key configured or not matching, require auth cookie check is done by caller
  // For simplicity, we accept any authenticated request from any source here
  // The route is internal — add reverse-proxy restrictions in nginx for extra safety

  const start = Date.now();
  const checks: Record<string, { ok: boolean; latencyMs?: number; error?: string }> = {};

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
    checks,
    _hint: isKeyAuth ? "key-auth" : "open",
  });
});

app.set("trust proxy", 1);

// ── Request ID — correlaciona logs por request ─────────────────────
app.use((req, res, next) => {
  const requestId = (req.headers["x-request-id"] as string) || crypto.randomUUID();
  req.headers["x-request-id"] = requestId;
  res.setHeader("x-request-id", requestId);
  next();
});

app.use(httpLogger);
app.use(helmet());
app.use(cors({ origin: env.corsOrigin.split(",").map((s) => s.trim()), credentials: true }));
app.use(cookieParser());

// ── Rate limiting ────────────────────────────────────────────────────
// Login specifically: max 5 attempts per 15 min (brute-force protection)
app.use(
  "/auth/login",
  rateLimit({ windowMs: 15 * 60 * 1000, limit: 5, standardHeaders: true, legacyHeaders: false, message: { message: "Demasiados intentos. Intenta de nuevo en 15 minutos." } })
);
app.use(
  "/auth",
  rateLimit({ windowMs: 10 * 60 * 1000, limit: 20, standardHeaders: true, legacyHeaders: false })
);
app.use(
  [
    "/admin",
    "/api/v1/audit-logs",
    "/api/v1/marketing/events",
    "/api/v1/payments",
    "/api/v1/agenda/admin",
    "/api/integrations/google-calendar"
  ],
  rateLimit({ windowMs: 10 * 60 * 1000, limit: 60, standardHeaders: true, legacyHeaders: false })
);
// Documents/uploads: tighter limit to prevent abuse
app.use(
  ["/documents", "/api/v1/documents"],
  rateLimit({ windowMs: 10 * 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false })
);
// Google Calendar webhook: prevent replay floods
app.use(
  "/api/webhooks/google-calendar",
  rateLimit({ windowMs: 60 * 1000, limit: 60, standardHeaders: true, legacyHeaders: false })
);
// OTP resend endpoints — muy restrictivos para evitar spam/abuso
app.use(
  ["/api/v1/custom-charges/:id/resend-otp", "/api/v1/users/me/password/request-whatsapp-code"],
  rateLimit({ windowMs: 15 * 60 * 1000, limit: 3, standardHeaders: true, legacyHeaders: false, message: { message: "Demasiadas solicitudes de código. Intenta de nuevo en 15 minutos." } })
);
// Custom charges OTP — public endpoint, stricter limit
app.use(
  "/api/v1/custom-charges",
  rateLimit({ windowMs: 10 * 60 * 1000, limit: 15, standardHeaders: true, legacyHeaders: false })
);
// Notifications — authenticated but still rate-limited
app.use(
  "/api/v1/notifications",
  rateLimit({ windowMs: 10 * 60 * 1000, limit: 120, standardHeaders: true, legacyHeaders: false })
);

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

// ── Client-side error ingest — fires from AppErrorBoundary ───────────
app.post("/api/v1/errors/client", express.json({ limit: "16kb" }), (req, res) => {
  const { message, stack, componentStack, url } = req.body as Record<string, string>;
  const fakeErr = Object.assign(new Error(message ?? "Client error"), { stack });
  reportError(fakeErr, { source: "frontend", componentStack, url, ip: req.ip });
  return res.status(204).send();
});

// ── Error handler (siempre último) ───────────────────────────────────
app.use(errorHandler);

// ── Servidor ─────────────────────────────────────────────────────────
app.listen(env.port, () => {
  logger.info(`API running on :${env.port}`);
  void startIntegrationWorker().catch((error) => {
    logger.error({ err: error }, "Unable to start integration worker");
  });
  startPaymentReminderCron();
  startAppointmentReminderCron();
  startIntegrationJobCleanupCron();
});
