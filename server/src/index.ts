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
import { env } from "./utils/env";
import { httpLogger } from "./utils/logger";
import { errorHandler } from "./middlewares/error";
import { openApiSpec } from "./openapi";

if (!env.jwtSecret) {
  throw new Error("JWT_SECRET is required");
}

const app = express();
app.set("json replacer", (key, value) => (key === "passwordHash" ? undefined : value));

// PUBLIC_HEALTHCHECK
app.get("/health", (_req, res) => { res.status(200).json({ ok: true, service: "api" }); });
app.get("/api/health", (_req, res) => { res.status(200).json({ ok: true, service: "api" }); });

app.set("trust proxy", 1);

app.use(httpLogger);
app.use(helmet());
app.use(
  cors({
    origin: env.corsOrigin.split(","),
    credentials: true
  })
);

app.use(cookieParser());

app.use(
  "/auth",
  rateLimit({
    windowMs: 10 * 60 * 1000,
    limit: 20,
    standardHeaders: true,
    legacyHeaders: false
  })
);

app.use(
  ["/admin", "/api/v1/audit-logs", "/api/v1/marketing/events", "/api/v1/payments"],
  rateLimit({
    windowMs: 10 * 60 * 1000,
    limit: 60,
    standardHeaders: true,
    legacyHeaders: false
  })
);

app.use("/stripe/webhook", raw({ type: "application/json" }));
app.use(express.json({ limit: "1mb" }));

app.use("/docs", swaggerUi.serve, swaggerUi.setup(openApiSpec));
app.use("/auth", authRoutes);
app.use("/stripe", stripeRoutes);
app.use(v1LeadRoutes);
app.use(v1MedicalIntakeRoutes);
app.use(v1AppointmentRoutes);
app.use(v1SessionRoutes);
app.use(v1PaymentRoutes);
app.use(v1AuditRoutes);
app.use(userRoutes);
app.use(membershipRoutes);
app.use(documentRoutes);
app.use(adminRoutes);

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use(errorHandler);

app.listen(env.port, () => {
  // eslint-disable-next-line no-console
  console.log(`API running on :${env.port}`);
});
