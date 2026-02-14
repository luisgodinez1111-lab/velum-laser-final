import { prisma } from "../db/prisma.js";
import type { FileCategory } from "@prisma/client";
import { randomUUID } from "crypto";
import { writeFile, mkdir, unlink } from "fs/promises";
import { join } from "path";

const UPLOAD_DIR = process.env.UPLOAD_DIR || join(process.cwd(), "uploads");

export const fileUploadService = {
  async upload(data: {
    userId: string;
    category: FileCategory;
    fileName: string;
    mimeType: string;
    size: number;
    buffer: Buffer;
    entityType?: string;
    entityId?: string;
  }) {
    await mkdir(UPLOAD_DIR, { recursive: true });

    const ext = data.fileName.split(".").pop() || "bin";
    const storageKey = `${Date.now()}-${randomUUID()}.${ext}`;
    const filePath = join(UPLOAD_DIR, storageKey);

    await writeFile(filePath, data.buffer);

    return prisma.fileUpload.create({
      data: {
        userId: data.userId,
        category: data.category,
        fileName: data.fileName,
        mimeType: data.mimeType,
        size: data.size,
        storageKey,
        entityType: data.entityType,
        entityId: data.entityId,
      },
    });
  },

  async getByEntity(entityType: string, entityId: string) {
    return prisma.fileUpload.findMany({
      where: { entityType, entityId },
      orderBy: { createdAt: "desc" },
    });
  },

  async getByUser(userId: string) {
    return prisma.fileUpload.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });
  },

  async getById(id: string) {
    return prisma.fileUpload.findUnique({ where: { id } });
  },

  async deleteFile(id: string) {
    const file = await prisma.fileUpload.findUnique({ where: { id } });
    if (!file) throw new Error("File not found");

    const filePath = join(UPLOAD_DIR, file.storageKey);
    try {
      await unlink(filePath);
    } catch {
      // file may already be gone
    }

    return prisma.fileUpload.delete({ where: { id } });
  },

  getFilePath(storageKey: string) {
    return join(UPLOAD_DIR, storageKey);
  },
};
