/**
 * OpenTelemetry — Fase 0.6
 *
 * Envío de traces + metrics a un backend OTLP-compatible (Grafana Cloud,
 * Datadog, Honeycomb, Jaeger, etc.).
 *
 * Reglas:
 *   - Si OTEL_EXPORTER_OTLP_ENDPOINT está vacío, NO se inicializa el SDK.
 *     Cero overhead, cero red. Idéntico patrón que Sentry.
 *   - Debe importarse ANTES que cualquier código que se quiera instrumentar
 *     (Express, Prisma, http). En `index.ts` esto se hace en la primera línea.
 *   - El span de cada request se enriquece con `tenant.id`, `user.id` y
 *     `user.role` desde el `AsyncLocalStorage` de tenantContext (Fase 0.3),
 *     vía un SpanProcessor custom.
 *
 * Para Grafana Cloud:
 *   OTEL_EXPORTER_OTLP_ENDPOINT=https://otlp-gateway-prod-us-east-0.grafana.net/otlp
 *   OTEL_EXPORTER_OTLP_HEADERS=Authorization=Basic <base64(instanceId:apiToken)>
 *   OTEL_SERVICE_NAME=velum-api
 */
import { NodeSDK } from "@opentelemetry/sdk-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-http";
import { PeriodicExportingMetricReader } from "@opentelemetry/sdk-metrics";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { resourceFromAttributes } from "@opentelemetry/resources";
import {
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
} from "@opentelemetry/semantic-conventions";
import type { ReadableSpan, SpanProcessor, Span } from "@opentelemetry/sdk-trace-base";
import type { Context } from "@opentelemetry/api";
import { env } from "./env";
import { getTenantContext } from "./tenantContext";

let sdk: NodeSDK | undefined;

/** Atributos OTel para deployment.environment según semantic conventions. */
const ATTR_DEPLOYMENT_ENVIRONMENT = "deployment.environment.name";

/**
 * Parser de OTEL_EXPORTER_OTLP_HEADERS — formato "k1=v1,k2=v2".
 * Tolera valores que contienen `=` (común en tokens base64 con padding).
 */
function parseHeaders(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (!raw) return out;
  for (const pair of raw.split(",")) {
    const idx = pair.indexOf("=");
    if (idx <= 0) continue;
    const k = pair.slice(0, idx).trim();
    const v = pair.slice(idx + 1).trim();
    if (k) out[k] = v;
  }
  return out;
}

/**
 * SpanProcessor custom que enriquece cada span con el tenant context al
 * iniciarlo. Sin esto, los spans no tienen forma de ser filtrados por tenant
 * en el backend de observabilidad.
 */
class TenantContextSpanProcessor implements SpanProcessor {
  onStart(span: Span, _parentContext: Context): void {
    const ctx = getTenantContext();
    if (ctx) {
      span.setAttribute("tenant.id", ctx.tenantId);
      span.setAttribute("tenant.source", ctx.source);
      if (ctx.userId) span.setAttribute("enduser.id", ctx.userId);
      if (ctx.role) span.setAttribute("enduser.role", ctx.role);
    }
  }
  onEnd(_span: ReadableSpan): void {}
  shutdown(): Promise<void> { return Promise.resolve(); }
  forceFlush(): Promise<void> { return Promise.resolve(); }
}

export function initTelemetry(): void {
  if (sdk) return;
  if (!env.otelEnabled) return;

  const headers = parseHeaders(env.otelHeaders);

  const traceExporter = new OTLPTraceExporter({
    url: `${env.otelEndpoint.replace(/\/$/, "")}/v1/traces`,
    headers,
  });

  const metricExporter = new OTLPMetricExporter({
    url: `${env.otelEndpoint.replace(/\/$/, "")}/v1/metrics`,
    headers,
  });

  sdk = new NodeSDK({
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]: env.otelServiceName,
      [ATTR_SERVICE_VERSION]: env.sentryRelease || "0.0.0",
      [ATTR_DEPLOYMENT_ENVIRONMENT]: env.otelDeploymentEnv,
    }),
    traceExporter,
    metricReader: new PeriodicExportingMetricReader({
      exporter: metricExporter,
      exportIntervalMillis: 30_000,
    }),
    spanProcessors: [new TenantContextSpanProcessor()],
    instrumentations: [
      getNodeAutoInstrumentations({
        // Ruido: cada query DNS, cada fs.open. Los desactivamos.
        "@opentelemetry/instrumentation-fs": { enabled: false },
        "@opentelemetry/instrumentation-dns": { enabled: false },
        // El logger Pino se instrumenta para inyectar trace_id en cada log.
        "@opentelemetry/instrumentation-pino": { enabled: true },
      }),
    ],
  });

  sdk.start();

  // Shutdown limpio: flush de spans pendientes antes de salir.
  const shutdown = () => {
    sdk?.shutdown()
      .catch(() => { /* fire-and-forget */ })
      .finally(() => process.exit(0));
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

export const isTelemetryEnabled = (): boolean => !!sdk;
