import { prisma } from "../db/prisma";
import { LeadSource, LeadStatus } from "@prisma/client";

export const createLead = (data: {
  firstName: string;
  lastName?: string;
  email?: string;
  phone: string;
  source?: LeadSource;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmContent?: string;
  utmTerm?: string;
  referrerUrl?: string;
}) => prisma.lead.create({ data });

export const listLeads = (filters?: {
  status?: LeadStatus;
  source?: LeadSource;
  search?: string;
}) => {
  const where: Record<string, unknown> = {};

  if (filters?.status) where.status = filters.status;
  if (filters?.source) where.source = filters.source;
  if (filters?.search) {
    where.OR = [
      { firstName: { contains: filters.search, mode: "insensitive" } },
      { lastName: { contains: filters.search, mode: "insensitive" } },
      { email: { contains: filters.search, mode: "insensitive" } },
      { phone: { contains: filters.search, mode: "insensitive" } }
    ];
  }

  return prisma.lead.findMany({
    where,
    include: { assignedTo: { include: { profile: true } } },
    orderBy: { createdAt: "desc" }
  });
};

export const getLeadById = (id: string) =>
  prisma.lead.findUnique({
    where: { id },
    include: { assignedTo: { include: { profile: true } } }
  });

export const updateLead = (
  id: string,
  data: {
    status?: LeadStatus;
    notes?: string;
    assignedToUserId?: string;
  }
) => prisma.lead.update({ where: { id }, data });

export const convertLead = async (leadId: string, userId: string) => {
  return prisma.lead.update({
    where: { id: leadId },
    data: {
      status: "converted",
      convertedUserId: userId,
      convertedAt: new Date()
    }
  });
};
