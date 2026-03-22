import { Response } from "express";
import { AuthRequest } from "../middlewares/auth";
import {
  getEffectiveWhatsappMetaConfig,
  getStoredWhatsappMetaConfig,
  normalizePhone,
  saveWhatsappMetaConfig,
  sendWhatsappOtpCode
} from "../services/whatsappMetaService";

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

const maskToken = (token: string): string => {
  if (!token) return "";
  if (token.length <= 8) return "********";
  return `${token.slice(0, 4)}...${token.slice(-4)}`;
};

export const getAdminWhatsappConfig = async (_req: AuthRequest, res: Response) => {
  const stored = await getStoredWhatsappMetaConfig();
  const effective = await getEffectiveWhatsappMetaConfig();

  return res.json({
    source: stored ? "database" : "env",
    configured: Boolean(effective.accessToken && effective.phoneNumberId && effective.templateName),
    phoneNumberId: effective.phoneNumberId,
    templateName: effective.templateName,
    reminderTemplateName: effective.reminderTemplateName,
    paymentReminderTemplateName: effective.paymentReminderTemplateName,
    templateLang: effective.templateLang || "es_MX",
    allowConsole: effective.allowConsole,
    accessTokenMasked: maskToken(effective.accessToken)
  });
};

export const putAdminWhatsappConfig = async (req: AuthRequest, res: Response) => {
  const body: any = req.body ?? {};

  const saved = await saveWhatsappMetaConfig({
    accessToken: asString(body.accessToken),
    phoneNumberId: asString(body.phoneNumberId),
    templateName: asString(body.templateName),
    reminderTemplateName: asString(body.reminderTemplateName),
    paymentReminderTemplateName: asString(body.paymentReminderTemplateName),
    templateLang: asString(body.templateLang || "es_MX"),
    allowConsole: asBoolean(body.allowConsole, false)
  });

  if (!saved.accessToken || !saved.phoneNumberId || !saved.templateName) {
    return res.status(400).json({
      message: "Faltan datos obligatorios (accessToken, phoneNumberId, templateName)"
    });
  }

  return res.json({
    message: "Configuracion WhatsApp guardada",
    configured: true,
    phoneNumberId: saved.phoneNumberId,
    templateName: saved.templateName,
    reminderTemplateName: saved.reminderTemplateName,
    templateLang: saved.templateLang,
    allowConsole: saved.allowConsole,
    accessTokenMasked: maskToken(saved.accessToken)
  });
};

export const postAdminWhatsappTest = async (req: AuthRequest, res: Response) => {
  const body: any = req.body ?? {};
  const to = normalizePhone(asString(body.to));
  const previewCode = asString(body.previewCode || "123456");

  if (!to) {
    return res.status(400).json({ message: "Telefono destino es obligatorio" });
  }

  try {
    await sendWhatsappOtpCode(to, previewCode);
    return res.json({
      message: "Mensaje de prueba enviado",
      to
    });
  } catch (error: any) {
    return res.status(502).json({
      message: "No se pudo enviar mensaje de prueba",
      detail: asString(error?.message || "Error desconocido")
    });
  }
};
