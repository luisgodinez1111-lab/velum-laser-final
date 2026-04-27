import crypto from "crypto";
import { env } from "./env";

/** OTP numérico de 6 dígitos generado con CSPRNG (no Math.random). */
export const generateOtp = (): string => String(100000 + crypto.randomInt(900000));

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;

/**
 * Deriva una key de 32 bytes desde un raw string. Acepta:
 *   - 64-char hex (32 bytes raw)
 *   - 32-byte UTF-8 string (uso directo)
 *   - cualquier otro string (hash SHA-256)
 */
export const deriveKey = (raw: string): Buffer => {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new Error("Encryption key is required");
  }
  if (/^[a-f0-9]{64}$/i.test(trimmed)) {
    return Buffer.from(trimmed, "hex");
  }
  const asUtf8 = Buffer.from(trimmed, "utf8");
  if (asUtf8.length === 32) {
    return asUtf8;
  }
  return crypto.createHash("sha256").update(trimmed, "utf8").digest();
};

/**
 * AES-256-GCM encrypt low-level. Devuelve `<iv_b64>:<authTag_b64>:<ciphertext_b64>`.
 * Reusable: cualquier caller con su propia key (integrations, PHI, etc.).
 */
export const aesGcmEncrypt = (plainText: string, key: Buffer): string => {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plainText, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString("base64")}:${authTag.toString("base64")}:${encrypted.toString("base64")}`;
};

export const aesGcmDecrypt = (cipherText: string, key: Buffer): string => {
  const [ivBase64, authTagBase64, payloadBase64] = cipherText.split(":");
  if (!ivBase64 || !authTagBase64 || !payloadBase64) {
    throw new Error("Encrypted payload is malformed");
  }
  const iv = Buffer.from(ivBase64, "base64");
  const authTag = Buffer.from(authTagBase64, "base64");
  const payload = Buffer.from(payloadBase64, "base64");
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(payload), decipher.final()]);
  return decrypted.toString("utf8");
};

// ── Wrappers preexistentes (integrations: Google Calendar tokens, etc.) ──
// Mantenidos para no romper callers. Internamente usan aesGcmEncrypt/Decrypt.
let _integrationsKey: Buffer | undefined;
const getIntegrationsKey = (): Buffer => {
  if (!_integrationsKey) _integrationsKey = deriveKey(env.integrationsEncKey);
  return _integrationsKey;
};

export const encrypt = (plainText: string): string => aesGcmEncrypt(plainText, getIntegrationsKey());
export const decrypt = (cipherText: string): string => aesGcmDecrypt(cipherText, getIntegrationsKey());
