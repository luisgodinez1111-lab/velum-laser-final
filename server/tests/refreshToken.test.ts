/**
 * Héctor Vidal — Tests refresh token
 * Cubre: happy path (rotación completa), sin cookie, token expirado/rotado,
 * usuario inactivo y usuario eliminado.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import cookieParser from "cookie-parser";
import request from "supertest";

process.env.JWT_SECRET = "test-secret-32-bytes-minimum-len!!";
process.env.DATABASE_URL = "postgresql://x:x@localhost/x";
process.env.INTEGRATIONS_ENC_KEY = "test-integrations-key-32-bytes!!";

// Hoisted mocks so they're available in vi.mock factories
const { mockRotateRefreshToken, mockRevokeAllRefreshTokens, mockUserFindUnique } =
  vi.hoisted(() => ({
    mockRotateRefreshToken:    vi.fn(),
    mockRevokeAllRefreshTokens: vi.fn(),
    mockUserFindUnique:        vi.fn(),
  }));

vi.mock("../src/utils/auth", async (importOriginal) => {
  const real = await importOriginal<typeof import("../src/utils/auth")>();
  return {
    ...real,
    rotateRefreshToken:    mockRotateRefreshToken,
    revokeAllRefreshTokens: mockRevokeAllRefreshTokens,
  };
});

vi.mock("../src/db/prisma", () => ({
  prisma: {
    user:     { findUnique: mockUserFindUnique },
    auditLog: { create: vi.fn() },
  },
}));

vi.mock("../src/services/notificationService", () => ({
  onNewMember: vi.fn(),
}));

import { refreshToken } from "../src/controllers/authController";

const REFRESH_COOKIE = "velum_refresh";
const ACCESS_COOKIE  = "velum_token";
const FAKE_REFRESH   = "fake-raw-refresh-token-abc";

const buildApp = () => {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.post("/auth/refresh", refreshToken);
  return app;
};

const activeUser = {
  id:       "user-abc-123",
  email:    "lucia@velumlaser.com",
  role:     "member" as const,
  isActive: true,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockRevokeAllRefreshTokens.mockResolvedValue(undefined);
});

describe("POST /auth/refresh — happy path", () => {
  it("rota el token y devuelve nuevo access token + nuevo refresh cookie (200)", async () => {
    const newRaw = "brand-new-raw-refresh-token-xyz";
    mockRotateRefreshToken.mockResolvedValue({ userId: activeUser.id, newRaw });
    mockUserFindUnique.mockResolvedValue(activeUser);

    const res = await request(buildApp())
      .post("/auth/refresh")
      .set("Cookie", `${REFRESH_COOKIE}=${FAKE_REFRESH}`);

    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({
      id:    activeUser.id,
      email: activeUser.email,
      role:  activeUser.role,
    });

    const cookies: string[] = (res.headers["set-cookie"] as string[] | undefined) ?? [];
    expect(cookies.some((c) => c.startsWith(ACCESS_COOKIE + "="))).toBe(true);
    expect(cookies.some((c) => c.startsWith(REFRESH_COOKIE + "="))).toBe(true);
    expect(mockRotateRefreshToken).toHaveBeenCalledWith(FAKE_REFRESH);
    expect(mockUserFindUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: activeUser.id } })
    );
  });
});

describe("POST /auth/refresh — errores", () => {
  it("devuelve 401 cuando no hay cookie de refresh", async () => {
    const res = await request(buildApp()).post("/auth/refresh");

    expect(res.status).toBe(401);
    expect(res.body.message).toMatch(/sesión/i);
    expect(mockRotateRefreshToken).not.toHaveBeenCalled();
  });

  it("devuelve 401 cuando el token está expirado (rotateRefreshToken → null)", async () => {
    mockRotateRefreshToken.mockResolvedValue(null);

    const res = await request(buildApp())
      .post("/auth/refresh")
      .set("Cookie", `${REFRESH_COOKIE}=token-expirado`);

    expect(res.status).toBe(401);
    expect(res.body.message).toMatch(/sesión expirada/i);
    expect(mockUserFindUnique).not.toHaveBeenCalled();
  });

  it("devuelve 401 cuando el token ya fue rotado (replay detectado → null)", async () => {
    mockRotateRefreshToken.mockResolvedValue(null);

    const res = await request(buildApp())
      .post("/auth/refresh")
      .set("Cookie", `${REFRESH_COOKIE}=token-ya-usado`);

    expect(res.status).toBe(401);
    expect(res.body.message).toBeTruthy();
    expect(mockUserFindUnique).not.toHaveBeenCalled();
  });

  it("devuelve 401 y revoca todos los tokens cuando el usuario está inactivo", async () => {
    const inactiveId = "user-inactive-999";
    mockRotateRefreshToken.mockResolvedValue({ userId: inactiveId, newRaw: "x" });
    mockUserFindUnique.mockResolvedValue({
      id:       inactiveId,
      email:    "inactivo@velumlaser.com",
      role:     "member",
      isActive: false,
    });

    const res = await request(buildApp())
      .post("/auth/refresh")
      .set("Cookie", `${REFRESH_COOKIE}=${FAKE_REFRESH}`);

    expect(res.status).toBe(401);
    expect(res.body.message).toMatch(/inactiv|encontrad/i);
    expect(mockRevokeAllRefreshTokens).toHaveBeenCalledWith(inactiveId);
  });

  it("devuelve 401 y revoca todos los tokens cuando el usuario fue eliminado (findUnique → null)", async () => {
    const deletedId = "user-deleted-000";
    mockRotateRefreshToken.mockResolvedValue({ userId: deletedId, newRaw: "x" });
    mockUserFindUnique.mockResolvedValue(null);

    const res = await request(buildApp())
      .post("/auth/refresh")
      .set("Cookie", `${REFRESH_COOKIE}=${FAKE_REFRESH}`);

    expect(res.status).toBe(401);
    expect(res.body.message).toMatch(/inactiv|encontrad/i);
    expect(mockRevokeAllRefreshTokens).toHaveBeenCalledWith(deletedId);
  });
});
