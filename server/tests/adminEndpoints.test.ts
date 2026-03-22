import { describe, it, expect, vi } from "vitest";

process.env.JWT_SECRET = "test-secret-32-bytes-minimum-len";
process.env.DATABASE_URL = "postgresql://x:x@localhost/x";

vi.mock("../src/db/prisma", () => ({
  prisma: {
    payment: {
      count: vi.fn().mockResolvedValue(2),
      findMany: vi.fn().mockResolvedValue([
        { id: "p1", amount: 50000, currency: "mxn", status: "paid", createdAt: new Date("2025-01-15"), paidAt: new Date("2025-01-15"), user: { id: "u1", email: "a@test.com" }, membership: null },
        { id: "p2", amount: 30000, currency: "mxn", status: "pending", createdAt: new Date("2025-01-20"), paidAt: null, user: { id: "u2", email: "b@test.com" }, membership: null },
      ]),
    },
    integrationJob: {
      findMany: vi.fn().mockResolvedValue([
        { id: "j1", type: "GOOGLE_CALENDAR_SYNC", status: "done", attempts: 1, maxAttempts: 8, runAt: new Date(), finishedAt: new Date(), createdAt: new Date(), lastError: null, googleIntegrationId: null },
        { id: "j2", type: "GOOGLE_CALENDAR_SYNC", status: "failed", attempts: 8, maxAttempts: 8, runAt: new Date(), finishedAt: null, createdAt: new Date(), lastError: "timeout", googleIntegrationId: null },
      ]),
    },
    webhookEvent: {
      findMany: vi.fn().mockResolvedValue([
        { id: "we1", stripeEventId: "evt_001", type: "checkout.session.completed", processedAt: new Date(), createdAt: new Date() },
        { id: "we2", stripeEventId: "evt_002", type: "invoice.paid", processedAt: new Date(), createdAt: new Date() },
      ]),
    },
    user: { findUnique: vi.fn().mockResolvedValue({ clinicId: "clinic1" }) },
  },
}));

vi.mock("../src/services/auditService", () => ({ createAuditLog: vi.fn() }));

import express from "express";
import request from "supertest";

const mockUser = (role = "admin") => (req: any, _res: any, next: any) => {
  req.user = { id: "admin1", role };
  next();
};

describe("listPaymentsAdmin — paginación y filtros", () => {
  it("devuelve payments con total y páginas", async () => {
    const { listPaymentsAdmin } = await import("../src/controllers/v1PaymentController");
    const app = express();
    app.use(express.json());
    app.get("/payments", mockUser(), listPaymentsAdmin);

    const res = await request(app).get("/payments?page=1&limit=50");
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("payments");
    expect(res.body).toHaveProperty("total");
    expect(res.body).toHaveProperty("pages");
    expect(Array.isArray(res.body.payments)).toBe(true);
  });

  it("acepta filtros dateFrom y dateTo sin error", async () => {
    const { listPaymentsAdmin } = await import("../src/controllers/v1PaymentController");
    const app = express();
    app.use(express.json());
    app.get("/payments", mockUser(), listPaymentsAdmin);

    const res = await request(app).get("/payments?dateFrom=2025-01-01&dateTo=2025-01-31&status=paid");
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("payments");
  });
});

describe("listIntegrationJobs — monitor de trabajos", () => {
  it("devuelve lista de jobs con sus campos clave", async () => {
    const { listIntegrationJobs } = await import("../src/controllers/adminIntegrationJobController");
    const app = express();
    app.use(express.json());
    app.get("/jobs", mockUser(), listIntegrationJobs);

    const res = await request(app).get("/jobs");
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("jobs");
    expect(Array.isArray(res.body.jobs)).toBe(true);
    expect(res.body.jobs[0]).toHaveProperty("type");
    expect(res.body.jobs[0]).toHaveProperty("status");
  });

  it("acepta filtro por status", async () => {
    const { listIntegrationJobs } = await import("../src/controllers/adminIntegrationJobController");
    const app = express();
    app.use(express.json());
    app.get("/jobs", mockUser(), listIntegrationJobs);

    const res = await request(app).get("/jobs?status=failed");
    expect(res.status).toBe(200);
  });
});

describe("listWebhookEvents — auditoría Stripe", () => {
  it("devuelve lista de webhook events", async () => {
    const { listWebhookEvents } = await import("../src/controllers/adminWebhookEventController");
    const app = express();
    app.use(express.json());
    app.get("/webhook-events", mockUser(), listWebhookEvents);

    const res = await request(app).get("/webhook-events");
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("events");
    expect(Array.isArray(res.body.events)).toBe(true);
    expect(res.body.events[0]).toHaveProperty("stripeEventId");
    expect(res.body.events[0]).toHaveProperty("type");
  });
});
