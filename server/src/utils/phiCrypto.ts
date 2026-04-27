/**
 * PHI cipher — Fase 1.3.
 *
 * Cifrado de campo a nivel aplicación para datos médicos sensibles
 * (signatureImageData, personalJson, etc.). Distinto del flujo de
 * INTEGRATIONS_ENC_KEY (Google Calendar tokens) — mantener keys
 * separadas para que un leak de una no exponga pacientes.
 *
 * Formato del ciphertext: `phi:v1:<aes-gcm-payload>`
 *   - prefix `phi:`  → distinguible de plaintext en logs/dumps
 *   - versión `v1:`  → permite migrar a v2 (rotación de master key,
 *                       cambio de algoritmo, envelope encryption por tenant)
 *
 * Detección: `isEncrypted(s)` permite que las migraciones de datos sean
 * idempotentes — si una fila ya fue cifrada, no se vuelve a cifrar.
 *
 * Roadmap:
 *   v1 (esta fase) — master key directa en env. Single-tenant.
 *   v2 — envelope encryption: DEK por tenant cifrada con KEK (master).
 *        Permite revocar acceso a un tenant sin re-cifrar todo.
 *   v3 — KEK en HashiCorp Vault o cloud KMS, no en env.
 *
 * Limitaciones:
 *   - Cifrar un campo destruye búsqueda directa (`WHERE field ILIKE '%x%'`).
 *     Solo cifrar campos donde la búsqueda no aplica o se hace por hash.
 *   - El master key NO se rota automáticamente. La rotación requiere
 *     re-cifrar todos los datos — proceso documentado en docs/runbooks/.
 */
import { aesGcmEncrypt, aesGcmDecrypt, deriveKey } from "./crypto";

const PREFIX = "phi:v1:";

let _phiKey: Buffer | undefined;

// Leer PHI_MASTER_KEY directamente de process.env (no vía env.ts).
// Razón: el helper se lazy-evalúa al primer encrypt/decrypt — si lo
// hiciéramos al import time vía env.ts, romperíamos boot en dev sin la key
// y obligaríamos a setearla en tests con orden frágil de cargas.
const getPhiKey = (): Buffer => {
  if (_phiKey) return _phiKey;
  const raw = (process.env.PHI_MASTER_KEY ?? "").trim();
  if (!raw || raw.length < 32) {
    throw new Error(
      "PHI_MASTER_KEY no configurada (mínimo 32 bytes). Genera con: " +
      "node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"",
    );
  }
  _phiKey = deriveKey(raw);
  return _phiKey;
};

/** Detecta si un valor ya está cifrado en formato PHI v1. Útil para migraciones idempotentes. */
export const isEncrypted = (value: string | null | undefined): boolean =>
  typeof value === "string" && value.startsWith(PREFIX);

/** Cifra un valor PHI. Si ya está cifrado, lo devuelve tal cual (idempotente). */
export const encryptPhi = (plainText: string): string => {
  if (isEncrypted(plainText)) return plainText;
  return PREFIX + aesGcmEncrypt(plainText, getPhiKey());
};

/** Descifra. Si no tiene prefix v1 (legacy plaintext), lo devuelve tal cual. */
export const decryptPhi = (cipherText: string): string => {
  if (!isEncrypted(cipherText)) return cipherText;
  return aesGcmDecrypt(cipherText.slice(PREFIX.length), getPhiKey());
};

/** Helper para campos opcionales: encripta si hay valor, devuelve null si no. */
export const encryptPhiNullable = (plain: string | null | undefined): string | null =>
  plain == null ? null : encryptPhi(plain);

export const decryptPhiNullable = (cipher: string | null | undefined): string | null =>
  cipher == null ? null : decryptPhi(cipher);

/** Solo para tests — borra el cache de la key. NO usar en runtime. */
export const _resetPhiKeyCache = (): void => { _phiKey = undefined; };

// ── Compat layer para signatureImageData ─────────────────────────────
// El sistema venía cifrando signatures con INTEGRATIONS_ENC_KEY usando
// prefix `enc1:`. Migración a PHI_MASTER_KEY:
//
//   1. Lectura: decryptSignature() entiende AMBOS formatos (legacy + nuevo)
//                + texto plano (datos pre-cifrado).
//   2. Escritura: encryptSignature() produce SOLO `phi:v1:...`.
//   3. Migración de datos: scripts/migrate-signatures-to-phi.ts descifra
//      `enc1:` con la KEK vieja y re-cifra con PHI_MASTER_KEY.
//
// Cuando todas las filas estén migradas (verificable con un SQL count),
// podemos dejar de aceptar `enc1:` en lectura y borrar este compat layer.
import { decrypt as legacyDecrypt } from "./crypto";

const LEGACY_PREFIX = "enc1:";

export const encryptSignature = (plain: string): string => encryptPhi(plain);

export const decryptSignature = (val: string | null | undefined): string | null => {
  if (val == null) return null;
  if (isEncrypted(val)) {
    try { return decryptPhi(val); } catch { return null; }
  }
  if (val.startsWith(LEGACY_PREFIX)) {
    try { return legacyDecrypt(val.slice(LEGACY_PREFIX.length)); } catch { return null; }
  }
  // Texto plano legacy (anterior a cualquier cifrado).
  return val;
};
