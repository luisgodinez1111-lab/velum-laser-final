import { describe, expect, it } from "vitest";
import { normalizeApiPath } from "../services/apiClient";

describe("normalizeApiPath", () => {
  it("evita duplicar /api cuando la base ya termina en /api", () => {
    expect(normalizeApiPath("/api/v1/payments", "/api")).toBe("/v1/payments");
    expect(normalizeApiPath("/api/v1/payments", "https://velumlaser.com/api")).toBe("/v1/payments");
  });

  it("mantiene rutas legacy bajo una base /api para proxy/rewrite", () => {
    expect(normalizeApiPath("/auth/login", "/api")).toBe("/auth/login");
    expect(normalizeApiPath("/admin/users", "https://velumlaser.com/api")).toBe("/admin/users");
  });

  it("agrega /api a rutas v1 cuando la base apunta directo al backend", () => {
    expect(normalizeApiPath("/v1/payments", "https://api.velumlaser.com")).toBe("/api/v1/payments");
    expect(normalizeApiPath("v1/notifications", "https://api.velumlaser.com")).toBe("/api/v1/notifications");
  });

  it("no agrega /api a rutas legacy cuando la base apunta directo al backend", () => {
    expect(normalizeApiPath("/auth/login", "https://api.velumlaser.com")).toBe("/auth/login");
    expect(normalizeApiPath("/documents/abc", "https://api.velumlaser.com")).toBe("/documents/abc");
  });
});
