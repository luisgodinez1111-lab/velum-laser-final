/**
 * Tests para validación de magic bytes en documentController.
 * Verifica que el contenido del archivo coincida con el tipo MIME declarado.
 */
import { describe, it, expect } from "vitest";

// ── Funciones puras extraídas de documentController ────────────────────────

const MAGIC_BYTES: Array<{ mime: string; offset: number; bytes: number[] }> = [
  { mime: "application/pdf", offset: 0, bytes: [0x25, 0x50, 0x44, 0x46] },
  { mime: "image/png",       offset: 0, bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  { mime: "image/jpeg",      offset: 0, bytes: [0xff, 0xd8, 0xff] },
];

function validateMagicBytes(buffer: Buffer, declaredMime: string): boolean {
  const entry = MAGIC_BYTES.find((m) => m.mime === declaredMime);
  if (!entry) return false;
  return entry.bytes.every((byte, i) => buffer[entry.offset + i] === byte);
}

// ── Helpers para crear buffers de prueba ───────────────────────────────────

const pdfHeader    = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]); // %PDF-1.4
const pngHeader    = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
const jpegHeader   = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
const fakePayload  = Buffer.from("Este es un texto plano malicioso con MIME falso");
const emptyBuffer  = Buffer.alloc(0);

// ── Tests ─────────────────────────────────────────────────────────────────

describe("validateMagicBytes — PDF", () => {
  it("acepta buffer PDF válido con MIME application/pdf", () =>
    expect(validateMagicBytes(pdfHeader, "application/pdf")).toBe(true));

  it("rechaza texto plano declarado como PDF", () =>
    expect(validateMagicBytes(fakePayload, "application/pdf")).toBe(false));

  it("rechaza imagen PNG declarada como PDF", () =>
    expect(validateMagicBytes(pngHeader, "application/pdf")).toBe(false));

  it("rechaza buffer vacío declarado como PDF", () =>
    expect(validateMagicBytes(emptyBuffer, "application/pdf")).toBe(false));
});

describe("validateMagicBytes — PNG", () => {
  it("acepta buffer PNG válido con MIME image/png", () =>
    expect(validateMagicBytes(pngHeader, "image/png")).toBe(true));

  it("rechaza texto plano declarado como PNG", () =>
    expect(validateMagicBytes(fakePayload, "image/png")).toBe(false));

  it("rechaza JPEG declarado como PNG", () =>
    expect(validateMagicBytes(jpegHeader, "image/png")).toBe(false));

  it("rechaza buffer vacío declarado como PNG", () =>
    expect(validateMagicBytes(emptyBuffer, "image/png")).toBe(false));
});

describe("validateMagicBytes — JPEG", () => {
  it("acepta buffer JPEG válido con MIME image/jpeg", () =>
    expect(validateMagicBytes(jpegHeader, "image/jpeg")).toBe(true));

  it("rechaza texto plano declarado como JPEG", () =>
    expect(validateMagicBytes(fakePayload, "image/jpeg")).toBe(false));

  it("rechaza PDF declarado como JPEG", () =>
    expect(validateMagicBytes(pdfHeader, "image/jpeg")).toBe(false));

  it("rechaza buffer vacío declarado como JPEG", () =>
    expect(validateMagicBytes(emptyBuffer, "image/jpeg")).toBe(false));
});

describe("validateMagicBytes — MIME desconocido", () => {
  it("rechaza MIME no registrado 'image/gif'", () =>
    expect(validateMagicBytes(pdfHeader, "image/gif")).toBe(false));

  it("rechaza MIME vacío", () =>
    expect(validateMagicBytes(pdfHeader, "")).toBe(false));
});
