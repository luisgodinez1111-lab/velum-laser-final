import { IntegrationJob, IntegrationJobStatus, Prisma } from "@prisma/client";
import { prisma } from "../db/prisma";
import { logger } from "../utils/logger";

export type IntegrationJobType =
  | "google.sync.full"
  | "google.sync.incremental"
  | "google.watch.ensure"
  | "google.appointment.create"
  | "google.appointment.update"
  | "google.appointment.cancel";

export type IntegrationJobPayload = Prisma.InputJsonValue;

const MAX_BATCH_PER_TICK = 8;

const calculateBackoffMs = (attempt: number) => {
  const baseSeconds = Math.min(5 * 2 ** Math.max(attempt - 1, 0), 60 * 10);
  return baseSeconds * 1000;
};

export const enqueueIntegrationJob = async (args: {
  clinicId: string;
  type: IntegrationJobType;
  payload: IntegrationJobPayload;
  googleIntegrationId?: string | null;
  runAt?: Date;
  maxAttempts?: number;
}) => {
  return prisma.integrationJob.create({
    data: {
      clinicId: args.clinicId,
      type: args.type,
      payload: args.payload,
      googleIntegrationId: args.googleIntegrationId ?? null,
      runAt: args.runAt ?? new Date(),
      maxAttempts: args.maxAttempts ?? 8
    }
  });
};

const claimNextPendingJob = async (): Promise<IntegrationJob | null> => {
  const now = new Date();

  return prisma.$transaction(async (tx) => {
    const candidate = await tx.integrationJob.findFirst({
      where: {
        status: "pending",
        runAt: { lte: now }
      },
      orderBy: [{ runAt: "asc" }, { createdAt: "asc" }]
    });

    if (!candidate) {
      return null;
    }

    const claim = await tx.integrationJob.updateMany({
      where: {
        id: candidate.id,
        status: "pending"
      },
      data: {
        status: "processing",
        lockedAt: now,
        attempts: { increment: 1 }
      }
    });

    if (claim.count === 0) {
      return null;
    }

    return tx.integrationJob.findUnique({ where: { id: candidate.id } });
  });
};

export const claimIntegrationJobsBatch = async () => {
  const jobs: IntegrationJob[] = [];

  for (let index = 0; index < MAX_BATCH_PER_TICK; index += 1) {
    const job = await claimNextPendingJob();
    if (!job) {
      break;
    }
    jobs.push(job);
  }

  return jobs;
};

export const markIntegrationJobDone = async (jobId: string) => {
  await prisma.integrationJob.update({
    where: { id: jobId },
    data: {
      status: "done",
      finishedAt: new Date(),
      lockedAt: null,
      lastError: null
    }
  });
};

export const markIntegrationJobError = async (job: IntegrationJob, error: unknown) => {
  const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  const attemptsExhausted = job.attempts >= job.maxAttempts;

  if (attemptsExhausted) {
    await prisma.integrationJob.update({
      where: { id: job.id },
      data: {
        status: "failed",
        finishedAt: new Date(),
        lockedAt: null,
        lastError: message
      }
    });

    logger.error({ jobId: job.id, type: job.type, message }, "Integration job permanently failed");
    return;
  }

  const retryAt = new Date(Date.now() + calculateBackoffMs(job.attempts));

  await prisma.integrationJob.update({
    where: { id: job.id },
    data: {
      status: "pending",
      runAt: retryAt,
      lockedAt: null,
      lastError: message
    }
  });

  logger.warn({ jobId: job.id, type: job.type, message, retryAt }, "Integration job scheduled for retry");
};

export const resetProcessingIntegrationJobs = async () => {
  await prisma.integrationJob.updateMany({
    where: { status: IntegrationJobStatus.processing },
    data: {
      status: IntegrationJobStatus.pending,
      lockedAt: null,
      runAt: new Date()
    }
  });
};
