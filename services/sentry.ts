/**
 * Sentry — frontend (Fase 0.5)
 *
 * Reglas:
 *   - Se inicializa SOLO si VITE_SENTRY_DSN está definido. Sin DSN, todas las
 *     funciones son no-op para no acoplar el deploy a tener cuenta Sentry.
 *   - El tenantId se setea desde el frontend al hacer login (lo expone el API
 *     en /api/auth/me) — hasta entonces el evento se etiqueta como `anonymous`.
 *   - Sample rate de tracing por defecto: 10% (configurable). Replay opt-in.
 */
import * as Sentry from '@sentry/react';

type ImportMetaEnv = {
  VITE_SENTRY_DSN?: string;
  VITE_SENTRY_ENVIRONMENT?: string;
  VITE_SENTRY_RELEASE?: string;
  VITE_SENTRY_TRACES_SAMPLE_RATE?: string;
  VITE_SENTRY_REPLAY_SAMPLE_RATE?: string;
  MODE?: string;
};

const env = ((import.meta as unknown as { env?: ImportMetaEnv }).env) ?? {};

let initialized = false;

const SENSITIVE_KEYS = new Set([
  'password',
  'token',
  'authorization',
  'cookie',
  'authToken',
  'refreshToken',
]);

function scrub<T>(obj: T, depth = 0): T {
  if (depth > 5 || !obj || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map((v) => scrub(v, depth + 1)) as unknown as T;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    if (SENSITIVE_KEYS.has(k)) {
      out[k] = '[REDACTED]';
    } else if (v && typeof v === 'object') {
      out[k] = scrub(v, depth + 1);
    } else {
      out[k] = v;
    }
  }
  return out as T;
}

export function initSentry(): void {
  if (initialized) return;
  if (!env.VITE_SENTRY_DSN) return;

  Sentry.init({
    dsn: env.VITE_SENTRY_DSN,
    environment: env.VITE_SENTRY_ENVIRONMENT ?? env.MODE ?? 'production',
    release: env.VITE_SENTRY_RELEASE,
    tracesSampleRate: Number(env.VITE_SENTRY_TRACES_SAMPLE_RATE ?? 0.1),
    replaysSessionSampleRate: Number(env.VITE_SENTRY_REPLAY_SAMPLE_RATE ?? 0),
    replaysOnErrorSampleRate: 1.0,
    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.replayIntegration({ maskAllText: true, blockAllMedia: true }),
    ],
    sendDefaultPii: false,
    beforeSend(event) {
      if (event.request) event.request = scrub(event.request);
      if (event.extra) event.extra = scrub(event.extra);
      return event;
    },
  });
  initialized = true;
}

export function setSentryUser(user: { id: string; role: string; tenantId?: string }): void {
  if (!initialized) return;
  Sentry.setUser({ id: user.id });
  Sentry.setTag('user_role', user.role);
  if (user.tenantId) Sentry.setTag('tenant_id', user.tenantId);
}

export function clearSentryUser(): void {
  if (!initialized) return;
  Sentry.setUser(null);
}

export function captureException(err: unknown, context?: Record<string, unknown>): void {
  if (!initialized) return;
  Sentry.captureException(err, context ? { extra: scrub(context) } : undefined);
}

export const isSentryEnabled = (): boolean => initialized;
