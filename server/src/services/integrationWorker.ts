import { env } from "../utils/env";
import { logger } from "../utils/logger";
import { reportError } from "../utils/errorReporter";
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

const JOB_POLL_INTERVAL_MS = env.integrationJobPollMs;
const WATCH_SWEEP_INTERVAL_MS = env.integrationWatchSweepMs;

let started = false;
let isTickInProgress = false;
let pollTimer: NodeJS.Timeout | null = null;
let watchTimer: NodeJS.Timeout | null = null;
let consecutiveTickFailures = 0;
const MAX_CONSECUTIVE_FAILURES = 5;

const processQueueTick = async () => {
  if (isTickInProgress) {
    return;
  }

  isTickInProgress = true;
  try {
    const jobs = await claimIntegrationJobsBatch();
    let failedCount = 0;

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
        failedCount += 1;
        await markIntegrationJobError(job, error);
      }
    }

    if (failedCount > 0) {
      logger.warn({ failedCount, totalJobs: jobs.length }, "[integration-worker] tick completed with failures");
    }
  } catch (error: unknown) {
    consecutiveTickFailures += 1;
    logger.error({ err: error, consecutiveFailures: consecutiveTickFailures }, "Integration worker tick failed");
    if (consecutiveTickFailures === MAX_CONSECUTIVE_FAILURES) {
      // Disparar alerta una sola vez al alcanzar el umbral (=== evita spam en ticks subsecuentes)
      logger.error(
        { consecutiveFailures: consecutiveTickFailures },
        `[integration-worker] ${consecutiveTickFailures} consecutive tick failures — check DB connectivity and GCal config`
      );
      reportError(
        new Error(`[integration-worker] ${MAX_CONSECUTIVE_FAILURES} consecutive tick failures`),
        { consecutiveFailures: consecutiveTickFailures, hint: "Revisar conectividad DB y configuración Google Calendar" }
      );
    }
    return;
  } finally {
    isTickInProgress = false;
  }
  consecutiveTickFailures = 0; // reset on successful tick
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
