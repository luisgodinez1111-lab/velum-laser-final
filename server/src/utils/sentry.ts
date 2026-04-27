/**
 * Sentry instrumentation — Fase 0.5
 *
 * Reglas:
 *   - Si SENTRY_DSN está vacío, el SDK NO se inicializa. Cero overhead, cero
 *     llamadas de red. Esto permite desplegar este código sin tener cuenta
 *     Sentry todavía.
 *   - Tags `tenantId` y `userId` se enriquecen automáticamente desde el
 *     AsyncLocalStorage de tenantContext en cada evento (vía `beforeSend`).
 *   - Scrubbing: removemos campos sensibles ANTES de enviar (passwords, tokens,
 *     headers de auth, cookies). Defensa en profundidad sobre el scrub default.
 *
 * Importar `initSentry()` LO MÁS TEMPRANO POSIBLE en el bootstrap del server
 * (antes de imports que se quieran instrumentar).
 */
import * as Sentry from "@sentry/node";
import { env, isProduction } from "./env";
import { getTenantContext } from "./tenantContext";

let initialized = false;

const SENSITIVE_KEYS = new Set([
  "password",
  "passwordhash",
  "token",
  "authorization",
  "cookie",
  "set-cookie",
  "x-health-key",
  "stripe-signature",
  "refreshtoken",
  "passwordhistory",
  "totpsecret",
  "signatureimagedata",
]);

function scrubObject<T>(obj: T, depth = 0): T {
  if (depth > 6 || !obj || typeof obj !== "object") return obj;
  if (Array.isArray(obj)) return obj.map((v) => scrubObject(v, depth + 1)) as unknown as T;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    if (SENSITIVE_KEYS.has(k.toLowerCase())) {
      out[k] = "[REDACTED]";
    } else if (v && typeof v === "object") {
      out[k] = scrubObject(v, depth + 1);
    } else {
      out[k] = v;
    }
  }
  return out as T;
}

export function initSentry(): void {
  if (initialized) return;
  if (!env.sentryDsn) {
    // No DSN → no-op. Documentado y esperado en dev local sin cuenta Sentry.
    return;
  }

  Sentry.init({
    dsn: env.sentryDsn,
    environment: env.sentryEnvironment,
    release: env.sentryRelease || undefined,
    tracesSampleRate: env.sentryTracesSampleRate,
    profilesSampleRate: env.sentryProfilesSampleRate,
    sendDefaultPii: false,
    beforeSend(event) {
      // Enriquecer con tenant context si está disponible.
      const ctx = getTenantContext();
      if (ctx) {
        event.tags = { ...(event.tags ?? {}), tenant_id: ctx.tenantId, tenant_source: ctx.source };
        if (ctx.userId) {
          event.user = { ...(event.user ?? {}), id: ctx.userId };
        }
        if (ctx.role) {
          event.tags.user_role = ctx.role;
        }
      }
      // Scrub recursivo defensivo sobre request body/headers/extra.
      if (event.request) event.request = scrubObject(event.request);
      if (event.extra) event.extra = scrubObject(event.extra);
      return event;
    },
  });
  initialized = true;
}

export const sentry = Sentry;

/**
 * Captura una excepción solo si Sentry está inicializado. Idempotente y
 * seguro de llamar desde cualquier lugar — si no hay DSN configurado, es no-op.
 */
export function captureException(err: unknown, context?: Record<string, unknown>): void {
  if (!initialized) return;
  Sentry.captureException(err, context ? { extra: scrubObject(context) } : undefined);
}

export const isSentryEnabled = (): boolean => initialized;

// Exportamos también un guard para producción — útil para que health endpoints
// validen si la observabilidad está bien configurada en deploy.
export const sentryHealthcheck = (): { enabled: boolean; environment: string } => ({
  enabled: initialized,
  environment: isProduction ? env.sentryEnvironment : "non-production",
});
