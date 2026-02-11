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

  // Seed default schedule config (Mon-Sat, 09:00-19:00, 60min slots)
  const defaultSchedule = [
    { dayOfWeek: 1, startTime: "09:00", endTime: "19:00", slotDurationMin: 60, maxSlots: 10, isActive: true },
    { dayOfWeek: 2, startTime: "09:00", endTime: "19:00", slotDurationMin: 60, maxSlots: 10, isActive: true },
    { dayOfWeek: 3, startTime: "09:00", endTime: "19:00", slotDurationMin: 60, maxSlots: 10, isActive: true },
    { dayOfWeek: 4, startTime: "09:00", endTime: "19:00", slotDurationMin: 60, maxSlots: 10, isActive: true },
    { dayOfWeek: 5, startTime: "09:00", endTime: "19:00", slotDurationMin: 60, maxSlots: 10, isActive: true },
    { dayOfWeek: 6, startTime: "09:00", endTime: "15:00", slotDurationMin: 60, maxSlots: 8, isActive: true },
    { dayOfWeek: 0, startTime: "09:00", endTime: "14:00", slotDurationMin: 60, maxSlots: 5, isActive: false }
  ];

  for (const config of defaultSchedule) {
    await prisma.scheduleConfig.upsert({
      where: { dayOfWeek: config.dayOfWeek },
      update: {},
      create: config
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
