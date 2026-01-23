import { MembershipTier } from "../types";
import { apiFetch } from "./apiClient";

export const createSubscriptionCheckout = async (tier: MembershipTier): Promise<void> => {
  const response = await apiFetch<{ url: string }>("/membership/change-plan", {
    method: "POST",
    body: JSON.stringify({ priceId: tier.stripePriceId })
  });

  if (response.url) {
    window.location.href = response.url;
  }
};

export const redirectToCustomerPortal = async (): Promise<void> => {
  const response = await apiFetch<{ url: string }>("/membership/cancel", { method: "POST" });
  if (response.url) {
    window.location.href = response.url;
  }
};

export const checkSubscriptionStatus = async () => {
  return apiFetch("/membership/status");
};
