const asString = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

/**
 * Resolves the base URL for Stripe redirect URLs (success/cancel).
 * Reads exclusively from STRIPE_CHECKOUT_BASE_URL env var.
 * Never reads from request headers to avoid SSRF via host header injection.
 */
export const resolveBaseUrl = (): string => {
  const fromEnv = asString(process.env.STRIPE_CHECKOUT_BASE_URL);
  if (fromEnv) return fromEnv.replace(/\/+$/, "");
  return "https://velumlaser.com";
};
