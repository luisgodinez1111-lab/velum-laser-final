# Runbook — Tipos cliente desde OpenAPI

> **Objetivo:** un cambio en el contrato HTTP no puede romper el frontend en
> runtime — el typecheck lo atrapa primero. Cero drift entre lo que el server
> dice y lo que el cliente cree.

---

## Single source of truth

```
server/src/openapi.ts                    ← editar AQUÍ el contrato
        │
        │ npm run openapi:export (tsx export-openapi.ts)
        ▼
server/openapi.json                      ← committeado al repo
        │
        │ npx openapi-typescript
        ▼
services/__generated__/api-types.ts      ← committeado al repo
        │
        ▼
services/typedApi.ts                     ← wrapper ergonómico encima de apiClient
```

## Comandos

```bash
# Regenerar tipos después de editar openapi.ts
npm run codegen

# CI gate: falla si los tipos están desactualizados respecto a openapi.ts
npm run codegen:check
```

## Adopción

**No se necesita refactor masivo.** Código existente sigue funcionando.

- Endpoints nuevos: usar `typedApi.get/post/put/del` — autocompletado y tipos
  garantizados por el contrato.
- Endpoints existentes (`dataService.ts`, `authService.ts`, etc): migrar
  oportunísticamente cuando se toquen por otra razón.

```ts
// Antes
const response = await apiFetch('/api/v1/leads', {
  method: 'POST',
  body: JSON.stringify({ name, email, phone, consent: true }),
});

// Después
import { typedApi, type components } from './services/typedApi';
type LeadCreate = components['schemas']['LeadCreate'];
const lead: LeadCreate = { name, email, phone, consent: true };
const created = await typedApi.post('/leads', lead);
//                              ^? path autocompleta, body type-checked
```

## CI gate

`.github/workflows/ci.yml` corre `npm run codegen:check` en cada PR. Si
`openapi.ts` cambió y no se regeneraron los tipos, el job de frontend falla
con instrucciones para corregir.

## Cuándo regenerar

| Cambio | Acción |
|--------|--------|
| Editar `server/src/openapi.ts` | `npm run codegen` y commitear `openapi.json` + `api-types.ts` |
| Editar Zod validator del backend | Actualizar `openapi.ts` para que coincida, luego codegen |
| Mismatches en runtime entre client/server | Probable drift — `npm run codegen:check` |

## Deuda explícita

- `openapi.ts` se mantiene a mano. Hay tooling para derivarlo desde Zod
  (`zod-to-openapi`), pero introducirlo es trabajo adicional. Hoy: disciplina
  + tests de contrato (en `tests/routes.test.ts`) cierran el gap.
- `apiTypes.ts` (manual) coexiste con `__generated__/api-types.ts`. Plan:
  migrar tipos del manual al generated y borrar el manual cuando todos los
  callers usen `typedApi`.
