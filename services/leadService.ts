import { apiFetch } from "./apiClient";

export interface LeadCaptureData {
  firstName: string;
  lastName?: string;
  email?: string;
  phone: string;
  source?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmContent?: string;
  utmTerm?: string;
  referrerUrl?: string;
}

export const leadService = {
  capture: (data: LeadCaptureData) =>
    apiFetch<{ id: string; message: string }>("/leads", {
      method: "POST",
      body: JSON.stringify(data)
    })
};
