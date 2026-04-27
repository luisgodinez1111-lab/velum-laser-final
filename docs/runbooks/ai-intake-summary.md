# Runbook — Resumen IA de paciente con Claude

> **Estado actual (Movimiento #8.B-D):**
> - Endpoint `POST /api/v1/ai/intake/:userId/summary` (admin/staff/system)
> - Backend usa Anthropic SDK con Claude Sonnet 4.6 + prompt caching
> - Auditoría completa por llamada en `AuditLog.action='ai.intake.summary'`
> - Tabla `MedicalIntakeEmbedding` y pgvector listos para Fase #8.E (RAG)
>
> **Activación:** setear `ANTHROPIC_API_KEY` en `server/.env` y rebuild API.
> Sin la key: el endpoint responde 503 — degradación silenciosa.

---

## Cómo se invoca

```http
POST /api/v1/ai/intake/<patient_user_id>/summary
Cookie: velum_token=<jwt>
```

Roles permitidos: `admin`, `staff`, `system`. Paciente NO puede pedir su
propio resumen — es herramienta interna.

Respuesta:
```json
{
  "summary": "**Resumen del paciente**\n...",
  "meta": {
    "model": "claude-sonnet-4-6-20260301",
    "tokens": {
      "input": 1240,
      "output": 480,
      "cache_read": 850,
      "cache_creation": 0
    }
  }
}
```

`cache_read > 0` confirma que el system prompt clínico se reutilizó del
caché de Anthropic (≈ 90% descuento sobre esos tokens).

## Auditoría

Cada llamada inserta una fila en `AuditLog`:

```sql
SELECT
  "actorUserId" AS solicito,
  "targetUserId" AS paciente,
  "createdAt",
  metadata->>'model' AS modelo,
  metadata->>'input_tokens' AS input,
  metadata->>'output_tokens' AS output
FROM "AuditLog"
WHERE action = 'ai.intake.summary'
ORDER BY "createdAt" DESC
LIMIT 50;
```

Esto es requisito SOC 2 CC7.2 — sabemos quién leyó qué expediente vía IA,
cuándo, y cuántos tokens facturamos.

## Reglas de negocio en el system prompt

- Idioma: español MX, registro profesional
- Estructura fija: Resumen → Antecedentes → Banderas rojas → Sesiones → Próxima visita
- NUNCA prescripción
- NUNCA inventa datos ("no documentado" si falta)
- Disclaimer obligatorio al final: "_⚠ Resumen generado por IA — requiere
  revisión médica antes de la sesión._"

Ver `server/src/services/aiProvider.ts` `CLINICAL_SYSTEM_PROMPT` para el
texto exacto.

## Métricas a vigilar

| Métrica | Cómo se obtiene | Por qué |
|---------|-----------------|---------|
| Tasa cache_read | `cache_read_tokens / (cache_read_tokens + cache_creation_tokens + input_tokens)` | Si baja, el system prompt cambió y dejó de reusarse — investigar |
| Costo por llamada | `input × $price_in + output × $price_out + cache_creation × $price_cache_write + cache_read × $price_cache_read` | Modelado de costo unitario |
| Latencia p95 | Span OTel `ai.intake.summary` | Sub-3s ideal para UX en consultorio |
| Tasa de error | Sentry `ai.intake.summary` errors | Anthropic rate limits, problemas con datos del intake |

## Compliance — pendientes

- [ ] **BAA con Anthropic** — para producción real con PHI: usar Anthropic
      Enterprise (BAA disponible) o AWS Bedrock con BAA.
- [ ] **Disclaimer explícito en UI** del paciente: "Tu expediente puede ser
      analizado por una IA para asistir al staff. La IA no sustituye al
      médico."
- [ ] **Opt-out por paciente**: campo `Profile.aiAssistOptOut: boolean`
      respetado por el service.
- [ ] **Retención de outputs**: ¿cuánto tiempo se guarda el `summary` que
      genera el modelo? Hoy: solo el AuditLog (metadata, no el texto).
      Si decidimos guardar el summary, evaluar si se cifra (PHI).

## Roadmap

- **#8.E (próximo):** indexar `MedicalIntake` en `MedicalIntakeEmbedding`
  vía outbox handler `intake.changed`. Endpoint `/ai/intake/search` para
  encontrar pacientes con condiciones similares (ej. "pacientes con melasma
  + fototipo IV con buen resultado en últimas 5 sesiones").
- **#8.F:** transcripción de notas voz → estructura JSON via Whisper +
  Sonnet. Reduce el tiempo de captura de notas post-sesión.
- **#8.G:** detección de no-show — modelo gradient boosting sobre features
  históricas (no LLM). Alimenta política de depósitos.
