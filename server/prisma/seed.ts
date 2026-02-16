import { prisma } from "../src/db/prisma";
import { hashPassword } from "../src/utils/auth";

const ensureUser = async ({
  email,
  password,
  role,
  firstName,
  lastName
}: {
  email: string;
  password: string;
  role: "member" | "staff" | "admin" | "system";
  firstName: string;
  lastName: string;
}) => {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return existing;
  }

  return prisma.user.create({
    data: {
      email,
      passwordHash: await hashPassword(password),
      role,
      profile: {
        create: {
          firstName,
          lastName
        }
      },
      memberships: {
        create: {
          status: role === "member" ? "active" : "inactive"
        }
      },
      medicalIntake: {
        create: {
          status: role === "member" ? "submitted" : "draft",
          consentAccepted: role === "member",
          phototype: role === "member" ? 3 : null
        }
      }
    }
  });
};

const seed = async () => {
  const adminEmail = process.env.ADMIN_EMAIL ?? "admin@velum.mx";
  const adminPassword = process.env.ADMIN_PASSWORD ?? "ChangeMe123456!";

  await ensureUser({
    email: adminEmail,
    password: adminPassword,
    role: "admin",
    firstName: "Admin",
    lastName: "Velum"
  });

  await ensureUser({
    email: "staff@velum.mx",
    password: "ChangeMe123456!",
    role: "staff",
    firstName: "Staff",
    lastName: "Velum"
  });

  await ensureUser({
    email: "system@velum.mx",
    password: "ChangeMe123456!",
    role: "system",
    firstName: "System",
    lastName: "Velum"
  });

  await ensureUser({
    email: "member@velum.mx",
    password: "ChangeMe123456!",
    role: "member",
    firstName: "Member",
    lastName: "Velum"
  });
};

seed()
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
