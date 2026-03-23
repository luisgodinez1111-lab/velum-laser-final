import { prisma } from "../db/prisma";
import { Prisma } from "@prisma/client";
import { env as appEnv } from "../utils/env";

export type StripeConfig = {
  secretKey: string;
  publishableKey: string;
  webhookSecret: string;
};

const SETTING_KEY = "stripe_config";
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

let _cache: { data: { source: "database" | "env"; config: StripeConfig }; expiresAt: number } | null = null;

const asString = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

const mask = (value: string): string => {
  const v = asString(value);
  if (!v) return "";
  if (v.length <= 8) return `${v.slice(0, 2)}...${v.slice(-2)}`;
  return `${v.slice(0, 4)}...${v.slice(-4)}`;
};

const getAppSettingModel = (): typeof prisma.appSetting | null => {
  const model = prisma.appSetting;
  if (!model) return null;
  if (typeof model.findUnique !== "function" || typeof model.upsert !== "function") return null;
  return model;
};

const fromEnv = (): StripeConfig => ({
  secretKey: asString(appEnv.stripeSecretKey),
  publishableKey: asString(appEnv.stripePublishableKey),
  webhookSecret: asString(appEnv.stripeWebhookSecret),
});

const normalize = (v: unknown): StripeConfig => {
  const raw = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  return {
    secretKey: asString(raw.secretKey),
    publishableKey: asString(raw.publishableKey),
    webhookSecret: asString(raw.webhookSecret),
  };
};

export const resolveStripeConfig = async (): Promise<{ source: "database" | "env"; config: StripeConfig }> => {
  // Return cached result if still valid
  if (_cache && Date.now() < _cache.expiresAt) return _cache.data;

  const env = fromEnv();
  const model = getAppSettingModel();
  if (!model) return { source: "env", config: env };

  try {
    const row = await model.findUnique({ where: { key: SETTING_KEY }, select: { value: true } });
    const db = normalize(row?.value ?? {});
    const hasDb = !!(db.secretKey || db.publishableKey || db.webhookSecret);

    const result = hasDb
      ? {
          source: "database" as const,
          config: {
            secretKey: db.secretKey || env.secretKey,
            publishableKey: db.publishableKey || env.publishableKey,
            webhookSecret: db.webhookSecret || env.webhookSecret,
          },
        }
      : { source: "env" as const, config: env };

    _cache = { data: result, expiresAt: Date.now() + CACHE_TTL_MS };
    return result;
  } catch {
    return { source: "env", config: env };
  }
};

/** Invalida el caché cuando se guarda una nueva configuración. */
export const invalidateStripeConfigCache = (): void => { _cache = null; };

export const saveStripeConfig = async (incoming: Partial<StripeConfig>): Promise<{ source: "database" | "env"; config: StripeConfig }> => {
  const current = await resolveStripeConfig();
  const next: StripeConfig = {
    secretKey: asString(incoming.secretKey) || current.config.secretKey,
    publishableKey: asString(incoming.publishableKey) || current.config.publishableKey,
    webhookSecret: asString(incoming.webhookSecret) || current.config.webhookSecret,
  };

  const model = getAppSettingModel();
  if (!model) return { source: "env", config: next };

  await model.upsert({
    where: { key: SETTING_KEY },
    update: { value: next as unknown as Prisma.InputJsonValue },
    create: { key: SETTING_KEY, value: next as unknown as Prisma.InputJsonValue },
  });

  invalidateStripeConfigCache();
  return { source: "database", config: next };
};

export const presentStripeConfig = (source: "database" | "env", config: StripeConfig) => ({
  source,
  configured: !!(config.secretKey && config.publishableKey && config.webhookSecret),
  hasSecretKey: !!config.secretKey,
  hasPublishableKey: !!config.publishableKey,
  hasWebhookSecret: !!config.webhookSecret,
  secretKeyMasked: mask(config.secretKey),
  publishableKeyMasked: mask(config.publishableKey),
  webhookSecretMasked: mask(config.webhookSecret),
});
