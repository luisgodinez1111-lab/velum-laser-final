import { describe, it, expect, vi, beforeEach } from "vitest";

process.env.JWT_SECRET = "test-secret-32-bytes-minimum-len";
process.env.DATABASE_URL = "postgresql://x:x@localhost/x";

vi.mock("../src/db/prisma", () => ({
  prisma: {
    customCharge: {
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
  },
}));

import { expireCustomCharges } from "../src/services/integrationJobCleanupService";
import { prisma } from "../src/db/prisma";

describe("expireCustomCharges", () => {
  beforeEach(() => vi.clearAllMocks());

  it("expira cobros PENDING_ACCEPTANCE vencidos", async () => {
    vi.mocked(prisma.customCharge.updateMany)
      .mockResolvedValueOnce({ count: 3 })  // PENDING_ACCEPTANCE
      .mockResolvedValueOnce({ count: 0 });  // ACCEPTED

    await expireCustomCharges();

    expect(prisma.customCharge.updateMany).toHaveBeenCalledTimes(2);
    // First call must target PENDING_ACCEPTANCE
    const firstCall = vi.mocked(prisma.customCharge.updateMany).mock.calls[0][0];
    expect((firstCall as any).where.status).toBe("PENDING_ACCEPTANCE");
    expect((firstCall as any).data.status).toBe("EXPIRED");
  });

  it("expira cobros ACCEPTED con ventana de pago vencida (>2h)", async () => {
    vi.mocked(prisma.customCharge.updateMany)
      .mockResolvedValueOnce({ count: 0 })   // PENDING_ACCEPTANCE
      .mockResolvedValueOnce({ count: 2 });   // ACCEPTED

    await expireCustomCharges();

    const secondCall = vi.mocked(prisma.customCharge.updateMany).mock.calls[1][0];
    expect((secondCall as any).where.status).toBe("ACCEPTED");
    expect((secondCall as any).data.status).toBe("EXPIRED");
    // acceptedAt filter must be present
    expect((secondCall as any).where.acceptedAt).toBeDefined();
  });

  it("no lanza error cuando updateMany falla", async () => {
    vi.mocked(prisma.customCharge.updateMany).mockRejectedValue(new Error("DB error"));
    await expect(expireCustomCharges()).resolves.not.toThrow();
  });
});
