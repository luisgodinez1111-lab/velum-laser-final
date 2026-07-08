import { prisma } from "../src/db/prisma";
import { hashPassword } from "../src/utils/auth";

const ensureUser = async ({
  email,
  password,
  role,
  firstName,
  lastName,
  mustChangePassword = false
}: {
  email: string;
  password: string;
  role: "member" | "staff" | "admin" | "system";
  firstName: string;
  lastName: string;
  mustChangePassword?: boolean;
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
      mustChangePassword,
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
  const isProd = process.env.NODE_ENV === "production";

  // Admin: la contraseña SIEMPRE viene de env, sin fallback hardcodeado. Si
  // falta, se aborta el seed (nunca creamos una cuenta admin con contraseña
  // pública). Se fuerza el cambio en el primer login.
  const adminEmail = process.env.ADMIN_EMAIL ?? "admin@velum.mx";
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminPassword) {
    throw new Error("[seed] ADMIN_PASSWORD es obligatoria (sin contraseña por defecto). Configúrala antes de seedear.");
  }

  await ensureUser({
    email: adminEmail,
    password: adminPassword,
    role: "admin",
    firstName: "Admin",
    lastName: "Velum",
    mustChangePassword: true
  });

  // Cuentas demo (staff/system/member): SOLO fuera de producción y con
  // contraseñas de env (o una demo explícita en dev). En producción NO se
  // crean cuentas con credenciales de ejemplo.
  if (!isProd) {
    const demoPassword = process.env.SEED_DEMO_PASSWORD ?? "ChangeMe123456!";
    await ensureUser({
      email: "staff@velum.mx",
      password: process.env.STAFF_PASSWORD ?? demoPassword,
      role: "staff",
      firstName: "Staff",
      lastName: "Velum",
      mustChangePassword: true
    });

    await ensureUser({
      email: "system@velum.mx",
      password: process.env.SYSTEM_PASSWORD ?? demoPassword,
      role: "system",
      firstName: "System",
      lastName: "Velum",
      mustChangePassword: true
    });

    await ensureUser({
      email: "member@velum.mx",
      password: process.env.MEMBER_PASSWORD ?? demoPassword,
      role: "member",
      firstName: "Member",
      lastName: "Velum",
      mustChangePassword: true
    });
  }

  const policy = await prisma.agendaPolicy.findFirst();
  if (!policy) {
    await prisma.agendaPolicy.create({
      data: {
        timezone: "America/Chihuahua",
        slotMinutes: 30,
        autoConfirmHours: 12,
        noShowGraceMinutes: 30
      }
    });
  }

  const cabinsCount = await prisma.agendaCabin.count();
  if (cabinsCount === 0) {
    await prisma.agendaCabin.createMany({
      data: [
        { name: "Cabina 1", sortOrder: 1, isActive: true },
        { name: "Cabina 2", sortOrder: 2, isActive: true }
      ]
    });
  }

  const weeklyRulesCount = await prisma.agendaWeeklyRule.count();
  if (weeklyRulesCount === 0) {
    await prisma.agendaWeeklyRule.createMany({
      data: [
        { dayOfWeek: 0, isOpen: false, startHour: 9, endHour: 20 },
        { dayOfWeek: 1, isOpen: true, startHour: 9, endHour: 20 },
        { dayOfWeek: 2, isOpen: true, startHour: 9, endHour: 20 },
        { dayOfWeek: 3, isOpen: true, startHour: 9, endHour: 20 },
        { dayOfWeek: 4, isOpen: true, startHour: 9, endHour: 20 },
        { dayOfWeek: 5, isOpen: true, startHour: 9, endHour: 20 },
        { dayOfWeek: 6, isOpen: true, startHour: 9, endHour: 20 }
      ]
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
