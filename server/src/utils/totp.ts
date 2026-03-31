import { createHmac, randomBytes, timingSafeEqual } from "crypto";

const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const TIME_STEP = 30;
const DIGITS = 6;
const WINDOW = 1; // ±1 step de tolerancia

/** Genera un secreto TOTP base32 de 20 bytes (compatible con Google Authenticator). */
export const generateTotpSecret = (): string => {
  const bytes = randomBytes(20);
  let result = "";
  let buffer = 0, bitsLeft = 0;
  for (const byte of bytes) {
    buffer = (buffer << 8) | byte;
    bitsLeft += 8;
    while (bitsLeft >= 5) {
      bitsLeft -= 5;
      result += BASE32[(buffer >> bitsLeft) & 31];
    }
  }
  return result;
};

const decodeBase32 = (s: string): Buffer => {
  const bytes: number[] = [];
  let buf = 0, bits = 0;
  for (const c of s.toUpperCase().replace(/=+$/, "")) {
    const idx = BASE32.indexOf(c);
    if (idx < 0) continue;
    buf = (buf << 5) | idx;
    bits += 5;
    if (bits >= 8) { bits -= 8; bytes.push((buf >> bits) & 0xff); }
  }
  return Buffer.from(bytes);
};

const hotp = (secret: string, counter: bigint): string => {
  const key = decodeBase32(secret);
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(counter);
  const hmac = createHmac("sha1", key).update(msg).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code =
    ((hmac[offset] & 0x7f) << 24) |
    (hmac[offset + 1] << 16) |
    (hmac[offset + 2] << 8) |
    hmac[offset + 3];
  return String(code % Math.pow(10, DIGITS)).padStart(DIGITS, "0");
};

/** Verifica un código TOTP con ventana de tolerancia de ±1 paso (30s). Tiempo-constante. */
export const verifyTotpCode = (secret: string, code: string): boolean => {
  if (!/^\d{6}$/.test(code)) return false;
  const now = BigInt(Math.floor(Date.now() / 1000 / TIME_STEP));
  for (let i = -WINDOW; i <= WINDOW; i++) {
    const expected = Buffer.from(hotp(secret, now + BigInt(i)));
    const actual   = Buffer.from(code);
    if (expected.length === actual.length && timingSafeEqual(expected, actual)) return true;
  }
  return false;
};

/** URI otpauth:// para QR code — compatible con Google/Microsoft Authenticator, Authy. */
export const getTotpUri = (secret: string, email: string, issuer = "VELUM Laser"): string =>
  `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(email)}` +
  `?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
