/**
 * Tests para AppError, helpers de dominio y errorHandler middleware.
 */
import { describe, it, expect, vi } from "vitest";

process.env.JWT_SECRET = "test-secret-32-bytes-minimum-len";
process.env.DATABASE_URL = "postgresql://x:x@localhost/x";

// ── Mock errorReporter para evitar llamadas externas en 5xx ────────────────
vi.mock("../src/utils/errorReporter", () => ({ reportError: vi.fn() }));

import { AppError, notFound, forbidden, unauthorized, conflict, badRequest } from "../src/utils/AppError";
import { errorHandler } from "../src/middlewares/error";
import express from "express";
import request from "supertest";

// ── AppError class ────────────────────────────────────────────────────────────

describe("AppError", () => {
  it("preserva message, code y statusCode", () => {
    const err = new AppError("No encontrado", "NOT_FOUND", 404);
    expect(err.message).toBe("No encontrado");
    expect(err.code).toBe("NOT_FOUND");
    expect(err.statusCode).toBe(404);
    expect(err.name).toBe("AppError");
    expect(err instanceof Error).toBe(true);
    expect(err instanceof AppError).toBe(true);
  });

  it("acepta context opcional", () => {
    const ctx = { userId: "abc", retryAfterMs: 900_000 };
    const err = new AppError("Bloqueado", "LOGIN_LOCKED", 429, ctx);
    expect(err.context).toEqual(ctx);
  });

  it("context es undefined cuando no se provee", () => {
    const err = new AppError("Error", "CODE", 500);
    expect(err.context).toBeUndefined();
  });
});

// ── Helpers de dominio ────────────────────────────────────────────────────────

describe("notFound", () => {
  it("crea AppError con statusCode 404 y code NOT_FOUND", () => {
    const err = notFound("Usuario");
    expect(err.statusCode).toBe(404);
    expect(err.code).toBe("NOT_FOUND");
    expect(err.message).toContain("Usuario");
  });
});

describe("forbidden", () => {
  it("crea AppError con statusCode 403 y code FORBIDDEN", () => {
    const err = forbidden();
    expect(err.statusCode).toBe(403);
    expect(err.code).toBe("FORBIDDEN");
  });

  it("acepta mensaje personalizado", () => {
    const err = forbidden("Solo admins");
    expect(err.message).toBe("Solo admins");
  });
});

describe("unauthorized", () => {
  it("crea AppError con statusCode 401 y code UNAUTHORIZED", () => {
    const err = unauthorized();
    expect(err.statusCode).toBe(401);
    expect(err.code).toBe("UNAUTHORIZED");
  });
});

describe("conflict", () => {
  it("crea AppError con statusCode 409 y code CONFLICT por defecto", () => {
    const err = conflict("Ya existe");
    expect(err.statusCode).toBe(409);
    expect(err.code).toBe("CONFLICT");
  });

  it("acepta code personalizado", () => {
    const err = conflict("Duplicado", "DUPLICATE_EMAIL");
    expect(err.code).toBe("DUPLICATE_EMAIL");
  });
});

describe("badRequest", () => {
  it("crea AppError con statusCode 400 y code BAD_REQUEST por defecto", () => {
    const err = badRequest("Payload inválido");
    expect(err.statusCode).toBe(400);
    expect(err.code).toBe("BAD_REQUEST");
  });
});

// ── errorHandler middleware ───────────────────────────────────────────────────

const buildApp = (thrower: (req: express.Request) => void) => {
  const app = express();
  app.get("/test", (req, _res, next) => {
    try { thrower(req); } catch (e) { next(e); }
  });
  app.use(errorHandler);
  return app;
};

describe("errorHandler", () => {
  it("serializa AppError 4xx con message y code, sin reportError", async () => {
    const app = buildApp(() => { throw new AppError("No encontrado", "NOT_FOUND", 404); });
    const res = await request(app).get("/test");
    expect(res.status).toBe(404);
    expect(res.body.code).toBe("NOT_FOUND");
    expect(res.body.message).toBe("No encontrado");
  });

  it("devuelve 400 para AppError con statusCode 400", async () => {
    const app = buildApp(() => { throw badRequest("Falta email"); });
    const res = await request(app).get("/test");
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("BAD_REQUEST");
  });

  it("devuelve 500 INTERNAL_ERROR para Error genérico", async () => {
    const app = buildApp(() => { throw new Error("Algo inesperado"); });
    const res = await request(app).get("/test");
    expect(res.status).toBe(500);
    expect(res.body.code).toBe("INTERNAL_ERROR");
  });

  it("devuelve 400 VALIDATION_ERROR para ZodError", async () => {
    const { z } = await import("zod");
    const schema = z.object({ email: z.string().email() });
    const app = buildApp(() => { schema.parse({ email: "no-es-email" }); });
    const res = await request(app).get("/test");
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("VALIDATION_ERROR");
    expect(Array.isArray(res.body.fields)).toBe(true);
  });

  it("respeta statusCode del error legacy con propiedad .status", async () => {
    const app = buildApp(() => {
      const err = Object.assign(new Error("Cliente malo"), { status: 422 });
      throw err;
    });
    const res = await request(app).get("/test");
    expect(res.status).toBe(422);
    expect(res.body.code).toBe("CLIENT_ERROR");
  });
});
