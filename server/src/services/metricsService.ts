/**
 * metricsService — Métricas in-memory sin dependencias externas.
 * Expone contadores, histogramas simples y estadísticas de negocio.
 * Endpoint: GET /api/v1/health/metrics (requiere health key o admin)
 */

type Labels = Record<string, string>;

const counters  = new Map<string, number>();
const gauges    = new Map<string, number>();
const latencies = new Map<string, number[]>(); // últimas N mediciones
const MAX_LATENCY_SAMPLES = 200;

// ── API pública ───────────────────────────────────────────────────────

/** Incrementa un contador. ej: inc("http_requests", { method:"POST", status:"200" }) */
export const inc = (name: string, labels: Labels = {}): void => {
  const key = serializeKey(name, labels);
  counters.set(key, (counters.get(key) ?? 0) + 1);
};

/** Registra un valor de latencia en ms. */
export const recordLatency = (name: string, ms: number): void => {
  if (!latencies.has(name)) latencies.set(name, []);
  const arr = latencies.get(name)!;
  arr.push(ms);
  if (arr.length > MAX_LATENCY_SAMPLES) arr.shift();
};

/** Actualiza un gauge (valor puntual). */
export const setGauge = (name: string, value: number): void => {
  gauges.set(name, value);
};

/** Retorna snapshot completo para el endpoint de métricas. */
export const getSnapshot = () => {
  const httpReqs: Record<string, number> = {};
  const stripeEvents: Record<string, number> = {};
  const emailsSent: Record<string, number> = {};
  const errors: Record<string, number> = {};

  for (const [key, value] of counters.entries()) {
    if (key.startsWith("http_req|"))      httpReqs[key.replace("http_req|", "")]         = value;
    else if (key.startsWith("stripe|"))   stripeEvents[key.replace("stripe|", "")]       = value;
    else if (key.startsWith("email|"))    emailsSent[key.replace("email|", "")]           = value;
    else if (key.startsWith("error|"))    errors[key.replace("error|", "")]               = value;
  }

  const latencyStats: Record<string, object> = {};
  for (const [name, samples] of latencies.entries()) {
    if (samples.length === 0) continue;
    const sorted = [...samples].sort((a, b) => a - b);
    latencyStats[name] = {
      count: samples.length,
      p50: percentile(sorted, 50),
      p95: percentile(sorted, 95),
      p99: percentile(sorted, 99),
      avg: Math.round(samples.reduce((a, b) => a + b, 0) / samples.length),
    };
  }

  return {
    uptime:       Math.floor(process.uptime()),
    memory:       { heapMB: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) },
    counters:     { httpRequests: httpReqs, stripeEvents, emailsSent, errors },
    latencies:    latencyStats,
    gauges:       Object.fromEntries(gauges),
    timestamp:    new Date().toISOString(),
  };
};

// ── Helpers ───────────────────────────────────────────────────────────
const serializeKey = (name: string, labels: Labels): string =>
  Object.keys(labels).length === 0
    ? name
    : `${name}|${Object.entries(labels).map(([k, v]) => `${k}=${v}`).sort().join(",")}`;

const percentile = (sorted: number[], p: number): number =>
  sorted[Math.floor((p / 100) * (sorted.length - 1))] ?? 0;
