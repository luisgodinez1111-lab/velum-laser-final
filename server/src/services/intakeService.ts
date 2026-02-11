import { prisma } from "../db/prisma";
import { IntakeStatus } from "@prisma/client";

export const getLatestIntake = (userId: string) =>
  prisma.medicalIntake.findFirst({
    where: { userId },
    orderBy: { createdAt: "desc" }
  });

export const getIntakeById = (id: string) =>
  prisma.medicalIntake.findUnique({
    where: { id },
    include: {
      user: { include: { profile: true } },
      reviewedBy: { include: { profile: true } }
    }
  });

export const saveIntakeDraft = async (
  userId: string,
  data: {
    fitzpatrickType?: string;
    questionnaire?: Record<string, unknown>;
    contraindications?: string[];
    contraindicationNotes?: string;
  }
) => {
  const existing = await prisma.medicalIntake.findFirst({
    where: { userId, status: { in: ["draft", "rejected"] } },
    orderBy: { createdAt: "desc" }
  });

  if (existing) {
    return prisma.medicalIntake.update({
      where: { id: existing.id },
      data: {
        ...data,
        status: "draft"
      }
    });
  }

  return prisma.medicalIntake.create({
    data: {
      userId,
      ...data
    }
  });
};

export const submitIntake = async (userId: string) => {
  const intake = await prisma.medicalIntake.findFirst({
    where: { userId, status: "draft" },
    orderBy: { createdAt: "desc" }
  });
  if (!intake) return null;

  return prisma.medicalIntake.update({
    where: { id: intake.id },
    data: { status: "submitted" }
  });
};

export const signIntake = async (userId: string, signatureKey: string) => {
  const intake = await prisma.medicalIntake.findFirst({
    where: { userId, status: { in: ["draft", "submitted"] } },
    orderBy: { createdAt: "desc" }
  });
  if (!intake) return null;

  return prisma.medicalIntake.update({
    where: { id: intake.id },
    data: { signatureKey, signedAt: new Date() }
  });
};

export const listIntakes = (status?: IntakeStatus) =>
  prisma.medicalIntake.findMany({
    where: status ? { status } : undefined,
    include: {
      user: { include: { profile: true } },
      reviewedBy: { include: { profile: true } }
    },
    orderBy: { createdAt: "desc" }
  });

export const reviewIntake = async (
  intakeId: string,
  reviewerId: string,
  decision: "approved" | "rejected",
  notes?: string
) => {
  return prisma.medicalIntake.update({
    where: { id: intakeId },
    data: {
      status: decision,
      reviewedByUserId: reviewerId,
      reviewedAt: new Date(),
      reviewNotes: notes
    }
  });
};
