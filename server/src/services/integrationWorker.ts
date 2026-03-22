import { env } from "../utils/env";
import { logger } from "../utils/logger";
import {
  claimIntegrationJobsBatch,
  enqueueIntegrationJob,
  IntegrationJobType,
  markIntegrationJobDone,
  markIntegrationJobError,
  resetProcessingIntegrationJobs
} from "./integrationJobService";
import { runGoogleIntegrationJobByType } from "./googleCalendarIntegrationService";
import { isGoogleCalendarConfigured } from "./googleCalendarClient";

const JOB_POLL_INTERVAL_MS = 2000;
const WATCH_SWEEP_INTERVAL_MS = 15 * 60 * 1000;

let started = false;
let isTickInProgress = false;
let pollTimer: NodeJS.Timeout | null = null;
let watchTimer: NodeJS.Timeout | null = null;

const processQueueTick = async () => {
  if (isTickInProgress) {
    return;
  }

  isTickInProgress = true;
  try {
    const jobs = await claimIntegrationJobsBatch();

    for (const job of jobs) {
      try {
        await runGoogleIntegrationJobByType(
          job.type as IntegrationJobType,
          job.payload,
          job.clinicId,
          job.googleIntegrationId
        );
        await markIntegrationJobDone(job.id);
      } catch (error: unknown) {
        await markIntegrationJobError(job, error);
      }
    }
  } catch (error: unknown) {
    logger.error({ err: error }, "Integration worker tick failed");
  } finally {
    isTickInProgress = false;
  }
};

const enqueueWatchSweep = async () => {
  if (!isGoogleCalendarConfigured()) {
    logger.debug("Google Calendar not configured — skipping watch sweep enqueue");
    return;
  }
  try {
    await enqueueIntegrationJob({
      clinicId: env.defaultClinicId,
      type: "google.watch.ensure",
      payload: { source: "worker_timer" },
      maxAttempts: 3
    });
  } catch (error: unknown) {
    logger.error({ err: error }, "Unable to enqueue Google watch sweep job");
  }
};

export const startIntegrationWorker = async () => {
  if (started || env.nodeEnv === "test") {
    return;
  }

  started = true;

  await resetProcessingIntegrationJobs();

  pollTimer = setInterval(() => {
    void processQueueTick();
  }, JOB_POLL_INTERVAL_MS);

  watchTimer = setInterval(() => {
    void enqueueWatchSweep();
  }, WATCH_SWEEP_INTERVAL_MS);

  void processQueueTick();
  void enqueueWatchSweep();

  logger.info("Integration worker started");
};

export const stopIntegrationWorker = () => {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }

  if (watchTimer) {
    clearInterval(watchTimer);
    watchTimer = null;
  }

  started = false;
};
