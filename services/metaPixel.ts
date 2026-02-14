import { apiFetch } from "./apiClient";

// Helper to get fbp and fbc cookies
const getFbCookies = () => {
  const cookies = document.cookie.split(";").reduce(
    (acc, c) => {
      const [key, val] = c.trim().split("=");
      if (key) acc[key] = val || "";
      return acc;
    },
    {} as Record<string, string>
  );
  return { fbp: cookies["_fbp"], fbc: cookies["_fbc"] };
};

// Track server-side event via our API
const trackServerEvent = async (
  eventName: string,
  customData?: Record<string, unknown>,
  userId?: string,
  leadId?: string
) => {
  try {
    const { fbp, fbc } = getFbCookies();
    await apiFetch("/marketing/events", {
      method: "POST",
      body: JSON.stringify({
        eventName,
        userId,
        leadId,
        fbp,
        fbc,
        sourceUrl: window.location.href,
        customData
      })
    });
  } catch {
    // Non-critical, don't break UX
  }
};

// Track client-side fbq event (if Meta Pixel is loaded)
const trackClientEvent = (eventName: string, params?: Record<string, unknown>) => {
  if (typeof window !== "undefined" && (window as any).fbq) {
    (window as any).fbq("track", eventName, params);
  }
};

// Combined tracker: fires both client + server events
export const metaPixel = {
  // Lead form submission
  trackLead: (leadId?: string) => {
    trackClientEvent("Lead");
    trackServerEvent("Lead", undefined, undefined, leadId);
  },

  // User registration
  trackRegistration: (userId?: string) => {
    trackClientEvent("CompleteRegistration");
    trackServerEvent("CompleteRegistration", undefined, userId);
  },

  // Appointment booking
  trackSchedule: (userId?: string, appointmentType?: string) => {
    trackClientEvent("Schedule", { content_category: appointmentType });
    trackServerEvent("Schedule", { content_category: appointmentType }, userId);
  },

  // Page view (custom)
  trackPageView: () => {
    trackClientEvent("PageView");
  },

  // Generic custom event
  trackCustom: (eventName: string, params?: Record<string, unknown>) => {
    trackClientEvent(eventName, params);
    trackServerEvent(eventName, params);
  }
};
