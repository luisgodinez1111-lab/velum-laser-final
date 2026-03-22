import { prisma } from "../db/prisma";

export type StripePlanMapping = {
  planCode: string;
  name: string;
  amount: number;
  interval: "day" | "week" | "month" | "year";
  stripePriceId: string;
  active: boolean;
};

const SETTING_KEY = "stripe_plan_catalog_v1";
let memoryPlans: StripePlanMapping[] = [];

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
  const x = v as any;
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

const getAppSettingModel = (): any | null => {
  const model = prisma.appSetting;
  if (!model) return null;
  if (typeof model.findUnique !== "function" || typeof model.upsert !== "function") return null;
  return model;
};

export const readStripePlanCatalog = async (): Promise<StripePlanMapping[]> => {
  const model = getAppSettingModel();
  if (!model) return memoryPlans;

  try {
    const row = await model.findUnique({
      where: { key: SETTING_KEY },
      select: { value: true },
    });

    const rawPlans: unknown[] = Array.isArray((row?.value as any)?.plans)
      ? ((row?.value as any).plans as unknown[])
      : [];

    const mapped: Array<StripePlanMapping | null> = rawPlans.map((item: unknown) => normalizePlan(item));
    const plans = dedupe(
      mapped.filter((item: StripePlanMapping | null): item is StripePlanMapping => item !== null)
    );

    memoryPlans = plans;
    return plans;
  } catch {
    return memoryPlans;
  }
};

export const saveStripePlanCatalog = async (incoming: StripePlanMapping[]): Promise<StripePlanMapping[]> => {
  const mapped: Array<StripePlanMapping | null> = incoming.map((item: StripePlanMapping) => normalizePlan(item));
  const plans = dedupe(
    mapped.filter((item: StripePlanMapping | null): item is StripePlanMapping => item !== null)
  );

  memoryPlans = plans;

  const model = getAppSettingModel();
  if (!model) return plans;

  try {
    await model.upsert({
      where: { key: SETTING_KEY },
      update: { value: { plans } as any },
      create: { key: SETTING_KEY, value: { plans } as any },
    });
  } catch {
    // fallback memoria
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
