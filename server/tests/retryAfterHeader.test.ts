import { describe, it, expect, vi } from "vitest";

process.env.JWT_SECRET = "test-secret-32-bytes-minimum-len";
process.env.DATABASE_URL = "postgresql://x:x@localhost/x";

vi.mock("../src/utils/env", () => ({
  env: {
    jwtSecret: "test-secret-32-bytes-minimum-len",
    jwtExpiresIn: "15m",
    cookieName: "velum_token",
    refreshCookieName: "velum_refresh",
    nodeEnv: "test",
    appUrl: "http://localhost",
    resendKeyVerification: "",
    resendKeyReset: "",
    resendKeyReminders: "",
    resendKeyAdmin: "",
    resendFromEmail: "noreply@test.com",
  },
  isProduction: false,
}));

vi.mock("../src/utils/auth", () => ({
  verifyPassword: vi.fn().mockResolvedValue(false),
  signToken: vi.fn().mockReturnValue("tok"),
  createRefreshToken: vi.fn().mockResolvedValue("raw"),
  rotateRefreshToken: vi.fn(), revokeRefreshToken: vi.fn(),
  revokeAllRefreshTokens: vi.fn(), hashPassword: vi.fn(),
  recordPasswordHistory: vi.fn(), isPasswordReused: vi.fn().mockResolvedValue(false),
}));

vi.mock("../src/services/userService", () => ({
  getUserByEmail: vi.fn().mockResolvedValue({
    id: "u1", email: "locktest@velum.mx", role: "member",
    passwordHash: "$fakehash", isActive: true,
  }),
  createUser: vi.fn(),
}));

vi.mock("../src/db/prisma", () => ({
  prisma: {
    auditLog: { create: vi.fn().mockResolvedValue({}) },
    refreshToken: { create: vi.fn().mockResolvedValue({ id: "rt1" }) },
  },
}));

vi.mock("../src/services/emailService", () => ({
  sendPasswordResetEmail: vi.fn(), sendEmailVerificationEmail: vi.fn(),
  sendWelcomeEmail: vi.fn(), sendPatientWelcomeEmail: vi.fn(),
}));

vi.mock("../src/services/authService", () => ({
  createEmailVerification: vi.fn(), createPasswordReset: vi.fn(),
  consumeEmailVerification: vi.fn(), consumePasswordReset: vi.fn(),
  createConsentOtp: vi.fn(), consumeConsentOtp: vi.fn(),
}));

vi.mock("../src/services/auditService", () => ({
  createAuditLog: vi.fn().mockResolvedValue({}),
}));

import { login, _forceLoginLockout, LOGIN_LOCKOUT_MS } from "../src/controllers/authController";

const makeReq = (email: string, password: string) => ({
  body: { email, password },
  ip: "127.0.0.1",
  socket: { remoteAddress: "127.0.0.1" },
  headers: {},
} as any);

const makeRes = () => {
  const res: any = {};
  res.headers = {} as Record<string, string>;
  res.statusCode = 200;
  res.body = null;
  res.set = (k: string, v: string) => { res.headers[k] = v; return res; };
  res.status = (code: number) => { res.statusCode = code; return res; };
  res.json = (body: any) => { res.body = body; return res; };
  res.cookie = vi.fn().mockReturnValue(res);
  return res;
};

describe("Login lockout — Retry-After header", () => {
  it("devuelve 429 con Retry-After cuando la cuenta está bloqueada", async () => {
    const TEST_EMAIL = "ratelimited@velum.mx";

    // Pre-populate the lockout state using the test helper
    _forceLoginLockout(TEST_EMAIL);

    const res = makeRes();
    await login(makeReq(TEST_EMAIL, "any-password"), res);

    expect(res.statusCode).toBe(429);
    expect(res.headers["Retry-After"]).toBeDefined();
    const retryAfter = parseInt(res.headers["Retry-After"], 10);
    expect(retryAfter).toBe(Math.ceil(LOGIN_LOCKOUT_MS / 1000)); // 900 seconds
  });
});
