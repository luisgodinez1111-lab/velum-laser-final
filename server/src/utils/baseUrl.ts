import { env } from "./env";

/**
 * Resolves the base URL for Stripe redirect URLs (success/cancel).
 * Reads from env.stripeCheckoutBaseUrl (STRIPE_CHECKOUT_BASE_URL).
 * Never reads from request headers to avoid SSRF via host header injection.
 */
export const resolveBaseUrl = (): string => {
  if (env.stripeCheckoutBaseUrl) return env.stripeCheckoutBaseUrl.replace(/\/+$/, "");
  return "https://velumlaser.com";
};
