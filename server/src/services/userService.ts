import { prisma } from "../db/prisma";
import { withTenantContext } from "../db/withTenantContext";
import { getTenantIdOr } from "../utils/tenantContext";
import { env } from "../utils/env";

export const getUserByEmail = (email: string) =>
  withTenantContext(async (tx) => tx.user.findUnique({ where: { email } }));

export const createUser = async (data: {
  email: string;
  passwordHash: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  birthDate?: string;
}) => {
  return withTenantContext(async (tx) => {
    const tenantId = getTenantIdOr(env.defaultClinicId);
    return tx.user.create({
      data: {
        email: data.email,
        passwordHash: data.passwordHash,
        profile: {
          create: {
            firstName: data.firstName,
            lastName: data.lastName,
            ...(data.phone ? { phone: data.phone } : {}),
            ...(data.birthDate ? { birthDate: new Date(data.birthDate) } : {}),
            tenantId,
          }
        },
        memberships: {
          create: { tenantId }
        },
        medicalIntake: {
          create: {
            status: "draft",
            tenantId,
          }
        },
        documents: {
          create: [
            { type: "informed_consent", version: "1.0", tenantId },
            { type: "privacy_notice",   version: "1.0", tenantId },
            { type: "medical_history",  version: "1.0", tenantId },
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
    create: { userId, ...data, tenantId: getTenantIdOr(env.defaultClinicId) },
    update: data
  });
};

export const getUserWithRelations = (userId: string) =>
  withTenantContext(async (tx) =>
    tx.user.findUnique({
      where: { id: userId },
      include: { profile: true, memberships: true, documents: true, medicalIntake: true }
    })
  );
