import { prisma } from "../db/prisma";

export const getUserByEmail = (email: string) => prisma.user.findUnique({ where: { email } });

export const createUser = async (data: {
  email: string;
  passwordHash: string;
  firstName?: string;
  lastName?: string;
}) => {
  return prisma.user.create({
    data: {
      email: data.email,
      passwordHash: data.passwordHash,
      profile: {
        create: {
          firstName: data.firstName,
          lastName: data.lastName
        }
      },
      memberships: {
        create: {}
      },
      documents: {
        create: [
          { type: "informed_consent", version: "1.0" },
          { type: "privacy_notice", version: "1.0" },
          { type: "medical_history", version: "1.0" }
        ]
      }
    },
    include: { profile: true, memberships: true }
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
    include: { profile: true, memberships: true, documents: true }
  });
