import { prisma } from "../db/prisma";
import { randomUUID } from "crypto";
import { env } from "../utils/env";

export const trackEvent = async (data: {
  eventName: string;
  userId?: string;
  leadId?: string;
  fbp?: string;
  fbc?: string;
  clientIp?: string;
  userAgent?: string;
  sourceUrl?: string;
  customData?: Record<string, unknown>;
}) => {
  const eventId = randomUUID();

  return prisma.marketingEvent.create({
    data: {
      eventName: data.eventName,
      eventId,
      userId: data.userId,
      leadId: data.leadId,
      fbp: data.fbp,
      fbc: data.fbc,
      clientIp: data.clientIp,
      userAgent: data.userAgent,
      sourceUrl: data.sourceUrl,
      customData: data.customData
    }
  });
};

export const getPendingEvents = async (limit = 50) => {
  return prisma.marketingEvent.findMany({
    where: { sentToMeta: false },
    orderBy: { createdAt: "asc" },
    take: limit
  });
};

export const markEventSent = async (id: string) => {
  return prisma.marketingEvent.update({
    where: { id },
    data: { sentToMeta: true, sentAt: new Date() }
  });
};

// Meta Conversions API sender
// In production, this would be called by a cron job or queue worker
export const sendToMetaCAPI = async (event: {
  id: string;
  eventName: string;
  eventId: string;
  fbp?: string | null;
  fbc?: string | null;
  clientIp?: string | null;
  userAgent?: string | null;
  sourceUrl?: string | null;
  customData?: unknown;
}) => {
  const pixelId = process.env.META_PIXEL_ID;
  const accessToken = process.env.META_ACCESS_TOKEN;

  if (!pixelId || !accessToken) {
    // Meta CAPI not configured — skip silently
    return { sent: false, reason: "META_PIXEL_ID or META_ACCESS_TOKEN not configured" };
  }

  const payload = {
    data: [
      {
        event_name: event.eventName,
        event_time: Math.floor(Date.now() / 1000),
        event_id: event.eventId,
        action_source: "website",
        event_source_url: event.sourceUrl,
        user_data: {
          fbp: event.fbp,
          fbc: event.fbc,
          client_ip_address: event.clientIp,
          client_user_agent: event.userAgent
        },
        custom_data: event.customData
      }
    ]
  };

  const url = `https://graph.facebook.com/v18.0/${pixelId}/events?access_token=${encodeURIComponent(accessToken)}`;

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  if (response.ok) {
    await markEventSent(event.id);
    return { sent: true };
  }

  const errorBody = await response.text();
  return { sent: false, reason: errorBody };
};

// Process pending events batch (call from cron or after key events)
export const processPendingEvents = async () => {
  const events = await getPendingEvents();
  const results = [];
  for (const event of events) {
    const result = await sendToMetaCAPI(event);
    results.push({ eventId: event.eventId, ...result });
  }
  return results;
};
