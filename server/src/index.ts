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
import { intakeRoutes } from "./routes/intakeRoutes";
import { appointmentRoutes } from "./routes/appointmentRoutes";
import { scheduleRoutes } from "./routes/scheduleRoutes";
import { leadRoutes } from "./routes/leadRoutes";
import { env } from "./utils/env";
import { httpLogger } from "./utils/logger";
import { errorHandler } from "./middlewares/error";
import { openApiSpec } from "./openapi";

if (!env.jwtSecret) {
  throw new Error("JWT_SECRET is required");
}

const app = express();

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

app.use("/stripe/webhook", raw({ type: "application/json" }));
app.use(express.json({ limit: "1mb" }));

app.use("/docs", swaggerUi.serve, swaggerUi.setup(openApiSpec));
app.use("/auth", authRoutes);
app.use(userRoutes);
app.use(membershipRoutes);
app.use(documentRoutes);
app.use(adminRoutes);
app.use(stripeRoutes);
app.use(intakeRoutes);
app.use(appointmentRoutes);
app.use(scheduleRoutes);
app.use(leadRoutes);

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use(errorHandler);

app.listen(env.port, () => {
  // eslint-disable-next-line no-console
  console.log(`API running on :${env.port}`);
});
