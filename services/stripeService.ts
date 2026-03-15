import { MembershipTier } from "../types";
import { apiFetch } from "./apiClient";

export const createSubscriptionCheckout = async (tier: MembershipTier): Promise<void> => {
  // El planCode es el nombre del plan en minúsculas (essential, select, advance, progress, signature)
  // El admin configura los stripePriceId reales desde Admin → Stripe → Planes
  const planCode = tier.name.toLowerCase();
  const response = await apiFetch<{ checkoutUrl: string }>("/v1/billing/checkout", {
    method: "POST",
    body: JSON.stringify({ planCode })
  });

  if (response.checkoutUrl) {
    window.location.href = response.checkoutUrl;
  }
};

export const redirectToCustomerPortal = async (): Promise<void> => {
  // POST /api/v1/billing/portal — implementado en billingCheckoutRoutes
  const response = await apiFetch<{ url: string }>("/v1/billing/portal", { method: "POST" });
  if (response.url) {
    window.location.href = response.url;
  }
};

export const checkSubscriptionStatus = async () => {
  return apiFetch("/membership/status");
};

export const stripeService = {
  createAppointmentDeposit: async (payload: { startAt: string; endAt: string; reason?: string; cabinId?: string; treatmentId?: string }): Promise<string> => {
    const data = await apiFetch<{ checkoutUrl: string }>("/v1/billing/appointment-deposit", {
      method: "POST",
      body: JSON.stringify(payload)
    });
    return data.checkoutUrl;
  },
};
