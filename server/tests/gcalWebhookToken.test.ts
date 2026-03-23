import { describe, it, expect, vi, beforeEach } from "vitest";

process.env.JWT_SECRET = "test-secret-32-bytes-minimum-len";
process.env.DATABASE_URL = "postgresql://x:x@localhost/x";

vi.mock("../src/utils/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock("../src/services/googleCalendarIntegrationService", () => ({
  enqueueGoogleCalendarSyncFromWebhook: vi.fn().mockResolvedValue(undefined),
}));

import express from "express";
import request from "supertest";
import { enqueueGoogleCalendarSyncFromWebhook } from "../src/services/googleCalendarIntegrationService";
import { logger } from "../src/utils/logger";

const buildApp = (webhookToken?: string) => {
  // Set env var before importing controller
  if (webhookToken) {
    process.env.GOOGLE_WEBHOOK_TOKEN = webhookToken;
  } else {
    delete process.env.GOOGLE_WEBHOOK_TOKEN;
  }

  const app = express();
  app.use(express.json());

  // Import fresh to pick up env change
  const { receiveGoogleCalendarWebhook } = require("../src/controllers/googleCalendarWebhookController");
  app.post("/api/webhooks/google-calendar", receiveGoogleCalendarWebhook);
  return app;
};

describe("Google Calendar webhook — token enforcement", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    delete process.env.GOOGLE_WEBHOOK_TOKEN;
  });

  it("sin env var: acepta request sin token", async () => {
    process.env.GOOGLE_WEBHOOK_TOKEN = "";
    const { receiveGoogleCalendarWebhook } = await import("../src/controllers/googleCalendarWebhookController");
    const app = express();
    app.use(express.json());
    app.post("/webhook", receiveGoogleCalendarWebhook);

    const res = await request(app).post("/webhook")
      .set("X-Goog-Channel-Id", "chan1")
      .set("X-Goog-Resource-Id", "res1")
      .set("X-Goog-Resource-State", "sync")
      .send({});

    expect(res.status).toBe(200);
  });

  it("con env var: rechaza request con token incorrecto (ignora, no procesa)", async () => {
    process.env.GOOGLE_WEBHOOK_TOKEN = "secret-token-xyz";
    vi.resetModules();

    const { receiveGoogleCalendarWebhook } = await import("../src/controllers/googleCalendarWebhookController");
    const app = express();
    app.use(express.json());
    app.post("/webhook", receiveGoogleCalendarWebhook);

    // Always returns 200 (fast ack), but should NOT enqueue
    const res = await request(app).post("/webhook")
      .set("X-Goog-Channel-Id", "chan1")
      .set("X-Goog-Resource-Id", "res1")
      .set("X-Goog-Resource-State", "sync")
      .set("X-Goog-Channel-Token", "WRONG_TOKEN")
      .send({});

    expect(res.status).toBe(200);
    // Should NOT have enqueued sync
    await new Promise((r) => setTimeout(r, 10)); // let void promise settle
    expect(enqueueGoogleCalendarSyncFromWebhook).not.toHaveBeenCalled();
    expect(vi.mocked(logger.warn)).toHaveBeenCalledWith(
      expect.objectContaining({ channelId: "chan1" }),
      expect.stringContaining("Invalid or missing channel token")
    );
  });

  it("con env var: acepta request con token correcto y encola sync", async () => {
    process.env.GOOGLE_WEBHOOK_TOKEN = "secret-token-xyz";
    vi.resetModules();

    const { receiveGoogleCalendarWebhook } = await import("../src/controllers/googleCalendarWebhookController");
    const app = express();
    app.use(express.json());
    app.post("/webhook", receiveGoogleCalendarWebhook);

    const res = await request(app).post("/webhook")
      .set("X-Goog-Channel-Id", "chan1")
      .set("X-Goog-Resource-Id", "res1")
      .set("X-Goog-Resource-State", "sync")
      .set("X-Goog-Channel-Token", "secret-token-xyz")
      .send({});

    expect(res.status).toBe(200);
    await new Promise((r) => setTimeout(r, 20));
    expect(enqueueGoogleCalendarSyncFromWebhook).toHaveBeenCalledWith(
      expect.objectContaining({ channelId: "chan1" })
    );
  });

  it("con env var: rechaza request sin token (antes pasaba, ahora no)", async () => {
    process.env.GOOGLE_WEBHOOK_TOKEN = "secret-token-xyz";
    vi.resetModules();

    const { receiveGoogleCalendarWebhook } = await import("../src/controllers/googleCalendarWebhookController");
    const app = express();
    app.use(express.json());
    app.post("/webhook", receiveGoogleCalendarWebhook);

    const res = await request(app).post("/webhook")
      .set("X-Goog-Channel-Id", "chan1")
      .set("X-Goog-Resource-Id", "res1")
      .set("X-Goog-Resource-State", "sync")
      // No X-Goog-Channel-Token header
      .send({});

    expect(res.status).toBe(200);
    await new Promise((r) => setTimeout(r, 10));
    expect(enqueueGoogleCalendarSyncFromWebhook).not.toHaveBeenCalled();
  });
});
