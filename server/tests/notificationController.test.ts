/**
 * Tests para controllers/notificationController.ts
 * Cubre: getNotifications, getUnreadCount, readNotification, readAllNotifications
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import type { Response, NextFunction } from "express";
import type { AuthRequest } from "../src/middlewares/auth";

process.env.JWT_SECRET   = "test-secret-32-bytes-minimum-len";
process.env.DATABASE_URL = "postgresql://x:x@localhost/x";

const {
  mockListNotifications,
  mockCountUnread,
  mockMarkRead,
  mockMarkAllRead,
} = vi.hoisted(() => ({
  mockListNotifications: vi.fn().mockResolvedValue({ notifications: [], total: 0 }),
  mockCountUnread:       vi.fn().mockResolvedValue(0),
  mockMarkRead:          vi.fn().mockResolvedValue(null),
  mockMarkAllRead:       vi.fn().mockResolvedValue({}),
}));

vi.mock("../src/services/notificationService", () => ({
  listNotifications: mockListNotifications,
  countUnread:       mockCountUnread,
  markRead:          mockMarkRead,
  markAllRead:       mockMarkAllRead,
}));
vi.mock("../src/utils/env", () => ({ env: { nodeEnv: "test" } }));

const USER_ID = "user-notif-001";

const buildApp = async () => {
  const { getNotifications, getUnreadCount, readNotification, readAllNotifications } =
    await import("../src/controllers/notificationController");

  const app = express();
  app.use(express.json());
  app.use((req: AuthRequest, _res: Response, next: NextFunction) => {
    req.user = { id: USER_ID, email: "u@velum.test", role: "member" } as AuthRequest["user"];
    next();
  });

  app.get("/notifications", getNotifications);
  app.get("/notifications/unread-count", getUnreadCount);
  app.post("/notifications/:id/read", readNotification);
  app.post("/notifications/read-all", readAllNotifications);

  return app;
};

beforeEach(() => vi.clearAllMocks());

// ── getNotifications ──────────────────────────────────────────────────────────
describe("getNotifications", () => {
  it("retorna la lista de notificaciones del usuario", async () => {
    const notifications = [{ id: "n1", message: "Test", read: false }];
    mockListNotifications.mockResolvedValue({ notifications, total: 1 });

    const app = await buildApp();
    const res = await request(app).get("/notifications");

    expect(res.status).toBe(200);
    expect(mockListNotifications).toHaveBeenCalledWith(USER_ID, 30, 0);
  });

  it("respeta parámetros limit y skip", async () => {
    mockListNotifications.mockResolvedValue({ notifications: [], total: 0 });

    const app = await buildApp();
    await request(app).get("/notifications?limit=10&skip=20");

    expect(mockListNotifications).toHaveBeenCalledWith(USER_ID, 10, 20);
  });

  it("limita el limit a máximo 100", async () => {
    mockListNotifications.mockResolvedValue({ notifications: [], total: 0 });

    const app = await buildApp();
    await request(app).get("/notifications?limit=9999");

    expect(mockListNotifications).toHaveBeenCalledWith(USER_ID, 100, 0);
  });
});

// ── getUnreadCount ────────────────────────────────────────────────────────────
describe("getUnreadCount", () => {
  it("retorna el conteo de notificaciones no leídas", async () => {
    mockCountUnread.mockResolvedValue(5);

    const app = await buildApp();
    const res = await request(app).get("/notifications/unread-count");

    expect(res.status).toBe(200);
    expect(res.body.count).toBe(5);
    expect(mockCountUnread).toHaveBeenCalledWith(USER_ID);
  });

  it("retorna 0 cuando no hay notificaciones no leídas", async () => {
    mockCountUnread.mockResolvedValue(0);

    const app = await buildApp();
    const res = await request(app).get("/notifications/unread-count");

    expect(res.body.count).toBe(0);
  });
});

// ── readNotification ──────────────────────────────────────────────────────────
describe("readNotification", () => {
  it("marca la notificación como leída y la retorna", async () => {
    const notification = { id: "n1", read: true, userId: USER_ID };
    mockMarkRead.mockResolvedValue(notification);

    const app = await buildApp();
    const res = await request(app).post("/notifications/n1/read");

    expect(res.status).toBe(200);
    expect(res.body.notification).toMatchObject({ id: "n1", read: true });
    expect(mockMarkRead).toHaveBeenCalledWith("n1", USER_ID);
  });

  it("retorna 404 cuando la notificación no existe", async () => {
    mockMarkRead.mockResolvedValue(null);

    const app = await buildApp();
    const res = await request(app).post("/notifications/not-found/read");

    expect(res.status).toBe(404);
    expect(res.body.message).toMatch(/no encontrada/i);
  });
});

// ── readAllNotifications ──────────────────────────────────────────────────────
describe("readAllNotifications", () => {
  it("marca todas las notificaciones como leídas", async () => {
    const app = await buildApp();
    const res = await request(app).post("/notifications/read-all");

    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/leídas/i);
    expect(mockMarkAllRead).toHaveBeenCalledWith(USER_ID);
  });
});
