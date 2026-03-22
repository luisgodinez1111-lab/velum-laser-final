import { describe, it, expect, vi } from "vitest";

process.env.JWT_SECRET = "test-secret-32-bytes-minimum-len";
process.env.DATABASE_URL = "postgresql://x:x@localhost/x";

// Mock Prisma to avoid real DB connection
vi.mock("../src/db/prisma", () => ({
  prisma: {
    sessionTreatment: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    auditLog: { create: vi.fn() },
  },
}));

vi.mock("../src/services/auditService", () => ({
  createAuditLog: vi.fn(),
}));

import { prisma } from "../src/db/prisma";

const mockRes = () => {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
};

describe("addSessionFeedback — control de acceso", () => {
  it("permite al dueño de la sesión editar su propio feedback", async () => {
    const { addSessionFeedback } = await import("../src/controllers/v1SessionController");

    vi.mocked(prisma.sessionTreatment.findUnique).mockResolvedValue({
      id: "s1",
      userId: "u1",
      staffUserId: "staff1",
    } as any);
    vi.mocked(prisma.sessionTreatment.update).mockResolvedValue({ id: "s1", memberFeedback: "muy bien" } as any);

    const req: any = {
      params: { sessionId: "s1" },
      body: { memberFeedback: "muy bien" },
      user: { id: "u1", role: "member" },
      ip: "127.0.0.1",
    };
    const res = mockRes();

    await addSessionFeedback(req, res);
    expect(res.status).not.toHaveBeenCalledWith(403);
    expect(prisma.sessionTreatment.update).toHaveBeenCalled();
  });

  it("bloquea a usuario que no es dueño ni staff", async () => {
    const { addSessionFeedback } = await import("../src/controllers/v1SessionController");

    vi.mocked(prisma.sessionTreatment.findUnique).mockResolvedValue({
      id: "s2",
      userId: "owner",
      staffUserId: "staff1",
    } as any);

    const req: any = {
      params: { sessionId: "s2" },
      body: { memberFeedback: "hola" },
      user: { id: "intruder", role: "member" },
      ip: "127.0.0.1",
    };
    const res = mockRes();

    await addSessionFeedback(req, res);
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it("permite a staff editar cualquier sesión", async () => {
    const { addSessionFeedback } = await import("../src/controllers/v1SessionController");

    vi.mocked(prisma.sessionTreatment.findUnique).mockResolvedValue({
      id: "s3",
      userId: "someUser",
      staffUserId: "staff1",
    } as any);
    vi.mocked(prisma.sessionTreatment.update).mockResolvedValue({ id: "s3" } as any);

    const req: any = {
      params: { sessionId: "s3" },
      body: { memberFeedback: "corrección staff" },
      user: { id: "staff99", role: "staff" },
      ip: "127.0.0.1",
    };
    const res = mockRes();

    await addSessionFeedback(req, res);
    expect(res.status).not.toHaveBeenCalledWith(403);
  });
});
