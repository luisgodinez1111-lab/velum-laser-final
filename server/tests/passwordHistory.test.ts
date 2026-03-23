import { describe, it, expect, vi, beforeEach } from "vitest";

process.env.JWT_SECRET = "test-secret-32-bytes-minimum-len";
process.env.DATABASE_URL = "postgresql://x:x@localhost/x";

vi.mock("../src/db/prisma", () => ({
  prisma: {
    passwordHistory: {
      findMany: vi.fn(),
      create: vi.fn(),
      deleteMany: vi.fn(),
    },
  },
}));

import { recordPasswordHistory, isPasswordReused, hashPassword } from "../src/utils/auth";

// Access mock after import via dynamic import helper
const getMocks = async () => {
  const { prisma } = await import("../src/db/prisma");
  // Cast to bypass TS — PasswordHistory not in generated client yet
  return (prisma as any).passwordHistory as {
    findMany: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    deleteMany: ReturnType<typeof vi.fn>;
  };
};

describe("isPasswordReused", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns false when no history exists", async () => {
    const m = await getMocks();
    m.findMany.mockResolvedValue([]);
    const result = await isPasswordReused("user1", "NewPass@123!");
    expect(result).toBe(false);
  });

  it("returns true when password matches a recent hash", async () => {
    const m = await getMocks();
    const hash = await hashPassword("OldPass@123!");
    m.findMany.mockResolvedValue([
      { id: "ph1", userId: "user1", passwordHash: hash, createdAt: new Date() },
    ]);
    const result = await isPasswordReused("user1", "OldPass@123!");
    expect(result).toBe(true);
  });

  it("returns false when password does not match any recent hash", async () => {
    const m = await getMocks();
    const hash = await hashPassword("OldPass@123!");
    m.findMany.mockResolvedValue([
      { id: "ph1", userId: "user1", passwordHash: hash, createdAt: new Date() },
    ]);
    const result = await isPasswordReused("user1", "DifferentPass@456!");
    expect(result).toBe(false);
  });
});

describe("recordPasswordHistory", () => {
  beforeEach(() => vi.clearAllMocks());

  it("creates a history entry and prunes old entries when > 5 exist", async () => {
    const m = await getMocks();
    const sixOldEntries = Array.from({ length: 6 }, (_, i) => ({
      id: `ph${i}`,
      userId: "user1",
      passwordHash: `hash${i}`,
      createdAt: new Date(Date.now() - i * 1000),
    }));
    m.findMany.mockResolvedValue(sixOldEntries);
    m.create.mockResolvedValue({ id: "phnew" });
    m.deleteMany.mockResolvedValue({ count: 1 });

    await recordPasswordHistory("user1", "hash-new");
    expect(m.create).toHaveBeenCalledOnce();
    expect(m.deleteMany).toHaveBeenCalledOnce();
  });

  it("does not prune when within depth limit", async () => {
    const m = await getMocks();
    m.findMany.mockResolvedValue([
      { id: "ph1", userId: "user1", passwordHash: "h1", createdAt: new Date() },
    ]);
    m.create.mockResolvedValue({ id: "phnew" });
    m.deleteMany.mockResolvedValue({ count: 0 });

    await recordPasswordHistory("user1", "hash-new");
    expect(m.create).toHaveBeenCalledOnce();
    expect(m.deleteMany).not.toHaveBeenCalled();
  });
});
