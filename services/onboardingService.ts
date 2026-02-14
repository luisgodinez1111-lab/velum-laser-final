import { apiFetch } from "./apiClient";

export interface OnboardingStatusData {
  profileComplete: boolean;
  intakeSubmitted: boolean;
  intakeApproved: boolean;
  membershipActive: boolean;
  hasAppointment: boolean;
  completionPercent: number;
  nextStep: string;
}

export const onboardingServiceFe = {
  getStatus: () => apiFetch<OnboardingStatusData>("/me/onboarding"),
};
