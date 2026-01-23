import { describe, it, expect } from "vitest";
import { hashPassword, verifyPassword } from "../src/utils/auth";

process.env.JWT_SECRET = "test-secret";

describe("auth utils", () => {
  it("hashes and verifies password", async () => {
    const hash = await hashPassword("supersecurepassword");
    const ok = await verifyPassword("supersecurepassword", hash);
    expect(ok).toBe(true);
  });
});
