import crypto from "crypto";
import fs from "fs/promises";
import path from "path";
import { env } from "../utils/env";

const ensureUploadDir = async () => {
  await fs.mkdir(env.uploadDir, { recursive: true });
};

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

export const generateStorageKey = (userId: string, contentType: string) => {
  const extension = contentType.split("/")[1] ?? "bin";
  return path.join(userId, `${crypto.randomUUID()}.${extension}`);
};

export const saveFile = async ({
  key,
  buffer
}: {
  key: string;
  buffer: Buffer;
}) => {
  await ensureUploadDir();
  const fullPath = resolveStoragePath(key);
  await fs.mkdir(path.dirname(fullPath), { recursive: true });
  await fs.writeFile(fullPath, buffer);
  return fullPath;
};

export const readFile = async (key: string) => {
  const fullPath = resolveStoragePath(key);
  return fs.readFile(fullPath);
};

export const getFilePath = async (key: string) => {
  await ensureUploadDir();
  return resolveStoragePath(key);
};
