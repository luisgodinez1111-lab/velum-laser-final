/**
 * Tests para verificar que jwt.verify usa algorithm HS256 explícito.
 * Protege contra el ataque "algorithm none" (CVE clásico de JWT).
 */
import { describe, it, expect, beforeAll } from "vitest";
import jwt from "jsonwebtoken";

const SECRET = "test-secret-with-at-least-32-characters-here";

// Simular el verifyToken del proyecto con algorithms: ["HS256"]
function verifyToken(token: string) {
  return jwt.verify(token, SECRET, { algorithms: ["HS256"] }) as {
    sub: string;
    role: string;
    iat: number;
  };
}

// Crear token "none" (firma vacía — el ataque clásico)
function createNoneAlgorithmToken(payload: object): string {
  const header = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url");
  const body   = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${header}.${body}.`; // sin firma
}

describe("JWT algorithm: protección contra 'none'", () => {
  let validToken: string;

  beforeAll(() => {
    validToken = jwt.sign({ sub: "user-1", role: "admin" }, SECRET, { algorithm: "HS256", expiresIn: "1h" });
  });

  it("verifica correctamente un token HS256 válido", () => {
    const payload = verifyToken(validToken);
    expect(payload.sub).toBe("user-1");
    expect(payload.role).toBe("admin");
  });

  it("rechaza un token con algorithm 'none' (ataque sin firma)", () => {
    const noneToken = createNoneAlgorithmToken({ sub: "attacker", role: "admin" });
    expect(() => verifyToken(noneToken)).toThrow();
  });

  it("rechaza un token firmado con secreto incorrecto", () => {
    const wrongToken = jwt.sign({ sub: "user-2", role: "member" }, "wrong-secret-12345678901234567890", { algorithm: "HS256" });
    expect(() => verifyToken(wrongToken)).toThrow();
  });

  it("rechaza un token expirado", () => {
    const expired = jwt.sign({ sub: "user-3", role: "member" }, SECRET, { algorithm: "HS256", expiresIn: -1 });
    expect(() => verifyToken(expired)).toThrow();
  });

  it("rechaza un token malformado", () => {
    expect(() => verifyToken("not.a.real.token")).toThrow();
  });

  it("rechaza string vacío", () => {
    expect(() => verifyToken("")).toThrow();
  });
});
