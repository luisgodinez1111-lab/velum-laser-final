import crypto from "crypto";
import fs from "fs/promises";
import path from "path";
import { env } from "../utils/env";

// ──────────────────────────────────────────────────────────────────────
// Storage con dos drivers seleccionables vía STORAGE_DRIVER:
//   "local" → filesystem (VPS con volumen persistente). Comportamiento original.
//   "r2"    → Cloudflare R2 (S3-compatible). Para hosts con FS efímero.
//
// La interfaz pública (generateStorageKey / saveFile / readFile / getFilePath)
// no cambia: los callers (documentController) son agnósticos al driver.
// ──────────────────────────────────────────────────────────────────────

const isR2 = env.storageDriver === "r2";

// ── Helpers driver local ──────────────────────────────────────────────
const ensureUploadDir = async () => {
  await fs.mkdir(env.uploadDir, { recursive: true });
};

// Normaliza la key evitando path traversal (..) y la resuelve dentro de uploadDir.
const resolveStoragePath = (key: string) => {
  const normalized = path.normalize(key).replace(/^(\.\.(\/|\\|$))+/, "");
  const fullPath = path.join(env.uploadDir, normalized);
  const resolvedBase = path.resolve(env.uploadDir);
  const resolvedPath = path.resolve(fullPath);
  if (!resolvedPath.startsWith(resolvedBase)) {
    throw new Error("Ruta inválida");
  }
  return resolvedPath;
};

// ── Cliente R2 (S3) — singleton perezoso ───────────────────────────────
// Import dinámico: en driver "local" nunca se carga @aws-sdk/client-s3,
// así que entornos de test/dev sin la dependencia siguen funcionando.
let r2ClientPromise: Promise<import("@aws-sdk/client-s3").S3Client> | null = null;
const getR2Client = () => {
  if (!r2ClientPromise) {
    if (!env.r2.bucket || !env.r2.endpoint || !env.r2.accessKeyId || !env.r2.secretAccessKey) {
      throw new Error(
        "[storage] STORAGE_DRIVER=r2 pero falta configuración R2 " +
        "(R2_BUCKET / R2_ENDPOINT / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY).",
      );
    }
    r2ClientPromise = import("@aws-sdk/client-s3").then(({ S3Client }) =>
      new S3Client({
        region: env.r2.region,
        endpoint: env.r2.endpoint,
        credentials: {
          accessKeyId: env.r2.accessKeyId,
          secretAccessKey: env.r2.secretAccessKey,
        },
      }),
    );
  }
  return r2ClientPromise;
};

// Normaliza la key para R2 (sin traversal, sin leading slash).
const r2Key = (key: string) => path.posix.normalize(key).replace(/^(\.\.(\/|$))+/, "").replace(/^\/+/, "");

// ── API pública ────────────────────────────────────────────────────────

export const generateStorageKey = (userId: string, contentType: string) => {
  const extension = contentType.split("/")[1] ?? "bin";
  return path.join(userId, `${crypto.randomUUID()}.${extension}`);
};

export const saveFile = async ({
  key,
  buffer,
  contentType,
}: {
  key: string;
  buffer: Buffer;
  contentType?: string;
}) => {
  if (isR2) {
    const client = await getR2Client();
    const { PutObjectCommand } = await import("@aws-sdk/client-s3");
    const objectKey = r2Key(key);
    await client.send(new PutObjectCommand({
      Bucket: env.r2.bucket,
      Key: objectKey,
      Body: buffer,
      ContentType: contentType,
    }));
    return objectKey;
  }

  await ensureUploadDir();
  const fullPath = resolveStoragePath(key);
  await fs.mkdir(path.dirname(fullPath), { recursive: true });
  await fs.writeFile(fullPath, buffer);
  return fullPath;
};

// Devuelve el contenido del archivo como Buffer. Funciona en ambos drivers —
// es la vía recomendada para servir descargas de forma agnóstica al storage.
export const readFile = async (key: string): Promise<Buffer> => {
  if (isR2) {
    const client = await getR2Client();
    const { GetObjectCommand } = await import("@aws-sdk/client-s3");
    const res = await client.send(new GetObjectCommand({
      Bucket: env.r2.bucket,
      Key: r2Key(key),
    }));
    if (!res.Body) {
      throw new Error(`[storage] objeto R2 sin cuerpo: ${key}`);
    }
    const bytes = await (res.Body as { transformToByteArray: () => Promise<Uint8Array> }).transformToByteArray();
    return Buffer.from(bytes);
  }

  const fullPath = resolveStoragePath(key);
  return fs.readFile(fullPath);
};

// Solo válido en driver local — R2 no tiene path de filesystem. Los callers
// que sirven descargas deben usar readFile() (agnóstico). Se mantiene por
// compatibilidad con cualquier uso local restante.
export const getFilePath = async (key: string) => {
  if (isR2) {
    throw new Error("[storage] getFilePath no está disponible con STORAGE_DRIVER=r2; usa readFile()");
  }
  await ensureUploadDir();
  return resolveStoragePath(key);
};
