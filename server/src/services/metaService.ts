import crypto from "crypto";
import { env } from "../utils/env";
import { logger } from "../utils/logger";

type MetaEventInput = {
  eventName: string;
  eventId: string;
  eventTime?: Date;
  clientIp?: string;
  clientUserAgent?: string;
  fbp?: string;
  fbc?: string;
  userData?: Record<string, unknown>;
  customData?: Record<string, unknown>;
};

type MetaSendResult = {
  status: "sent" | "error" | "skipped";
  responseSummary?: Record<string, unknown>;
  error?: string;
};

const sha256 = (value: string) => crypto.createHash("sha256").update(value.trim().toLowerCase()).digest("hex");

const normalizeUserData = (userData: Record<string, unknown> = {}) => {
  const data: Record<string, unknown> = { ...userData };

  if (typeof data.em === "string") {
    data.em = sha256(data.em);
  }

  if (typeof data.ph === "string") {
    data.ph = sha256(data.ph);
  }

  return data;
};

export const sendMetaEvent = async (input: MetaEventInput): Promise<MetaSendResult> => {
  if (!env.metaEnabled || !env.metaPixelId || !env.metaAccessToken) {
    return {
      status: "skipped",
      responseSummary: {
        reason: "meta_disabled_or_missing_credentials"
      }
    };
  }

  const payload = {
    data: [
      {
        event_name: input.eventName,
        event_time: Math.floor((input.eventTime ?? new Date()).getTime() / 1000),
        event_id: input.eventId,
        action_source: "website",
        event_source_url: env.appUrl,
        user_data: {
          ...normalizeUserData(input.userData),
          client_ip_address: input.clientIp,
          client_user_agent: input.clientUserAgent,
          fbp: input.fbp,
          fbc: input.fbc
        },
        custom_data: input.customData
      }
    ]
  };

  try {
    const response = await fetch(
      `https://graph.facebook.com/${env.metaApiVersion}/${env.metaPixelId}/events?access_token=${encodeURIComponent(env.metaAccessToken)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      }
    );

    const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;

    if (!response.ok) {
      return {
        status: "error",
        responseSummary: data,
        error: `meta_http_${response.status}`
      };
    }

    return {
      status: "sent",
      responseSummary: data
    };
  } catch (error) {
    logger.error({ err: error, eventId: input.eventId }, "Meta CAPI request failed");
    return {
      status: "error",
      error: "meta_request_failed"
    };
  }
};
