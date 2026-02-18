import { apiFetch } from "./apiClient";

export type GoogleEventFormatMode = "complete" | "private";

export interface GoogleCalendarIntegrationStatus {
  connected: boolean;
  email: string | null;
  calendarId: string | null;
  eventFormatMode: GoogleEventFormatMode;
  lastSyncAt: string | null;
  watchExpiration: string | null;
}

export const googleCalendarIntegrationService = {
  getStatus: async () => {
    return apiFetch<GoogleCalendarIntegrationStatus>("/integrations/google-calendar/status");
  },

  connect: async () => {
    return apiFetch<{ url: string }>("/integrations/google-calendar/connect", {
      method: "POST",
      body: JSON.stringify({})
    });
  },

  disconnect: async () => {
    return apiFetch<{ disconnected: boolean }>("/integrations/google-calendar/disconnect", {
      method: "POST",
      body: JSON.stringify({})
    });
  },

  updateSettings: async (eventFormatMode: GoogleEventFormatMode) => {
    return apiFetch<{ eventFormatMode: GoogleEventFormatMode }>("/integrations/google-calendar/settings", {
      method: "PATCH",
      body: JSON.stringify({ eventFormatMode })
    });
  }
};
