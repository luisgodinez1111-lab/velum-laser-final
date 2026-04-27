import { describe, it, expect, beforeEach } from "vitest";
import {
  encryptPhi,
  decryptPhi,
  isEncrypted,
  encryptPhiNullable,
  decryptPhiNullable,
  _resetPhiKeyCache,
} from "../src/utils/phiCrypto";

// El test runner ya define INTEGRATIONS_ENC_KEY. Necesitamos PHI_MASTER_KEY.
process.env.PHI_MASTER_KEY = process.env.PHI_MASTER_KEY ?? "phi-test-key-with-at-least-32-characters-here";

describe("phiCrypto", () => {
  beforeEach(() => _resetPhiKeyCache());

  it("encrypt → decrypt roundtrip preserva el plaintext", () => {
    const plain = "Datos médicos sensibles del paciente";
    const cipher = encryptPhi(plain);
    expect(cipher).not.toBe(plain);
    expect(cipher.startsWith("phi:v1:")).toBe(true);
    expect(decryptPhi(cipher)).toBe(plain);
  });

  it("isEncrypted distingue ciphertext de plaintext", () => {
    expect(isEncrypted("plaintext")).toBe(false);
    expect(isEncrypted("phi:v1:abc:def:ghi")).toBe(true);
    expect(isEncrypted(null)).toBe(false);
    expect(isEncrypted(undefined)).toBe(false);
  });

  it("encryptPhi es idempotente — re-cifrar un valor ya cifrado lo devuelve igual", () => {
    const plain = "test";
    const c1 = encryptPhi(plain);
    const c2 = encryptPhi(c1);
    expect(c2).toBe(c1);
  });

  it("decryptPhi sobre legacy plaintext lo devuelve sin tocar", () => {
    // Esto permite migración gradual: filas viejas sin cifrar siguen funcionando.
    expect(decryptPhi("legacy plaintext sin prefix")).toBe("legacy plaintext sin prefix");
  });

  it("dos encrypts del mismo plaintext producen ciphertexts distintos (IV aleatorio)", () => {
    const plain = "mismo input";
    expect(encryptPhi(plain)).not.toBe(encryptPhi(plain));
  });

  it("decryptPhi con ciphertext corrupto lanza", () => {
    expect(() => decryptPhi("phi:v1:malformado")).toThrow();
  });

  it("nullable helpers manejan null/undefined", () => {
    expect(encryptPhiNullable(null)).toBeNull();
    expect(encryptPhiNullable(undefined)).toBeNull();
    expect(decryptPhiNullable(null)).toBeNull();
    expect(decryptPhiNullable("")).toBe("");
  });

  it("data URL grande (firma de paciente) cifra correctamente", () => {
    const dataUrl = "data:image/png;base64," + "A".repeat(50_000);
    const cipher = encryptPhi(dataUrl);
    expect(cipher.length).toBeGreaterThan(dataUrl.length);
    expect(decryptPhi(cipher)).toBe(dataUrl);
  });
});
