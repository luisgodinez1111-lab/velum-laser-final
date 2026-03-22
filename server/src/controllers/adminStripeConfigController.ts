import { Response } from "express";
import { AuthRequest } from "../middlewares/auth";
import { resolveStripeConfig, saveStripeConfig, presentStripeConfig } from "../services/stripeConfigService";

const isAdmin = (req: AuthRequest): boolean => {
  const role = req.user?.role ?? "";
  return role === "admin" || role === "system";
};

const asString = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

export const getAdminStripeConfig = async (req: AuthRequest, res: Response) => {
  try {
    if (!isAdmin(req)) return res.status(403).json({ message: "No autorizado" });

    const config = await resolveStripeConfig();
    return res.json(presentStripeConfig(config.source, config.config));
  } catch (error: any) {
    console.error("getAdminStripeConfig error:", error);
    return res.status(500).json({ message: "No se pudo obtener configuración Stripe" });
  }
};

export const updateAdminStripeConfig = async (req: AuthRequest, res: Response) => {
  try {
    if (!isAdmin(req)) return res.status(403).json({ message: "No autorizado" });

    const secretKey = asString((req.body as any)?.secretKey);
    const publishableKey = asString((req.body as any)?.publishableKey);
    const webhookSecret = asString((req.body as any)?.webhookSecret);

    if (!secretKey && !publishableKey && !webhookSecret) {
      return res.status(400).json({ message: "Proporciona al menos una clave para actualizar" });
    }

    const saved = await saveStripeConfig({ secretKey, publishableKey, webhookSecret });

    return res.json({
      message: "Configuración Stripe guardada",
      ...presentStripeConfig(saved.source, saved.config),
    });
  } catch (error: any) {
    console.error("updateAdminStripeConfig error:", error);
    return res.status(500).json({ message: "No se pudo guardar configuración Stripe", detail: error?.message ?? "unknown" });
  }
};

export const testAdminStripeConfig = async (req: AuthRequest, res: Response) => {
  try {
    if (!isAdmin(req)) return res.status(403).json({ message: "No autorizado" });

    const { config } = await resolveStripeConfig();
    if (!config.secretKey) return res.status(400).json({ message: "Falta STRIPE_SECRET_KEY" });

    const rsp = await fetch("https://api.stripe.com/v1/account", {
      method: "GET",
      headers: { Authorization: `Bearer ${config.secretKey}` },
    });

    const body = await rsp.json().catch(() => ({}));

    if (!rsp.ok) {
      const msg = body?.error?.message || "Error Stripe";
      return res.status(502).json({ message: "No se pudo validar Stripe", detail: msg });
    }

    return res.json({
      message: "Conexión Stripe válida",
      account: {
        id: body?.id || "",
        email: body?.email || "",
        country: body?.country || "",
      },
    });
  } catch (error: any) {
    console.error("testAdminStripeConfig error:", error);
    return res.status(500).json({ message: "No se pudo validar Stripe", detail: error?.message ?? "unknown" });
  }
};
