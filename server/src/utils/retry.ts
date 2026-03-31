import { logger } from "./logger";

interface RetryOptions {
  maxAttempts: number;
  initialDelayMs: number;
  backoffFactor?: number;   // multiplicador de delay (default 2)
  maxDelayMs?: number;      // tope del delay (default 10s)
  context?: string;         // para logging
}

export const withRetry = async <T>(
  fn: () => Promise<T>,
  opts: RetryOptions
): Promise<T> => {
  let delay = opts.initialDelayMs;
  let lastErr: unknown;

  for (let attempt = 1; attempt <= opts.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt === opts.maxAttempts) break;
      logger.warn(
        { attempt, maxAttempts: opts.maxAttempts, delayMs: delay, context: opts.context, err },
        "[retry] Reintentando..."
      );
      await new Promise(r => setTimeout(r, delay));
      delay = Math.min(delay * (opts.backoffFactor ?? 2), opts.maxDelayMs ?? 10_000);
    }
  }
  throw lastErr;
};
