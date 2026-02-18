import { Prisma } from "@prisma/client";
import crypto from "crypto";
import { Response } from "express";
import { prisma } from "../db/prisma";
import { AuthRequest } from "../middlewares/auth";
import { createAuditLog } from "../services/auditService";
import { sendMetaEvent } from "../services/metaService";
import { leadCreateSchema, marketingEventSchema } from "../validators/leads";

export const createLead = async (req: AuthRequest, res: Response) => {
  const payload = leadCreateSchema.parse(req.body);
  const eventId = crypto.randomUUID();

  const lead = await prisma.lead.create({
    data: {
      name: payload.name,
      email: payload.email,
      phone: payload.phone,
      consent: payload.consent
    }
  });

  const attribution = await prisma.marketingAttribution.create({
    data: {
      leadId: lead.id,
      userId: req.user?.id,
      eventName: "Lead",
      eventId,
      utmSource: payload.utm_source,
      utmMedium: payload.utm_medium,
      utmCampaign: payload.utm_campaign,
      utmTerm: payload.utm_term,
      utmContent: payload.utm_content,
      fbp: payload.fbp,
      fbc: payload.fbc,
      fbclid: payload.fbclid,
      consent: payload.consent,
      requestSummary: {
        utm_source: payload.utm_source,
        utm_medium: payload.utm_medium,
        utm_campaign: payload.utm_campaign,
        fbp: payload.fbp,
        fbc: payload.fbc,
        fbclid: payload.fbclid
      }
    }
  });

  const metaResult = await sendMetaEvent({
    eventName: "Lead",
    eventId,
    clientIp: req.ip,
    clientUserAgent: req.get("user-agent") ?? undefined,
    fbp: payload.fbp,
    fbc: payload.fbc,
    userData: {
      em: payload.email,
      ph: payload.phone
    },
    customData: {
      lead_id: lead.id
    }
  });

  const updatedAttribution = await prisma.marketingAttribution.update({
    where: { id: attribution.id },
    data: {
      metaStatus: metaResult.status,
      metaError: metaResult.error,
      responseSummary: metaResult.responseSummary as Prisma.InputJsonValue | undefined,
      sentAt: metaResult.status === "sent" ? new Date() : null
    }
  });

  await createAuditLog({
    userId: req.user?.id,
    action: "lead.create",
    resourceType: "lead",
    resourceId: lead.id,
    ip: req.ip,
    metadata: {
      eventId,
      source: payload.utm_source,
      medium: payload.utm_medium,
      campaign: payload.utm_campaign
    }
  });

  return res.status(201).json({ lead, attribution: updatedAttribution, eventId });
};

export const trackMarketingEvent = async (req: AuthRequest, res: Response) => {
  const payload = marketingEventSchema.parse(req.body);

  const existing = await prisma.marketingAttribution.findUnique({
    where: { eventId: payload.eventId }
  });

  if (existing) {
    return res.status(200).json({ accepted: true, deduped: true, eventId: payload.eventId, status: existing.metaStatus });
  }

  const attribution = await prisma.marketingAttribution.create({
    data: {
      leadId: payload.leadId,
      userId: payload.userId ?? req.user?.id,
      eventName: payload.eventName,
      eventId: payload.eventId,
      fbp: payload.fbp,
      fbc: payload.fbc,
      requestSummary: {
        eventTime: payload.eventTime,
        customData: payload.customData as Prisma.InputJsonValue | undefined
      } as Prisma.InputJsonValue
    }
  });

  const metaResult = await sendMetaEvent({
    eventName: payload.eventName,
    eventId: payload.eventId,
    eventTime: payload.eventTime ? new Date(payload.eventTime) : undefined,
    clientIp: req.ip,
    clientUserAgent: req.get("user-agent") ?? undefined,
    fbp: payload.fbp,
    fbc: payload.fbc,
    userData: payload.userData,
    customData: payload.customData
  });

  await prisma.marketingAttribution.update({
    where: { id: attribution.id },
    data: {
      metaStatus: metaResult.status,
      metaError: metaResult.error,
      responseSummary: metaResult.responseSummary as Prisma.InputJsonValue | undefined,
      sentAt: metaResult.status === "sent" ? new Date() : null
    }
  });

  await createAuditLog({
    userId: req.user?.id,
    action: "marketing.event.track",
    resourceType: "marketing_event",
    resourceId: attribution.id,
    ip: req.ip,
    metadata: {
      eventName: payload.eventName,
      eventId: payload.eventId,
      leadId: payload.leadId
    }
  });

  return res.status(202).json({ accepted: true, deduped: false, eventId: payload.eventId, status: metaResult.status });
};

export const listMarketingEvents = async (req: AuthRequest, res: Response) => {
  const limit = Math.min(Number(req.query.limit ?? 200), 500);
  const eventName = typeof req.query.eventName === "string" ? req.query.eventName : undefined;
  const status = typeof req.query.status === "string" ? req.query.status : undefined;

  const events = await prisma.marketingAttribution.findMany({
    where: {
      ...(eventName ? { eventName } : {}),
      ...(status ? { metaStatus: status } : {})
    },
    include: {
      lead: true,
      user: {
        select: {
          id: true,
          email: true,
          role: true
        }
      }
    },
    orderBy: { createdAt: "desc" },
    take: limit
  });

  return res.json(events);
};
