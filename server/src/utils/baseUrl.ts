import { env } from "./env";
import { logger } from "./logger";

/**
 * Resuelve la URL base para redirects de Stripe (success/cancel).
 * Lee de env.stripeCheckoutBaseUrl (STRIPE_CHECKOUT_BASE_URL).
 * Nunca lee headers de request para evitar SSRF por host header injection.
 */
export const resolveBaseUrl = (): string => {
  if (env.stripeCheckoutBaseUrl) return env.stripeCheckoutBaseUrl.replace(/\/+$/, "");
  logger.warn("[baseUrl] STRIPE_CHECKOUT_BASE_URL no configurada — usando fallback hardcodeado");
  return "https://velumlaser.com";
};
