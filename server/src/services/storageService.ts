import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import crypto from "crypto";
import { env } from "../utils/env";

if (!env.s3Bucket || !env.s3AccessKeyId || !env.s3SecretAccessKey) {
  throw new Error("S3 credentials are required");
}

const s3Client = new S3Client({
  region: env.s3Region,
  endpoint: env.s3Endpoint,
  credentials: {
    accessKeyId: env.s3AccessKeyId,
    secretAccessKey: env.s3SecretAccessKey
  },
  forcePathStyle: Boolean(env.s3Endpoint)
});

export const generateStorageKey = (userId: string, contentType: string) => {
  const extension = contentType.split("/")[1] ?? "bin";
  return `${userId}/${crypto.randomUUID()}.${extension}`;
};

export const createUploadUrl = async ({
  key,
  contentType,
  size
}: {
  key: string;
  contentType: string;
  size: number;
}) => {
  const command = new PutObjectCommand({
    Bucket: env.s3Bucket,
    Key: key,
    ContentType: contentType,
    ContentLength: size
  });
  return getSignedUrl(s3Client, command, { expiresIn: 900 });
};

export const createDownloadUrl = async (key: string) => {
  const command = new GetObjectCommand({
    Bucket: env.s3Bucket,
    Key: key
  });
  return getSignedUrl(s3Client, command, { expiresIn: 300 });
};
