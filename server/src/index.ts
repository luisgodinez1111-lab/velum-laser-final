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
import { stripeRoutes } from "./routes/stripeRoutes";
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
import { stripeWebhookRouter } from "./routes/stripeWebhookRoutes";
import { startIntegrationWorker } from "./services/integrationWorker";
import { startPaymentReminderCron } from "./services/paymentReminderService";
import { env } from "./utils/env";
import { httpLogger, logger } from "./utils/logger";
import { errorHandler } from "./middlewares/error";
import { openApiSpec } from "./openapi";

if (!env.jwtSecret) {
  throw new Error("JWT_SECRET is required");
}

const app = express();
app.set("json replacer", (key: string, value: unknown) => (key === "passwordHash" ? undefined : value));

// ── Health checks ────────────────────────────────────────────────────
app.get("/health", (_req, res) => res.status(200).json({ ok: true, service: "api" }));
app.get("/api/health", (_req, res) => res.status(200).json({ ok: true, service: "api" }));

app.set("trust proxy", 1);
app.use(httpLogger);
app.use(helmet());
app.use(cors({ origin: env.corsOrigin.split(","), credentials: true }));
app.use(cookieParser());

// ── Rate limiting ────────────────────────────────────────────────────
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

// ── Stripe legacy (mantenido por compatibilidad con webhooks existentes)
app.use(stripeRoutes);

// ── Error handler (siempre último) ───────────────────────────────────
app.use(errorHandler);

// ── Servidor ─────────────────────────────────────────────────────────
app.listen(env.port, () => {
  logger.info(`API running on :${env.port}`);
  void startIntegrationWorker().catch((error) => {
    logger.error({ err: error }, "Unable to start integration worker");
  });
  startPaymentReminderCron();
});
