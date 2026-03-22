import https from "node:https";
import { prisma } from "../db/prisma";

export type WhatsappMetaConfig = {
  accessToken: string;
  phoneNumberId: string;
  templateName: string;
  reminderTemplateName: string;
  templateLang: string;
  allowConsole: boolean;
};

const SETTING_KEY = "whatsapp_meta_config";

const asString = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

const asBoolean = (v: unknown, fallback = false): boolean => {
  if (typeof v === "boolean") return v;
  if (typeof v === "string") {
    const x = v.trim().toLowerCase();
    if (x === "true") return true;
    if (x === "false") return false;
  }
  return fallback;
};

const parseMaybeJson = (value: unknown): any => {
  if (!value) return null;
  if (typeof value === "object") return value;
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  }
  return null;
};

export const normalizePhone = (input: string): string => {
  const raw = asString(input);
  const cleaned = raw.replace(/[^\d+]/g, "");
  if (!cleaned) return "";
  if (cleaned.startsWith("+")) return cleaned;
  return `+${cleaned}`;
};

const ensureSettingsTable = async () => {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "SystemSetting" (
      "key" TEXT PRIMARY KEY,
      "value" JSONB NOT NULL,
      "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
};

export const getStoredWhatsappMetaConfig = async (): Promise<WhatsappMetaConfig | null> => {
  await ensureSettingsTable();

  const rows = await prisma.$queryRawUnsafe<Array<{ value: unknown }>>(
    'SELECT "value" FROM "SystemSetting" WHERE "key" = $1 LIMIT 1',
    SETTING_KEY
  );

  if (!rows?.length) return null;
  const raw = parseMaybeJson(rows[0].value);
  if (!raw) return null;

  return {
    accessToken: asString(raw.accessToken),
    phoneNumberId: asString(raw.phoneNumberId),
    templateName: asString(raw.templateName),
    reminderTemplateName: asString(raw.reminderTemplateName),
    templateLang: asString(raw.templateLang || "es_MX"),
    allowConsole: asBoolean(raw.allowConsole, false)
  };
};

export const getEffectiveWhatsappMetaConfig = async (): Promise<WhatsappMetaConfig> => {
  const db = await getStoredWhatsappMetaConfig();

  return {
    accessToken: asString(db?.accessToken || process.env.META_WA_ACCESS_TOKEN || ""),
    phoneNumberId: asString(db?.phoneNumberId || process.env.META_WA_PHONE_NUMBER_ID || ""),
    templateName: asString(db?.templateName || process.env.META_WA_TEMPLATE_NAME || ""),
    reminderTemplateName: asString(db?.reminderTemplateName || process.env.META_WA_REMINDER_TEMPLATE_NAME || ""),
    templateLang: asString(db?.templateLang || process.env.META_WA_TEMPLATE_LANG || "es_MX"),
    allowConsole:
      typeof db?.allowConsole === "boolean"
        ? db.allowConsole
        : asBoolean(process.env.WHATSAPP_OTP_ALLOW_CONSOLE, false)
  };
};

export const saveWhatsappMetaConfig = async (
  incoming: Partial<WhatsappMetaConfig>
): Promise<WhatsappMetaConfig> => {
  await ensureSettingsTable();

  const current = (await getStoredWhatsappMetaConfig()) || {
    accessToken: asString(process.env.META_WA_ACCESS_TOKEN || ""),
    phoneNumberId: asString(process.env.META_WA_PHONE_NUMBER_ID || ""),
    templateName: asString(process.env.META_WA_TEMPLATE_NAME || ""),
    reminderTemplateName: asString(process.env.META_WA_REMINDER_TEMPLATE_NAME || ""),
    templateLang: asString(process.env.META_WA_TEMPLATE_LANG || "es_MX"),
    allowConsole: asBoolean(process.env.WHATSAPP_OTP_ALLOW_CONSOLE, false)
  };

  const next: WhatsappMetaConfig = {
    accessToken: asString(incoming.accessToken) || current.accessToken,
    phoneNumberId: asString(incoming.phoneNumberId) || current.phoneNumberId,
    templateName: asString(incoming.templateName) || current.templateName,
    reminderTemplateName: asString(incoming.reminderTemplateName) || current.reminderTemplateName || "",
    templateLang: asString(incoming.templateLang) || current.templateLang || "es_MX",
    allowConsole:
      typeof incoming.allowConsole === "boolean" ? incoming.allowConsole : current.allowConsole
  };

  await prisma.$executeRawUnsafe(
    `INSERT INTO "SystemSetting" ("key","value","updatedAt")
     VALUES ($1, $2::jsonb, NOW())
     ON CONFLICT ("key")
     DO UPDATE SET "value" = EXCLUDED."value", "updatedAt" = NOW()`,
    SETTING_KEY,
    JSON.stringify(next)
  );

  return next;
};

const postJson = (
  url: string,
  token: string,
  payload: Record<string, any>
): Promise<{ status: number; body: string }> =>
  new Promise((resolve, reject) => {
    const u = new URL(url);
    const body = JSON.stringify(payload);

    const req = https.request(
      {
        protocol: u.protocol,
        hostname: u.hostname,
        port: u.port ? Number(u.port) : 443,
        path: `${u.pathname}${u.search}`,
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body).toString()
        }
      },
      (res) => {
        let out = "";
        res.on("data", (chunk) => {
          out += chunk.toString("utf8");
        });
        res.on("end", () => resolve({ status: res.statusCode ?? 0, body: out }));
      }
    );

    req.on("error", reject);
    req.write(body);
    req.end();
  });

export const sendWhatsappOtpCode = async (
  phone: string,
  code: string,
  cfgInput?: WhatsappMetaConfig
): Promise<void> => {
  const cfg = cfgInput || (await getEffectiveWhatsappMetaConfig());
  const normalized = normalizePhone(phone);
  const toDigits = normalized.replace(/\D/g, "");

  if (!toDigits) throw new Error("Telefono invalido para WhatsApp");

  if (!cfg.accessToken || !cfg.phoneNumberId || !cfg.templateName) {
    if (cfg.allowConsole) {
      console.log(`[WHATSAPP_OTP_DEV] ${normalized} -> ${code}`);
      return;
    }
    throw new Error("WhatsApp OTP (Meta) no esta configurado");
  }

  const payload = {
    messaging_product: "whatsapp",
    to: toDigits,
    type: "template",
    template: {
      name: cfg.templateName,
      language: { code: cfg.templateLang || "es_MX" },
      components: [
        {
          type: "body",
          parameters: [{ type: "text", text: code }]
        }
      ]
    }
  };

  const resp = await postJson(
    `https://graph.facebook.com/v25.0/${cfg.phoneNumberId}/messages`,
    cfg.accessToken,
    payload
  );

  if (resp.status < 200 || resp.status >= 300) {
    let detail = resp.body;
    try {
      const parsed = JSON.parse(resp.body);
      detail = parsed?.error?.message || resp.body;
    } catch {
      // keep raw
    }
    throw new Error(`Meta WhatsApp respondio ${resp.status}: ${detail}`);
  }
};

/**
 * Send appointment reminder via WhatsApp template.
 * Template must accept 3 parameters: name, date, time.
 * Silently skips if reminderTemplateName is not configured.
 */
export const sendWhatsappAppointmentReminder = async (
  phone: string,
  params: { name: string; date: string; time: string; treatment?: string }
): Promise<void> => {
  const cfg = await getEffectiveWhatsappMetaConfig();
  if (!cfg.reminderTemplateName || !cfg.accessToken || !cfg.phoneNumberId) return;

  const normalized = normalizePhone(phone);
  const toDigits = normalized.replace(/\D/g, "");
  if (!toDigits) return;

  if (cfg.allowConsole && (!cfg.accessToken || !cfg.phoneNumberId)) {
    console.log(`[WHATSAPP_REMINDER_DEV] ${normalized} -> ${params.date} ${params.time}`);
    return;
  }

  const components: any[] = [
    {
      type: "body",
      parameters: [
        { type: "text", text: params.name },
        { type: "text", text: params.date },
        { type: "text", text: params.time },
        ...(params.treatment ? [{ type: "text", text: params.treatment }] : []),
      ],
    },
  ];

  const payload = {
    messaging_product: "whatsapp",
    to: toDigits,
    type: "template",
    template: {
      name: cfg.reminderTemplateName,
      language: { code: cfg.templateLang || "es_MX" },
      components,
    },
  };

  const resp = await postJson(
    `https://graph.facebook.com/v25.0/${cfg.phoneNumberId}/messages`,
    cfg.accessToken,
    payload
  );

  if (resp.status < 200 || resp.status >= 300) {
    throw new Error(`Meta WhatsApp reminder ${resp.status}: ${resp.body}`);
  }
};
