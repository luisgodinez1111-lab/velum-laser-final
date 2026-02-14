import type { Request, Response } from "express";
import { treatmentPlanService } from "../services/treatmentPlanService.js";
import { createTreatmentPlanSchema, updateTreatmentPlanSchema } from "../validators/treatmentPlan.js";
import { createAuditLog } from "../services/auditService.js";
import { notify } from "../services/notificationService.js";

export const createPlan = async (req: Request, res: Response) => {
  const parsed = createTreatmentPlanSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ errors: parsed.error.flatten().fieldErrors });

  const plan = await treatmentPlanService.create(parsed.data);
  await createAuditLog({ userId: req.user!.id, action: "treatment_plan.create", metadata: { planId: plan.id, zones: parsed.data.zones } });

  await notify({
    userId: parsed.data.userId,
    type: "in_app",
    title: "Plan de Tratamiento Creado",
    body: `Tu plan de ${plan.totalSessions} sesiones ha sido creado para las zonas: ${plan.zones.join(", ")}.`,
    metadata: { planId: plan.id },
  });

  res.status(201).json(plan);
};

export const updatePlan = async (req: Request, res: Response) => {
  const parsed = updateTreatmentPlanSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ errors: parsed.error.flatten().fieldErrors });

  const plan = await treatmentPlanService.update(req.params.id, parsed.data);
  await createAuditLog({ userId: req.user!.id, action: "treatment_plan.update", metadata: { planId: plan.id, changes: parsed.data } });
  res.json(plan);
};

export const incrementPlanSession = async (req: Request, res: Response) => {
  const plan = await treatmentPlanService.incrementSession(req.params.id);
  await createAuditLog({ userId: req.user!.id, action: "treatment_plan.increment_session", metadata: {
    planId: plan.id,
    completed: plan.completedSessions,
    total: plan.totalSessions,
  } });
  res.json(plan);
};

export const getMyPlans = async (req: Request, res: Response) => {
  const plans = await treatmentPlanService.getByUser(req.user!.id);
  res.json(plans);
};

export const getPlanDetail = async (req: Request, res: Response) => {
  const plan = await treatmentPlanService.getById(req.params.id);
  if (!plan) return res.status(404).json({ message: "Plan no encontrado" });
  res.json(plan);
};

export const listPlans = async (req: Request, res: Response) => {
  const status = req.query.status as string | undefined;
  const plans = await treatmentPlanService.listAll(status ? { status: status as any } : undefined);
  res.json(plans);
};
