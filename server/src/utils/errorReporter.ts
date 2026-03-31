/**
 * errorReporter.ts — Configurable error reporting
 *
 * Works without any external package:
 *   - Logs via Pino (always)
 *   - Sends to ERROR_WEBHOOK_URL if set (Slack, Discord, or any webhook)
 *   - Rate-limited to 10 reports/minute to prevent flooding
 *
 * To integrate Sentry in the future:
 *   npm install @sentry/node
 *   import * as Sentry from "@sentry/node";
 *   Sentry.init({ dsn: process.env.SENTRY_DSN });
 *   Sentry.captureException(err);   ← add inside reportError()
 */
import { env } from "./env";
import { logger } from "./logger";

const RATE_LIMIT_PER_MIN = 10;
let recentCount = 0;

setInterval(() => { recentCount = 0; }, 60_000).unref();

export const reportError = (err: Error, context?: Record<string, unknown>): void => {
  logger.error({ err, ...context }, "[error-reporter] Unhandled error");

  const webhookUrl = env.errorWebhookUrl;
  if (!webhookUrl || recentCount >= RATE_LIMIT_PER_MIN) return;
  recentCount++;

  const body = JSON.stringify({
    text: `🚨 *Velum Laser API — Error*\n\`${err.message.slice(0, 300)}\``,
    attachments: [
      {
        color: "danger",
        fields: [
          { title: "Environment", value: env.nodeEnv, short: true },
          { title: "Time", value: new Date().toISOString(), short: true },
          { title: "Stack", value: (err.stack ?? "").slice(0, 800), short: false },
          { title: "Context", value: JSON.stringify(context ?? {}), short: false },
        ],
      },
    ],
  });

  // fire-and-forget — never throw
  fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  }).catch(() => {});
};
