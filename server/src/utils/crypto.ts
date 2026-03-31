import crypto from "crypto";
import { env } from "./env";

/** OTP numérico de 6 dígitos generado con CSPRNG (no Math.random). */
export const generateOtp = (): string => String(100000 + crypto.randomInt(900000));

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;

const getEncryptionKey = () => {
  const raw = env.integrationsEncKey.trim();
  if (!raw) {
    throw new Error("INTEGRATIONS_ENC_KEY is required");
  }

  // Accept either a 32-byte raw key, a 64-char hex key, or any passphrase (hashed to 32 bytes).
  if (/^[a-f0-9]{64}$/i.test(raw)) {
    return Buffer.from(raw, "hex");
  }

  const asUtf8 = Buffer.from(raw, "utf8");
  if (asUtf8.length === 32) {
    return asUtf8;
  }

  return crypto.createHash("sha256").update(raw, "utf8").digest();
};

export const encrypt = (plainText: string) => {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, getEncryptionKey(), iv);

  const encrypted = Buffer.concat([cipher.update(plainText, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return `${iv.toString("base64")}:${authTag.toString("base64")}:${encrypted.toString("base64")}`;
};

export const decrypt = (cipherText: string) => {
  const [ivBase64, authTagBase64, payloadBase64] = cipherText.split(":");
  if (!ivBase64 || !authTagBase64 || !payloadBase64) {
    throw new Error("Encrypted payload is malformed");
  }

  const iv = Buffer.from(ivBase64, "base64");
  const authTag = Buffer.from(authTagBase64, "base64");
  const payload = Buffer.from(payloadBase64, "base64");

  const decipher = crypto.createDecipheriv(ALGORITHM, getEncryptionKey(), iv);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([decipher.update(payload), decipher.final()]);
  return decrypted.toString("utf8");
};
