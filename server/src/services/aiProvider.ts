/**
 * AI Provider — Movimiento #8.B
 *
 * Wrapper sobre @anthropic-ai/sdk con:
 *   - Lazy init (no inicializa el cliente si la API key no está)
 *   - Prompt caching del system prompt clínico — Anthropic facturará ~70%
 *     menos por el system después del primer hit (mismo texto, distinto user)
 *   - Métricas de tokens entrantes/salientes para billing y observabilidad
 *   - Errores explícitos cuando la feature no está configurada (503 al cliente)
 *
 * Reglas no-negociables (PHI en salud):
 *   - PHI no se envía a modelos sin BAA. Anthropic Enterprise / Bedrock con
 *     BAA es el path correcto. Para esta MVP, asumimos que el cliente tiene
 *     ese acuerdo — documentado en docs/runbooks/ai-compliance.md (TODO).
 *   - Output del modelo NUNCA llega al paciente sin revisión humana. El UI
 *     muestra el resumen como "borrador asistido", el staff valida.
 *   - Cada llamada se loguea con tenant_id, userId del paciente, modelo,
 *     tokens, y timestamp — auditoría completa para SOC 2.
 */
import Anthropic from "@anthropic-ai/sdk";
import { env } from "../utils/env";
import { logger } from "../utils/logger";
import { getTenantContext } from "../utils/tenantContext";

let _client: Anthropic | undefined;

const getClient = (): Anthropic => {
  if (!env.anthropicApiKey) {
    throw new Error(
      "ANTHROPIC_API_KEY no configurada. Setear en .env y rebuildear. " +
      "Obtener en https://console.anthropic.com/settings/keys",
    );
  }
  if (!_client) {
    _client = new Anthropic({ apiKey: env.anthropicApiKey });
  }
  return _client;
};

export const isAiEnabled = (): boolean => env.anthropicApiKey.length > 0;

/**
 * System prompt clínico — diseñado para ser largo y reutilizable a través
 * de muchas llamadas con el mismo contexto. Marcado con cache_control
 * `ephemeral` para que Anthropic lo cachee — la siguiente llamada con el
 * mismo system paga ~10% del costo de input por esos tokens.
 *
 * Reglas codificadas en el prompt:
 *   - Español de México, tono profesional médico
 *   - Estructura SOAP-like cuando aplique
 *   - Banderas rojas en sección destacada
 *   - Disclaimer automático: "borrador asistido por IA, requiere revisión"
 *   - JAMÁS sugerir tratamientos específicos (ese es el médico, no el LLM)
 */
const CLINICAL_SYSTEM_PROMPT = `Eres un asistente médico para personal de clínica estética en México. Tu trabajo es leer expedientes de pacientes y producir resúmenes claros que ayuden al staff a prepararse para una sesión.

REGLAS ESTRICTAS:
1. Idioma: español de México, registro profesional médico (no coloquial).
2. Estructura tu respuesta así:
   • **Resumen del paciente** (2-3 líneas)
   • **Antecedentes relevantes** (alergias, cirugías, condiciones crónicas)
   • **Banderas rojas** (cualquier riesgo: medicación que afecta procedimiento, embarazo, condiciones que contraindican láser, etc.)
   • **Notas de sesiones previas** (resumen condensado)
   • **Recomendaciones para la próxima visita** (preguntas a hacer, no tratamientos a aplicar)
3. NUNCA prescribas tratamientos, dosis, ni indiques procedimientos específicos. Eso es decisión del médico/staff certificado.
4. NUNCA inventes información. Si un dato no está en el expediente, di "no documentado".
5. Si detectas una contraindicación absoluta (embarazo + láser, anticoagulantes + procedimiento, etc.), márcalo claramente al inicio en MAYÚSCULAS.
6. Termina SIEMPRE con: "_⚠ Resumen generado por IA — requiere revisión médica antes de la sesión._"

NO HAGAS:
- Diagnósticos
- Recomendaciones farmacológicas
- Predicciones de resultados ("mejorará en X sesiones")
- Comentarios sobre apariencia física más allá de fototipo y tratamientos previos`;

export interface IntakeSummaryInput {
  /** Identificador del paciente — solo para logging, no se envía al modelo */
  userId: string;
  /** Datos personales serializados (nombre, edad, fototipo, etc.) */
  personalData: Record<string, unknown> | null;
  /** Historia clínica (alergias, antecedentes, medicación, etc.) */
  historyData: Record<string, unknown> | null;
  /** Sesiones previas — texto condensado por el caller */
  previousSessions: Array<{
    date: string;
    treatment?: string;
    notes?: string;
    adverseEvents?: string;
  }>;
}

export interface IntakeSummaryResult {
  /** Texto markdown listo para mostrar al staff */
  summary: string;
  /** Modelo usado (para auditoría) */
  model: string;
  /** Tokens consumidos (para billing/observabilidad) */
  inputTokens: number;
  outputTokens: number;
  /** Cache hit ratio — útil para validar que prompt caching está funcionando */
  cacheReadTokens: number;
  cacheCreationTokens: number;
}

/**
 * Genera un resumen clínico del paciente. El system prompt se cachea entre
 * llamadas (mismo contenido = ~10% del costo después del primer hit).
 */
export async function summarizeIntake(input: IntakeSummaryInput): Promise<IntakeSummaryResult> {
  const client = getClient();

  // Texto del paciente — input variable, NO cacheable.
  const userContent = [
    "**EXPEDIENTE DEL PACIENTE**",
    "",
    "**Datos personales:**",
    JSON.stringify(input.personalData ?? {}, null, 2),
    "",
    "**Historia clínica:**",
    JSON.stringify(input.historyData ?? {}, null, 2),
    "",
    "**Sesiones previas:**",
    input.previousSessions.length === 0
      ? "Ninguna sesión registrada."
      : input.previousSessions
          .map(
            (s, i) =>
              `${i + 1}. [${s.date}] ${s.treatment ?? "tratamiento sin especificar"}\n   Notas: ${s.notes ?? "—"}\n   Eventos adversos: ${s.adverseEvents ?? "ninguno"}`,
          )
          .join("\n"),
  ].join("\n");

  const ctx = getTenantContext();
  const startedAt = Date.now();

  const response = await client.messages.create({
    model: env.anthropicModel,
    max_tokens: env.anthropicMaxTokens,
    system: [
      {
        type: "text",
        text: CLINICAL_SYSTEM_PROMPT,
        // Anthropic cachea este bloque por 5 min. Cada llamada con system
        // idéntico paga ~10% del costo de los tokens del system.
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [{ role: "user", content: userContent }],
  });

  const textBlocks = response.content.filter((b): b is Anthropic.TextBlock => b.type === "text");
  const summary = textBlocks.map((b) => b.text).join("\n");

  const usage = response.usage;
  const result: IntakeSummaryResult = {
    summary,
    model: response.model,
    inputTokens: usage.input_tokens,
    outputTokens: usage.output_tokens,
    cacheReadTokens: usage.cache_read_input_tokens ?? 0,
    cacheCreationTokens: usage.cache_creation_input_tokens ?? 0,
  };

  logger.info(
    {
      userId: input.userId,
      tenantId: ctx?.tenantId,
      model: result.model,
      input_tokens: result.inputTokens,
      output_tokens: result.outputTokens,
      cache_read: result.cacheReadTokens,
      cache_creation: result.cacheCreationTokens,
      elapsed_ms: Date.now() - startedAt,
    },
    "[ai] intake summary generated",
  );

  return result;
}
