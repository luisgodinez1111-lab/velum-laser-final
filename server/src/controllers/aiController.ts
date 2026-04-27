/**
 * AI controllers — Movimiento #8.D
 *
 * Endpoints para staff/admin: resumen clínico de paciente vía Claude Sonnet.
 *
 * Seguridad:
 *   - requireRole(["admin","staff","system"]) — pacientes NO pueden invocar.
 *   - El resumen NO se devuelve al paciente; es una herramienta interna.
 *   - El intake real cruza un check cross-tenant defensivo además de RLS.
 */
import type { Response } from "express";
import { z } from "zod";
import type { AuthRequest } from "../middlewares/auth";
import { isAiEnabled } from "../services/aiProvider";
import { summarizePatientForStaff } from "../services/intakeAiService";
import { badRequest } from "../utils/AppError";

const summaryParams = z.object({ userId: z.string().min(1) });

export const getIntakeSummary = async (req: AuthRequest, res: Response) => {
  if (!isAiEnabled()) {
    return res.status(503).json({
      message: "Asistente IA no configurado. Solicitar al administrador setear ANTHROPIC_API_KEY.",
    });
  }
  if (!req.user) return res.status(401).json({ message: "No autorizado" });

  const parsed = summaryParams.safeParse(req.params);
  if (!parsed.success) throw badRequest("userId requerido");

  const result = await summarizePatientForStaff(parsed.data.userId, req.user.id);

  return res.json({
    summary: result.summary,
    meta: {
      model: result.model,
      tokens: {
        input: result.inputTokens,
        output: result.outputTokens,
        cache_read: result.cacheReadTokens,
        cache_creation: result.cacheCreationTokens,
      },
    },
  });
};
