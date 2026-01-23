import { prisma } from "../src/db/prisma";
import { hashPassword } from "../src/utils/auth";

const seed = async () => {
  const email = process.env.ADMIN_EMAIL ?? "admin@velum.mx";
  const password = process.env.ADMIN_PASSWORD ?? "ChangeMe123456!";

  const existing = await prisma.user.findUnique({ where: { email } });
  if (!existing) {
    await prisma.user.create({
      data: {
        email,
        passwordHash: await hashPassword(password),
        role: "admin",
        profile: { create: { firstName: "Admin", lastName: "Velum" } },
        memberships: { create: {} }
      }
    });
  }
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
