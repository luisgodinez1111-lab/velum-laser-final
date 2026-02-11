import { apiFetch } from "./apiClient";

export interface IntakeData {
  id: string;
  userId: string;
  status: "draft" | "submitted" | "approved" | "rejected";
  fitzpatrickType?: string;
  questionnaire: Record<string, unknown>;
  contraindications: string[];
  contraindicationNotes?: string;
  signatureKey?: string;
  signedAt?: string;
  reviewedAt?: string;
  reviewNotes?: string;
  reviewedBy?: { profile?: { firstName?: string; lastName?: string } };
  createdAt: string;
  updatedAt: string;
}

export const intakeService = {
  getMyIntake: () => apiFetch<IntakeData | null>("/intake"),

  saveDraft: (data: {
    fitzpatrickType?: string;
    questionnaire?: Record<string, unknown>;
    contraindications?: string[];
    contraindicationNotes?: string;
  }) =>
    apiFetch<IntakeData>("/intake", {
      method: "POST",
      body: JSON.stringify(data)
    }),

  submit: () =>
    apiFetch<IntakeData>("/intake/submit", { method: "POST" }),

  sign: (signature: string) =>
    apiFetch<IntakeData>("/intake/sign", {
      method: "POST",
      body: JSON.stringify({ signature })
    })
};
