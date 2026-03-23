import { describe, it, expect, vi, beforeEach } from "vitest";

process.env.JWT_SECRET = "test-secret-32-bytes-minimum-len";
process.env.DATABASE_URL = "postgresql://x:x@localhost/x";

vi.mock("../src/db/prisma", () => ({
  prisma: {
    notification: {
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    integrationJob: {
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    webhookEvent: {
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    customCharge: {
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    refreshToken: {
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    $queryRaw: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock("../src/utils/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("../src/services/notificationEmailService", () => ({
  sendAdminNotificationEmail: vi.fn().mockResolvedValue(undefined),
}));

import { pruneOldNotifications } from "../src/services/integrationJobCleanupService";
import { prisma } from "../src/db/prisma";

describe("pruneOldNotifications", () => {
  beforeEach(() => vi.clearAllMocks());

  it("borra solo notificaciones leídas con cutoff de 90 días", async () => {
    vi.mocked(prisma.notification.deleteMany).mockResolvedValueOnce({ count: 5 });

    await pruneOldNotifications();

    expect(prisma.notification.deleteMany).toHaveBeenCalledTimes(1);
    const call = vi.mocked(prisma.notification.deleteMany).mock.calls[0][0] as any;
    expect(call.where.read).toBe(true);
    expect(call.where.createdAt.lte).toBeInstanceOf(Date);
    // cutoff must be approximately 90 days ago
    const cutoffMs = call.where.createdAt.lte.getTime();
    const expectedMs = Date.now() - 90 * 86400000;
    expect(Math.abs(cutoffMs - expectedMs)).toBeLessThan(5000); // within 5 seconds
  });

  it("no lanza si deleteMany devuelve 0", async () => {
    vi.mocked(prisma.notification.deleteMany).mockResolvedValueOnce({ count: 0 });
    await expect(pruneOldNotifications()).resolves.not.toThrow();
    expect(prisma.notification.deleteMany).toHaveBeenCalledTimes(1);
  });

  it("no lanza si la DB falla", async () => {
    vi.mocked(prisma.notification.deleteMany).mockRejectedValueOnce(new Error("DB error"));
    await expect(pruneOldNotifications()).resolves.not.toThrow();
  });
});
