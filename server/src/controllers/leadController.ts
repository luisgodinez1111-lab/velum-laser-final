import { Request, Response } from "express";
import { AuthRequest } from "../middlewares/auth";
import { createLeadSchema, updateLeadSchema } from "../validators/lead";
import * as leadService from "../services/leadService";
import { createAuditLog } from "../services/auditService";
import { LeadSource, LeadStatus } from "@prisma/client";

// Public endpoint — no auth required
export const captureLead = async (req: Request, res: Response) => {
  const payload = createLeadSchema.parse(req.body);
  const lead = await leadService.createLead(payload);
  await createAuditLog({
    action: "lead.create",
    metadata: {
      leadId: lead.id,
      source: payload.source,
      utmSource: payload.utmSource,
      ip: req.ip
    }
  });
  return res.status(201).json({ id: lead.id, message: "Gracias por tu interés. Te contactaremos pronto." });
};

export const listLeadsAdmin = async (req: AuthRequest, res: Response) => {
  const filters: { status?: LeadStatus; source?: LeadSource; search?: string } = {};
  if (req.query.status) filters.status = req.query.status as LeadStatus;
  if (req.query.source) filters.source = req.query.source as LeadSource;
  if (req.query.search) filters.search = req.query.search as string;

  const leads = await leadService.listLeads(filters);
  return res.json(leads);
};

export const getLeadAdmin = async (req: AuthRequest, res: Response) => {
  const lead = await leadService.getLeadById(req.params.id);
  if (!lead) {
    return res.status(404).json({ message: "Lead no encontrado" });
  }
  return res.json(lead);
};

export const updateLeadAdmin = async (req: AuthRequest, res: Response) => {
  const payload = updateLeadSchema.parse(req.body);
  const existing = await leadService.getLeadById(req.params.id);
  if (!existing) {
    return res.status(404).json({ message: "Lead no encontrado" });
  }

  const lead = await leadService.updateLead(req.params.id, payload);
  await createAuditLog({
    userId: req.user!.id,
    action: "lead.update",
    metadata: { leadId: lead.id, changes: payload, ip: req.ip }
  });
  return res.json(lead);
};

export const convertLeadAdmin = async (req: AuthRequest, res: Response) => {
  const existing = await leadService.getLeadById(req.params.id);
  if (!existing) {
    return res.status(404).json({ message: "Lead no encontrado" });
  }
  if (existing.status === "converted") {
    return res.status(400).json({ message: "Este lead ya fue convertido" });
  }
  if (!existing.email) {
    return res.status(400).json({ message: "El lead necesita un email para convertirse en usuario" });
  }

  // Check if user with this email already exists
  const { prisma } = await import("../db/prisma");
  const existingUser = await prisma.user.findUnique({ where: { email: existing.email } });
  if (existingUser) {
    // Link lead to existing user
    const lead = await leadService.convertLead(existing.id, existingUser.id);
    await createAuditLog({
      userId: req.user!.id,
      action: "lead.convert",
      metadata: { leadId: lead.id, convertedUserId: existingUser.id, ip: req.ip }
    });
    return res.json({ lead, message: "Lead vinculado a usuario existente" });
  }

  return res.status(400).json({
    message: "El usuario debe registrarse primero. Envía el enlace de registro al lead."
  });
};
