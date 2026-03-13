import { prisma } from "../db/prisma";

export const getUserByEmail = (email: string) => prisma.user.findUnique({ where: { email } });

export const createUser = async (data: {
  email: string;
  passwordHash: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
}) => {
  return prisma.$transaction(async (tx) => {
    return tx.user.create({
      data: {
        email: data.email,
        passwordHash: data.passwordHash,
        profile: {
          create: {
            firstName: data.firstName,
            lastName: data.lastName,
            ...(data.phone ? { phone: data.phone } : {})
          }
        },
        memberships: {
          create: {}
        },
        medicalIntake: {
          create: {
            status: "draft"
          }
        },
        documents: {
          create: [
            { type: "informed_consent", version: "1.0" },
            { type: "privacy_notice", version: "1.0" },
            { type: "medical_history", version: "1.0" }
          ]
        }
      },
      include: { profile: true, memberships: true, medicalIntake: true }
    });
  });
};

export const updateProfile = async (userId: string, data: {
  firstName?: string;
  lastName?: string;
  phone?: string;
  timezone?: string;
}) => {
  return prisma.profile.upsert({
    where: { userId },
    create: { userId, ...data },
    update: data
  });
};

export const getUserWithRelations = (userId: string) =>
  prisma.user.findUnique({
    where: { id: userId },
    include: { profile: true, memberships: true, documents: true, medicalIntake: true }
  });
