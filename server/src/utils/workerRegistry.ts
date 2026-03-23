import { prisma } from "../db/prisma";

const PREFIX = "worker_last_run:";

/** Called at the END of a successful cron job run to record its timestamp. */
export const recordWorkerRun = async (workerName: string): Promise<void> => {
  const key = PREFIX + workerName;
  await prisma.appSetting.upsert({
    where: { key },
    create: { key, value: { lastRunAt: new Date().toISOString() } },
    update: { value: { lastRunAt: new Date().toISOString() } },
  }).catch(() => {});
};

/** Returns a map of workerName → lastRunAt for all registered workers. */
export const getWorkerStatus = async (): Promise<Record<string, string | null>> => {
  const settings = await prisma.appSetting.findMany({
    where: { key: { startsWith: PREFIX } },
    select: { key: true, value: true },
  });
  const result: Record<string, string | null> = {};
  for (const s of settings) {
    const name = s.key.replace(PREFIX, "");
    const val = s.value as { lastRunAt?: string } | null;
    result[name] = val?.lastRunAt ?? null;
  }
  return result;
};
