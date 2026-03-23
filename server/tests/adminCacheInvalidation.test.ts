import { describe, it, expect, vi, beforeEach } from "vitest";

process.env.JWT_SECRET = "test-secret-32-bytes-minimum-len";
process.env.DATABASE_URL = "postgresql://x:x@localhost/x";

vi.mock("../src/db/prisma", () => ({
  prisma: {
    user: {
      findMany: vi.fn().mockResolvedValue([
        { id: "admin1" },
        { id: "admin2" },
      ]),
    },
    notification: {
      createMany: vi.fn().mockResolvedValue({ count: 2 }),
    },
  },
}));

vi.mock("../src/utils/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("../src/services/notificationEmailService", () => ({
  sendAdminNotificationEmail: vi.fn().mockResolvedValue(undefined),
  sendNotificationEmail: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../src/services/emailService", () => ({
  sendAppointmentBookingEmail: vi.fn().mockResolvedValue(undefined),
  sendAppointmentCancellationEmail: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../src/utils/appointmentToken", () => ({
  generateAppointmentConfirmToken: vi.fn().mockReturnValue("token123"),
}));

vi.mock("../src/utils/env", () => ({
  env: {
    jwtSecret: "test-secret",
    databaseUrl: "postgresql://x",
    nodeEnv: "test",
    port: 3000,
    corsOrigin: "http://localhost:5173",
    uploadDir: "/tmp",
    stripeSecretKey: "",
    healthApiKey: "",
    appUrl: "http://localhost:3000",
  },
}));

import { notifyAdmins, invalidateAdminIdCache } from "../src/services/notificationService";
import { prisma } from "../src/db/prisma";

describe("notifyAdmins — admin ID cache", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    invalidateAdminIdCache(); // ensure clean cache state before each test
  });

  it("hace findMany solo en la primera llamada, segunda usa caché", async () => {
    await notifyAdmins("membership_activated", "Test notification");
    await notifyAdmins("membership_renewed", "Another notification");

    // findMany should only be called once — second call uses cached result
    expect(prisma.user.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.notification.createMany).toHaveBeenCalledTimes(2);
  });

  it("tras invalidateAdminIdCache vuelve a hacer findMany", async () => {
    await notifyAdmins("membership_activated", "First");
    invalidateAdminIdCache();
    await notifyAdmins("membership_renewed", "Second after invalidation");

    expect(prisma.user.findMany).toHaveBeenCalledTimes(2);
  });

  it("no crea notificaciones si no hay admins", async () => {
    vi.mocked(prisma.user.findMany).mockResolvedValueOnce([]);
    await notifyAdmins("membership_activated", "Test");
    expect(prisma.notification.createMany).not.toHaveBeenCalled();
  });
});
