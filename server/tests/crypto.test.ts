/**
 * Tests para utils/crypto.ts
 * Cubre: generateOtp, encrypt/decrypt round-trip, datos corruptos, IV aleatorio.
 */
import { describe, it, expect, beforeAll } from "vitest";

// La clave debe estar antes del import de crypto (que usa env en init)
process.env.INTEGRATIONS_ENC_KEY = "test-enc-key-32-bytes-minimum!!";
process.env.JWT_SECRET            = "test-secret-32-bytes-minimum-len";
process.env.DATABASE_URL          = "postgresql://x:x@localhost/x";

import { generateOtp, encrypt, decrypt } from "../src/utils/crypto";

describe("generateOtp", () => {
  it("devuelve un string de exactamente 6 caracteres", () => {
    const otp = generateOtp();
    expect(otp).toHaveLength(6);
  });

  it("devuelve solo dígitos numéricos", () => {
    const otp = generateOtp();
    expect(/^\d{6}$/.test(otp)).toBe(true);
  });

  it("el valor está entre 100000 y 999999 (sin leading zeros problemáticos)", () => {
    const otp = Number(generateOtp());
    expect(otp).toBeGreaterThanOrEqual(100000);
    expect(otp).toBeLessThanOrEqual(999999);
  });

  it("genera valores distintos en llamadas sucesivas (no es constante)", () => {
    const otps = new Set(Array.from({ length: 20 }, () => generateOtp()));
    // Con 20 llamadas, casi imposible que todos sean iguales
    expect(otps.size).toBeGreaterThan(1);
  });
});

describe("encrypt / decrypt — round-trip", () => {
  it("decrypt(encrypt(texto)) devuelve el texto original", () => {
    const original = "dato sensible del paciente";
    expect(decrypt(encrypt(original))).toBe(original);
  });

  it("round-trip con caracteres especiales y unicode", () => {
    const original = "Álvarez García — José 🔒 correo@velum.mx";
    expect(decrypt(encrypt(original))).toBe(original);
  });

  it("round-trip con string largo (1000 chars)", () => {
    const original = "x".repeat(1000);
    expect(decrypt(encrypt(original))).toBe(original);
  });

  it("dos encrypt del mismo texto producen ciphertexts diferentes (IV aleatorio)", () => {
    const text = "mismo texto";
    const c1 = encrypt(text);
    const c2 = encrypt(text);
    expect(c1).not.toBe(c2);
  });

  it("el formato cifrado contiene 3 partes separadas por ':'", () => {
    const parts = encrypt("test").split(":");
    expect(parts).toHaveLength(3);
    // iv : authTag : payload — todos son base64 no vacíos
    for (const part of parts) {
      expect(part.length).toBeGreaterThan(0);
    }
  });
});

describe("decrypt — entradas inválidas", () => {
  it("lanza error con ciphertext malformado (sin separadores)", () => {
    expect(() => decrypt("not-encrypted-at-all")).toThrow();
  });

  it("lanza error con ciphertext que tiene solo 2 partes", () => {
    expect(() => decrypt("part1:part2")).toThrow();
  });

  it("lanza error con authTag corrupto (GCM falla verificación)", () => {
    const cipher = encrypt("original");
    const parts  = cipher.split(":");
    // Corromper el authTag (segunda parte)
    const tampered = [parts[0], "AAAAAAAAAAAAAAAA", parts[2]].join(":");
    expect(() => decrypt(tampered)).toThrow();
  });

  it("lanza error con payload corrupto", () => {
    const cipher = encrypt("original");
    const parts  = cipher.split(":");
    const tampered = [parts[0], parts[1], "CORRUPTO"].join(":");
    expect(() => decrypt(tampered)).toThrow();
  });
});
