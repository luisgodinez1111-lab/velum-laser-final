import { describe, it, expect, vi } from "vitest";
import { requireRole } from "../src/middlewares/auth";

const mockRes = () => {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
};

describe("requireRole", () => {
  it("blocks when role missing", () => {
    const req: any = { user: { id: "1", role: "member" } };
    const res = mockRes();
    const next = vi.fn();

    requireRole(["admin"])(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it("allows when role matches", () => {
    const req: any = { user: { id: "1", role: "admin" } };
    const res = mockRes();
    const next = vi.fn();

    requireRole(["admin"])(req, res, next);

    expect(next).toHaveBeenCalled();
  });
});
