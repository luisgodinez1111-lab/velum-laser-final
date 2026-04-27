# Runbook — Cifrado de campo PHI

> **Estado actual (Fase 1.3):**
> - Helper `phiCrypto.ts` con AES-256-GCM + master key `PHI_MASTER_KEY`
> - Formato versionado: `phi:v1:<iv>:<authTag>:<ciphertext>`
> - Aplicado a: `MedicalIntake.signatureImageData`
> - Compat layer entiende formato legacy `enc1:<...>` (cifrado con
>   `INTEGRATIONS_ENC_KEY`) — migración de datos vía script
> - Master key en env. Roadmap: envelope encryption por tenant (v2),
>   KEK en Vault/KMS (v3)

---

## Campos cifrados hoy

| Modelo | Campo | Tipo | Por qué cifrar | Búsqueda |
|--------|-------|------|----------------|----------|
| `MedicalIntake` | `signatureImageData` | `String? @db.Text` | Firma biométrica del paciente, data URL grande, regulatorio | No |

## Campos candidatos (pendientes — Fase 1.3.b/c)

| Modelo | Campo | Riesgo si se filtra | Bloqueador |
|--------|-------|--------------------|--------------|
| `Profile` | `firstName`, `lastName` | Identifica persona | Búsqueda por nombre necesaria — requiere hash determinístico aparte para WHERE |
| `Profile` | `phone` | Identifica + permite phishing | Igual que arriba |
| `Profile` | `birthDate` | Identifica unívocamente con nombre | Reportes por edad — ¿cifrar y decifrar al filtrar?  |
| `MedicalIntake` | `personalJson`, `historyJson` | Historia médica completa | JSON queries — pero queries directas a JSON ya son raras |
| `Document` | `signatureKey`, `storageKey` | Path a archivo, no contenido | Bajo prioridad — no son PHI directo |
| `User` | `email` | Identifica + spear phishing | Login requiere lookup por email — necesita hash determinístico |

---

## Cuándo migrar un campo nuevo

1. Definir si soporta búsqueda. Si sí, decidir entre:
   - Hash determinístico (HMAC) en columna paralela `<field>Hash`
   - No cifrar (mantener plaintext) — documentar el tradeoff
2. Schema Prisma: el campo sigue siendo `String`. El cifrado es transparente al modelo.
3. Cambiar callers que escriben → `encryptPhi(value)`.
4. Cambiar callers que leen → `decryptPhi(value)`.
5. Migración idempotente que cifra filas existentes (pattern: ver
   `server/scripts/migrate-signatures-to-phi.ts`).
6. Test de roundtrip: insertar plaintext, leer descifrado, comparar.

---

## Rotación de PHI_MASTER_KEY

Una rotación de master key implica re-cifrar TODOS los campos PHI.
Procedimiento (ventana baja, ~30 min para data set actual):

### 1. Backup obligatorio
```bash
/home/velumadmin/velum-laser-final/scripts/backup-db.sh
```

### 2. Generar nueva key + setear como secundaria
```env
PHI_MASTER_KEY_NEW=<nueva key generada>
PHI_MASTER_KEY=<key actual — sigue siendo la default>
```

> Hoy `phiCrypto.ts` usa una sola key. Para rotación real, primero hay
> que extender el helper para entender un set de keys (key id en el
> envelope: `phi:v1:k2:<...>`). Ese cambio NO está hecho — antes de
> rotar, implementar version field en el helper.

### 3. Script de re-cifrado
```bash
docker exec velum-laser-final-api-1 npx tsx scripts/rekey-phi.ts \
  --from-key "$PHI_MASTER_KEY" --to-key "$PHI_MASTER_KEY_NEW" --apply
```

(Ese script no existe aún — ver TODO en `docs/runbooks/`.)

### 4. Promover la nueva key
```env
PHI_MASTER_KEY=<la nueva>
# eliminar PHI_MASTER_KEY_NEW
```

### 5. Verificar
```sql
-- Cero filas con cifrado bajo la key vieja
SELECT COUNT(*) FROM "MedicalIntake"
  WHERE "signatureImageData" LIKE 'phi:v1:k1:%';
```

### 6. Restart api + worker

---

## Migración inicial (de `enc1:` legacy a `phi:v1:`)

```bash
# 1. Backup
/home/velumadmin/velum-laser-final/scripts/backup-db.sh

# 2. Dry-run: cuenta cuántas filas tienen el formato legacy
docker exec velum-laser-final-api-1 npx tsx scripts/migrate-signatures-to-phi.ts

# 3. Aplicar
docker exec velum-laser-final-api-1 npx tsx scripts/migrate-signatures-to-phi.ts --apply

# 4. Verificar
docker exec velum-laser-final-postgres-1 psql -U postgres -d velum -c \
  "SELECT
     SUM(CASE WHEN \"signatureImageData\" LIKE 'phi:v1:%' THEN 1 ELSE 0 END) AS migrated,
     SUM(CASE WHEN \"signatureImageData\" LIKE 'enc1:%' THEN 1 ELSE 0 END) AS pending,
     SUM(CASE WHEN \"signatureImageData\" IS NOT NULL
              AND \"signatureImageData\" NOT LIKE 'phi:v1:%'
              AND \"signatureImageData\" NOT LIKE 'enc1:%' THEN 1 ELSE 0 END) AS plaintext
   FROM \"MedicalIntake\";"
```

`pending` debe ser 0 al final. `plaintext` debe ser 0 también (filas
muy viejas pre-cifrado). Si no, investigar fila por fila antes de borrar
el compat layer.

---

## Observabilidad

- Sentry tag `phi.crypto.error` en cualquier fallo de descifrado
  (ver `phiCrypto.ts` — todavía no instrumentado, TODO).
- Métrica futura: count de filas pendientes por tipo de cifrado, alerta
  si > 0 después de 7 días desde la migración.

---

## Threat model — qué cubre y qué NO

**Cubre:**
- Dump de Postgres robado: filas cifradas requieren la master key
- Backup leak: el `.sql.gz` no contiene la key (vive solo en env del
  contenedor)
- DBA con acceso a tablas pero no al servidor de aplicación: ve
  `phi:v1:...` blob, no plaintext

**NO cubre:**
- Compromiso del servidor de aplicación: el proceso tiene la key en
  memoria — game over. Mitigación: HSM, KMS managed.
- SQL injection en código de la app: si el SELECT pasa por descifrado,
  el atacante recibe plaintext.
- Logs descuidados: nunca loguear el plaintext, ni el ciphertext junto
  al error stack. El módulo `pino` ya redacta passwords/tokens; PHI
  debe sumarse al redact paths.
- IV reuse (improbable: usamos randomBytes per call) — no es riesgo
  práctico.
