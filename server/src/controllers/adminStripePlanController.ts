import { Response } from "express";
import { AuthRequest } from "../middlewares/auth";
import { readStripePlanCatalog, saveStripePlanCatalog, StripePlanMapping } from "../services/stripePlanCatalogService";
import { logger } from "../utils/logger";

const isAdmin = (req: AuthRequest): boolean => {
  const role = req.user?.role ?? "";
  return role === "admin" || role === "system";
};

const asString = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

const normalizeIncoming = (arr: unknown): StripePlanMapping[] => {
  if (!Array.isArray(arr)) return [];
  return arr
    .map((x: any) => ({
      planCode: asString(x?.planCode).toLowerCase(),
      name: asString(x?.name),
      amount: Number(x?.amount || 0),
      interval: (asString(x?.interval).toLowerCase() || "month") as any,
      stripePriceId: asString(x?.stripePriceId),
      active: !!x?.active,
    }))
    .filter((x) => !!x.planCode && !!x.name);
};

export const getAdminStripePlans = async (req: AuthRequest, res: Response) => {
  try {
    if (!isAdmin(req)) return res.status(403).json({ message: "No autorizado" });
    const plans = await readStripePlanCatalog();
    return res.json({ plans });
  } catch (error: any) {
    logger.error({ err: error }, "getAdminStripePlans error");
    return res.status(500).json({ message: "No se pudieron obtener planes Stripe" });
  }
};

export const updateAdminStripePlans = async (req: AuthRequest, res: Response) => {
  try {
    if (!isAdmin(req)) return res.status(403).json({ message: "No autorizado" });

    const incoming = normalizeIncoming((req.body as any)?.plans);
    if (incoming.length === 0) return res.status(400).json({ message: "Debes enviar al menos un plan válido" });

    const codes = incoming.map((p) => p.planCode);
    if (new Set(codes).size !== codes.length) {
      return res.status(400).json({ message: "planCode duplicado" });
    }

    const saved = await saveStripePlanCatalog(incoming);

    return res.json({
      message: "Planes Stripe guardados",
      plans: saved,
    });
  } catch (error: any) {
    logger.error({ err: error }, "updateAdminStripePlans error");
    return res.status(500).json({ message: "No se pudieron guardar planes Stripe", detail: error?.message ?? "unknown" });
  }
};
