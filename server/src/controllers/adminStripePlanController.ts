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
    .map((x: unknown) => {
      const item = x as Record<string, unknown>;
      const rawInterval = asString(item?.interval).toLowerCase() || "month";
      const interval: StripePlanMapping["interval"] =
        rawInterval === "day" || rawInterval === "week" || rawInterval === "year"
          ? rawInterval
          : "month";
      return {
        planCode: asString(item?.planCode).toLowerCase(),
        name: asString(item?.name),
        amount: Number(item?.amount || 0),
        interval,
        stripePriceId: asString(item?.stripePriceId),
        active: !!item?.active,
      };
    })
    .filter((x) => !!x.planCode && !!x.name);
};

export const getAdminStripePlans = async (req: AuthRequest, res: Response) => {
  try {
    if (!isAdmin(req)) return res.status(403).json({ message: "No autorizado" });
    const plans = await readStripePlanCatalog();
    return res.json({ plans });
  } catch (error: unknown) {
    logger.error({ err: error }, "getAdminStripePlans error");
    return res.status(500).json({ message: "No se pudieron obtener planes Stripe" });
  }
};

export const updateAdminStripePlans = async (req: AuthRequest, res: Response) => {
  try {
    if (!isAdmin(req)) return res.status(403).json({ message: "No autorizado" });

    const incoming = normalizeIncoming((req.body as Record<string, unknown>)?.plans);
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
  } catch (error: unknown) {
    logger.error({ err: error }, "updateAdminStripePlans error");
    return res.status(500).json({ message: "No se pudieron guardar planes Stripe", detail: error instanceof Error ? error.message : "unknown" });
  }
};
