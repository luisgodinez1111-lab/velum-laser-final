import crypto from "crypto";
import { env } from "./env";

const TOKEN_TTL_HOURS = 72;

export const generateAppointmentConfirmToken = (appointmentId: string): string => {
  const expiresAt = Date.now() + TOKEN_TTL_HOURS * 3600 * 1000;
  const payload = `${appointmentId}:${expiresAt}`;
  const sig = crypto.createHmac("sha256", env.jwtSecret).update(payload).digest("hex");
  return Buffer.from(`${payload}:${sig}`).toString("base64url");
};

export const verifyAppointmentConfirmToken = (token: string): string | null => {
  try {
    const decoded = Buffer.from(token, "base64url").toString("utf8");
    const parts = decoded.split(":");
    if (parts.length !== 3) return null;
    const [appointmentId, expiresAt, sig] = parts;
    if (Date.now() > Number(expiresAt)) return null;
    const expected = crypto.createHmac("sha256", env.jwtSecret).update(`${appointmentId}:${expiresAt}`).digest("hex");
    if (!crypto.timingSafeEqual(Buffer.from(sig, "hex"), Buffer.from(expected, "hex"))) return null;
    return appointmentId;
  } catch {
    return null;
  }
};
