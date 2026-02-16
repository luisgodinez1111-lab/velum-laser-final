import dotenv from "dotenv";

dotenv.config();

export const env = {
  port: Number(process.env.PORT ?? 4000),
  nodeEnv: process.env.NODE_ENV ?? "development",
  appUrl: process.env.APP_URL ?? "http://localhost:5173",
  apiUrl: process.env.API_URL ?? "http://localhost:4000",
  databaseUrl: process.env.DATABASE_URL ?? "",
  jwtSecret: process.env.JWT_SECRET ?? "",
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? "1d",
  cookieName: process.env.COOKIE_NAME ?? "velum_token",
  stripeSecretKey: process.env.STRIPE_SECRET_KEY ?? "",
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET ?? "",
  stripePortalReturnUrl: process.env.STRIPE_PORTAL_RETURN_URL ?? "http://localhost:5173/account",
  uploadDir: process.env.UPLOAD_DIR ?? "/var/velum/uploads",
  uploadMaxSize: Number(process.env.UPLOAD_MAX_SIZE ?? 10 * 1024 * 1024),
  gracePeriodDays: Number(process.env.GRACE_PERIOD_DAYS ?? 5),
  corsOrigin: process.env.CORS_ORIGIN ?? "http://localhost:5173",
  metaEnabled: process.env.META_ENABLED === "true",
  metaApiVersion: process.env.META_API_VERSION ?? "v20.0",
  metaPixelId: process.env.META_PIXEL_ID ?? "",
  metaAccessToken: process.env.META_ACCESS_TOKEN ?? "",
  appointmentRescheduleMinHours: Number(process.env.APPOINTMENT_RESCHEDULE_MIN_HOURS ?? 24)
};

export const isProduction = env.nodeEnv === "production";
