/**
 * Tests para controllers/v1LeadController.ts
 * Cubre: createLead, trackMarketingEvent, listMarketingEvents
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import type { Response, NextFunction } from "express";
import type { AuthRequest } from "../src/middlewares/auth";

process.env.JWT_SECRET   = "test-secret-32-bytes-minimum-len";
process.env.DATABASE_URL = "postgresql://x:x@localhost/x";

const {
  mockLeadCreate,
  mockAttributionCreate,
  mockAttributionFindUnique,
  mockAttributionUpdate,
  mockAttributionFindMany,
  mockTransaction,
  mockAuditCreate,
  mockSendMetaEvent,
} = vi.hoisted(() => {
  const mockLeadCreate          = vi.fn().mockResolvedValue({ id: "lead-1" });
  const mockAttributionCreate   = vi.fn().mockResolvedValue({ id: "attr-1" });
  const mockAttributionFindUnique = vi.fn().mockResolvedValue(null);
  const mockAttributionUpdate   = vi.fn().mockResolvedValue({ id: "attr-1", metaStatus: "sent" });
  const mockAttributionFindMany = vi.fn().mockResolvedValue([]);
  const mockTransaction = vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
    const tx = {
      lead: { create: mockLeadCreate },
      marketingAttribution: { create: mockAttributionCreate },
    };
    return fn(tx);
  });

  return {
    mockLeadCreate,
    mockAttributionCreate,
    mockAttributionFindUnique,
    mockAttributionUpdate,
    mockAttributionFindMany,
    mockTransaction,
    mockAuditCreate: vi.fn().mockResolvedValue({}),
    mockSendMetaEvent: vi.fn().mockResolvedValue({ status: "sent", error: null, responseSummary: {} }),
  };
});

vi.mock("../src/db/prisma", () => ({
  prisma: {
    $transaction: mockTransaction,
    marketingAttribution: {
      findUnique: mockAttributionFindUnique,
      create:     mockAttributionCreate,
      update:     mockAttributionUpdate,
      findMany:   mockAttributionFindMany,
    },
  },
}));
vi.mock("../src/services/auditService",  () => ({ createAuditLog: mockAuditCreate }));
vi.mock("../src/services/metaService",   () => ({ sendMetaEvent: mockSendMetaEvent }));
vi.mock("../src/utils/env",              () => ({ env: { nodeEnv: "test" } }));

const buildApp = async (authenticated = false) => {
  const { createLead, trackMarketingEvent, listMarketingEvents } =
    await import("../src/controllers/v1LeadController");

  const app = express();
  app.use(express.json());

  if (authenticated) {
    app.use((req: AuthRequest, _res: Response, next: NextFunction) => {
      req.user = { id: "user-1", email: "u@t.com", role: "member" } as AuthRequest["user"];
      next();
    });
  }

  app.post("/leads",          createLead);
  app.post("/leads/events",   trackMarketingEvent);
  app.get("/leads/events",    listMarketingEvents);

  return app;
};

beforeEach(() => vi.clearAllMocks());

// ── createLead ────────────────────────────────────────────────────────────────
describe("createLead", () => {
  const validLead = {
    name: "Ana García",
    email: "ana@test.com",
    phone: "+525512345678",
    consent: true,
  };

  it("crea un lead y retorna 201 con datos", async () => {
    mockLeadCreate.mockResolvedValue({ id: "lead-1", ...validLead });
    mockAttributionCreate.mockResolvedValue({ id: "attr-1" });
    mockAttributionUpdate.mockResolvedValue({ id: "attr-1", metaStatus: "sent" });

    const app = await buildApp();
    const res = await request(app).post("/leads").send(validLead);

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty("lead");
    expect(res.body).toHaveProperty("attribution");
    expect(res.body).toHaveProperty("eventId");
  });

  it("envía el evento a Meta tras crear el lead", async () => {
    mockLeadCreate.mockResolvedValue({ id: "lead-2", ...validLead });
    mockAttributionCreate.mockResolvedValue({ id: "attr-2" });
    mockAttributionUpdate.mockResolvedValue({ id: "attr-2", metaStatus: "sent" });

    const app = await buildApp();
    await request(app).post("/leads").send(validLead);

    expect(mockSendMetaEvent).toHaveBeenCalledWith(
      expect.objectContaining({ eventName: "Lead" })
    );
  });

  it("registra audit log tras crear lead", async () => {
    mockLeadCreate.mockResolvedValue({ id: "lead-3", ...validLead });
    mockAttributionCreate.mockResolvedValue({ id: "attr-3" });
    mockAttributionUpdate.mockResolvedValue({ id: "attr-3", metaStatus: "sent" });

    const app = await buildApp();
    await request(app).post("/leads").send(validLead);

    expect(mockAuditCreate).toHaveBeenCalledWith(
      expect.objectContaining({ action: "lead.create" })
    );
  });

  it("pasa UTM params al attribution", async () => {
    mockLeadCreate.mockResolvedValue({ id: "lead-4", ...validLead });
    mockAttributionCreate.mockResolvedValue({ id: "attr-4" });
    mockAttributionUpdate.mockResolvedValue({ id: "attr-4", metaStatus: "sent" });

    const app = await buildApp();
    await request(app).post("/leads").send({
      ...validLead,
      utm_source: "facebook",
      utm_campaign: "verano2026",
    });

    expect(mockAttributionCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          utmSource: "facebook",
          utmCampaign: "verano2026",
        }),
      })
    );
  });
});

// ── trackMarketingEvent ───────────────────────────────────────────────────────
describe("trackMarketingEvent", () => {
  const validEvent = {
    eventName: "ViewContent",
    eventId: "evt-unique-001",
    leadId: "lead-1",
  };

  it("retorna 200 con deduped=true si el evento ya existe", async () => {
    mockAttributionFindUnique.mockResolvedValue({
      id: "attr-1",
      eventId: "evt-unique-001",
      metaStatus: "sent",
    });

    const app = await buildApp();
    const res = await request(app).post("/leads/events").send(validEvent);

    expect(res.status).toBe(200);
    expect(res.body.deduped).toBe(true);
    expect(res.body.eventId).toBe("evt-unique-001");
    expect(mockAttributionCreate).not.toHaveBeenCalled();
  });

  it("crea y envía el evento si no existe (deduped=false)", async () => {
    mockAttributionFindUnique.mockResolvedValue(null);
    mockAttributionCreate.mockResolvedValue({ id: "attr-new" });
    mockAttributionUpdate.mockResolvedValue({ id: "attr-new", metaStatus: "sent" });

    const app = await buildApp();
    const res = await request(app).post("/leads/events").send(validEvent);

    expect(res.status).toBe(202);
    expect(res.body.deduped).toBe(false);
    expect(mockSendMetaEvent).toHaveBeenCalledWith(
      expect.objectContaining({ eventName: "ViewContent", eventId: "evt-unique-001" })
    );
  });
});

// ── listMarketingEvents ───────────────────────────────────────────────────────
describe("listMarketingEvents", () => {
  it("retorna la lista de eventos de marketing", async () => {
    const events = [{ id: "a1", eventName: "Lead", metaStatus: "sent" }];
    mockAttributionFindMany.mockResolvedValue(events);

    const app = await buildApp();
    const res = await request(app).get("/leads/events");

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].eventName).toBe("Lead");
  });

  it("filtra por eventName cuando se pasa como query", async () => {
    mockAttributionFindMany.mockResolvedValue([]);

    const app = await buildApp();
    await request(app).get("/leads/events?eventName=Purchase");

    expect(mockAttributionFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ eventName: "Purchase" }),
      })
    );
  });

  it("filtra por status cuando se pasa como query", async () => {
    mockAttributionFindMany.mockResolvedValue([]);

    const app = await buildApp();
    await request(app).get("/leads/events?status=error");

    expect(mockAttributionFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ metaStatus: "error" }),
      })
    );
  });

  it("limita resultados a máximo 500", async () => {
    mockAttributionFindMany.mockResolvedValue([]);

    const app = await buildApp();
    await request(app).get("/leads/events?limit=9999");

    expect(mockAttributionFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 500 })
    );
  });
});
