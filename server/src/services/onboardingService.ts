import { prisma } from "../db/prisma.js";

export interface OnboardingStatus {
  profileComplete: boolean;
  intakeSubmitted: boolean;
  intakeApproved: boolean;
  membershipActive: boolean;
  hasAppointment: boolean;
  completionPercent: number;
  nextStep: string;
}

export const onboardingService = {
  async getStatus(userId: string): Promise<OnboardingStatus> {
    const [user, intake, membership, appointment] = await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        include: { profile: true },
      }),
      prisma.medicalIntake.findFirst({
        where: { userId },
        orderBy: { createdAt: "desc" },
      }),
      prisma.membership.findFirst({
        where: { userId },
        orderBy: { createdAt: "desc" },
      }),
      prisma.appointment.findFirst({
        where: { userId, status: { in: ["pending", "confirmed"] } },
      }),
    ]);

    const profile = user?.profile;
    const profileComplete = !!(
      profile?.firstName &&
      profile?.lastName &&
      profile?.phone &&
      profile?.dateOfBirth
    );

    const intakeSubmitted = !!(
      intake && ["submitted", "approved"].includes(intake.status)
    );
    const intakeApproved = intake?.status === "approved";
    const membershipActive = membership?.status === "active";
    const hasAppointment = !!appointment;

    const steps = [profileComplete, intakeSubmitted, intakeApproved, membershipActive, hasAppointment];
    const completed = steps.filter(Boolean).length;
    const completionPercent = Math.round((completed / steps.length) * 100);

    let nextStep = "complete_profile";
    if (profileComplete && !intakeSubmitted) nextStep = "submit_intake";
    else if (intakeSubmitted && !intakeApproved) nextStep = "await_intake_approval";
    else if (intakeApproved && !membershipActive) nextStep = "activate_membership";
    else if (membershipActive && !hasAppointment) nextStep = "book_appointment";
    else if (hasAppointment) nextStep = "all_done";

    return {
      profileComplete,
      intakeSubmitted,
      intakeApproved,
      membershipActive,
      hasAppointment,
      completionPercent,
      nextStep,
    };
  },
};
