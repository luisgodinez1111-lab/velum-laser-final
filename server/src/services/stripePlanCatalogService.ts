import { Prisma } from "@prisma/client";
import { prisma } from "../db/prisma";
import { logger } from "../utils/logger";

export type StripePlanMapping = {
  planCode: string;
  name: string;
  amount: number;
  interval: "day" | "week" | "month" | "year";
  stripePriceId: string;
  active: boolean;
};

const SETTING_KEY = "stripe_plan_catalog_v1";
const CATALOG_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

let memoryPlans: StripePlanMapping[] = [];
let cacheAt = 0; // timestamp of last successful DB read

export const invalidatePlanCatalogCache = (): void => { cacheAt = 0; };

const asString = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
const asNumber = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const asBool = (v: unknown): boolean => {
  if (typeof v === "boolean") return v;
  if (typeof v === "string") return ["true", "1", "yes", "on"].includes(v.toLowerCase().trim());
  return false;
};

const normalizeInterval = (v: unknown): "day" | "week" | "month" | "year" => {
  const s = asString(v).toLowerCase();
  if (s === "day" || s === "week" || s === "year") return s;
  return "month";
};

const normalizePlan = (v: unknown): StripePlanMapping | null => {
  if (!v || typeof v !== "object") return null;
  const x = v as Record<string, unknown>;
  const planCode = asString(x.planCode).toLowerCase();
  const name = asString(x.name);
  const stripePriceId = asString(x.stripePriceId);
  const amount = asNumber(x.amount);
  const interval = normalizeInterval(x.interval);
  const active = asBool(x.active);

  if (!planCode || !name) return null;

  return {
    planCode,
    name,
    amount,
    interval,
    stripePriceId,
    active,
  };
};

const dedupe = (plans: StripePlanMapping[]): StripePlanMapping[] => {
  const out = new Map<string, StripePlanMapping>();
  for (const p of plans) out.set(p.planCode, p);
  return Array.from(out.values());
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- duck typing: appSetting puede no existir en todas las versiones del schema
const getAppSettingModel = (): any | null => {
  const model = prisma.appSetting;
  if (!model) return null;
  if (typeof model.findUnique !== "function" || typeof model.upsert !== "function") return null;
  return model;
};

export const readStripePlanCatalog = async (): Promise<StripePlanMapping[]> => {
  // Return cached result if fresh
  if (memoryPlans.length > 0 && Date.now() - cacheAt < CATALOG_CACHE_TTL_MS) {
    return memoryPlans;
  }

  const model = getAppSettingModel();
  if (!model) return memoryPlans;

  try {
    const row = await model.findUnique({
      where: { key: SETTING_KEY },
      select: { value: true },
    });

    const rowValue = row?.value as Record<string, unknown> | null | undefined;
    const rawPlans: unknown[] = Array.isArray(rowValue?.plans) ? (rowValue.plans as unknown[]) : [];

    const mapped: Array<StripePlanMapping | null> = rawPlans.map((item: unknown) => normalizePlan(item));
    const plans = dedupe(
      mapped.filter((item: StripePlanMapping | null): item is StripePlanMapping => item !== null)
    );

    memoryPlans = plans;
    cacheAt = Date.now();
    return plans;
  } catch (err) {
    logger.warn({ err }, "[stripePlanCatalog] error leyendo catálogo desde DB — usando cache en memoria");
    return memoryPlans;
  }
};

export const saveStripePlanCatalog = async (incoming: StripePlanMapping[]): Promise<StripePlanMapping[]> => {
  const mapped: Array<StripePlanMapping | null> = incoming.map((item: StripePlanMapping) => normalizePlan(item));
  const plans = dedupe(
    mapped.filter((item: StripePlanMapping | null): item is StripePlanMapping => item !== null)
  );

  memoryPlans = plans;
  cacheAt = Date.now(); // refresh cache timestamp on save too

  const model = getAppSettingModel();
  if (!model) return plans;

  try {
    await model.upsert({
      where: { key: SETTING_KEY },
      update: { value: { plans } as Prisma.InputJsonValue },
      create: { key: SETTING_KEY, value: { plans } as Prisma.InputJsonValue },
    });
  } catch (err) {
    logger.warn({ err }, "[stripePlanCatalog] error guardando catálogo en DB — solo se actualizó el cache en memoria");
  }

  return plans;
};

export const findActivePlanByCode = async (planCode: string): Promise<StripePlanMapping | null> => {
  const code = asString(planCode).toLowerCase();
  if (!code) return null;
  const plans = await readStripePlanCatalog();
  const found = plans.find((p) => p.planCode === code && p.active && !!p.stripePriceId);
  return found || null;
};
