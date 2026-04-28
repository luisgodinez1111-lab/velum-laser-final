import Stripe from "stripe";
import { env } from "../utils/env";
import { prisma } from "../db/prisma";
import { withTenantContext } from "../db/withTenantContext";
import { logger } from "../utils/logger";

let _stripe: Stripe | null = null;

export const getStripe = (): Stripe => {
  if (_stripe) return _stripe;
  if (!env.stripeSecretKey) {
    throw new Error("STRIPE_SECRET_KEY is required para operaciones de pago");
  }
  _stripe = new Stripe(env.stripeSecretKey, { apiVersion: "2024-06-20", typescript: true });
  return _stripe;
};

// Re-exportar alias para compatibilidad con imports existentes
export const stripe = new Proxy({} as Stripe, {
  get(_target, prop) {
    return (getStripe() as unknown as Record<string | symbol, unknown>)[prop];
  },
});

export const ensureCustomer = async (userId: string, email: string) => {
  const user = await withTenantContext((tx) => tx.user.findUnique({ where: { id: userId } }));
  if (!user) {
    throw new Error("Usuario no encontrado");
  }
  if (user.stripeCustomerId) {
    return user.stripeCustomerId;
  }
  const customer = await stripe.customers.create({
    email,
    metadata: { userId }
  });
  await withTenantContext((tx) =>
    tx.user.update({ where: { id: userId }, data: { stripeCustomerId: customer.id } })
  );
  return customer.id;
};

export const createCheckoutSession = async ({
  customerId,
  priceId,
  successUrl,
  cancelUrl
}: {
  customerId: string;
  priceId: string;
  successUrl: string;
  cancelUrl: string;
}) => {
  return stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    allow_promotion_codes: true,
    success_url: successUrl,
    cancel_url: cancelUrl
  });
};

export const createCustomerPortal = async (customerId: string) => {
  return stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: env.stripePortalReturnUrl
  });
};
