# Runbook — Restore de PostgreSQL

> **Audiencia:** on-call / quien tenga acceso SSH al VPS Hetzner.
> **Severidad esperada:** S1 (incidente) o programada (migración riesgosa).
> **RTO objetivo:** 15 minutos para datos del último backup.
> **RPO objetivo:** 24 horas (backup diario 03:00 hora MX).

---

## 0. Antes de ejecutar — decisión

| Situación | Acción |
|-----------|--------|
| DB corrupta / migración salió mal / data loss confirmada | **Sí, restore.** Continuar a §1. |
| Bug en aplicación, datos OK | **NO restore.** Rollback de imagen Docker. Ver `RUNBOOK_ROLLBACK_OPERACION.md`. |
| Necesito una copia para debugging | **NO restore a prod.** Usar `db-restore-test.sh` que crea DB efímera. Ver §5. |

Restore destruye los datos posteriores al backup. Antes de continuar:
1. Confirma con el dueño del producto.
2. Avisa en el canal de incidentes.
3. Detén el tráfico al API (ver §1.1).

---

## 1. Restore a producción

### 1.1 Detener tráfico

```bash
# Bajar el API (los webhooks de Stripe/Google se reintentan automáticamente).
# nginx queda arriba sirviendo el frontend en modo solo-lectura.
docker compose -f /home/velumadmin/velum-laser-final/docker-compose.yml stop api
```

### 1.2 Backup del estado actual (pre-restore)

Un restore sin antes resguardar el estado actual destruye evidencia forense.

```bash
TS=$(date +%Y%m%d_%H%M%S)
docker exec velum-laser-final-postgres-1 \
  pg_dump -U postgres velum | gzip -9 \
  > /home/velumadmin/backups/db/preincident_${TS}.sql.gz

# Verificar integridad antes de continuar.
gzip -t /home/velumadmin/backups/db/preincident_${TS}.sql.gz && echo "OK"
```

### 1.3 Elegir el backup a restaurar

```bash
ls -lht /home/velumadmin/backups/db/ | head -10
```

Decide qué timestamp restaurar. Por defecto, el último diario:

```bash
DUMP=$(ls -1t /home/velumadmin/backups/db/velum_*.sql.gz | head -1)
echo "Restaurando: $DUMP"
```

### 1.4 Probar el dump en DB efímera (5 min, OBLIGATORIO)

Nunca restaures a prod sin haber probado el dump elegido el mismo día.

```bash
/home/velumadmin/velum-laser-final/scripts/db-restore-test.sh "$DUMP"
```

Si los smoke tests fallan, **detente** y elige el siguiente backup más reciente.

### 1.5 Restore real

```bash
# 1) Drop + recreate de la DB de prod (destructivo).
docker exec velum-laser-final-postgres-1 psql -U postgres -c \
  "DROP DATABASE velum;"
docker exec velum-laser-final-postgres-1 psql -U postgres -c \
  "CREATE DATABASE velum;"

# 2) Restore.
gunzip -c "$DUMP" | docker exec -i velum-laser-final-postgres-1 \
  psql -U postgres -d velum -v ON_ERROR_STOP=1
```

### 1.6 Validar integridad post-restore

```bash
docker exec velum-laser-final-postgres-1 psql -U postgres -d velum <<'SQL'
SELECT 'Tenant' AS table, COUNT(*) FROM "Tenant"
UNION ALL SELECT 'User',         COUNT(*) FROM "User"
UNION ALL SELECT 'Appointment',  COUNT(*) FROM "Appointment"
UNION ALL SELECT 'Payment',      COUNT(*) FROM "Payment"
UNION ALL SELECT 'Membership',   COUNT(*) FROM "Membership";

-- Confirmar que las FKs siguen presentes (post-Fase 0.2).
SELECT conname FROM pg_constraint WHERE conname LIKE '%clinicId_fkey';

-- Confirmar que ningún User quedó huérfano de Tenant.
SELECT COUNT(*) AS orphans
FROM "User" u LEFT JOIN "Tenant" t ON u."clinicId" = t.id
WHERE t.id IS NULL;
SQL
```

`orphans` debe ser **0**. Si no, abortar y subir el dump preincident_${TS}.

### 1.7 Levantar API y verificar

```bash
docker compose -f /home/velumadmin/velum-laser-final/docker-compose.yml start api
sleep 10
curl -sfk https://localhost/api/health | jq
```

Espera `{"ok":true,"service":"api","db":"ok"}`.

### 1.8 Smoke test E2E

- Login con un usuario admin.
- Carga del dashboard.
- Lista de citas.
- Stripe webhook health (no es testeable sin tráfico real — monitorear logs por 30 min).

---

## 2. Reconciliación post-restore

Ventana entre `dump.sql.gz` (T0) y el incidente (T1) = datos perdidos.

| Origen externo | Acción |
|----------------|--------|
| Stripe webhooks | Replay en dashboard de Stripe → Developers → Webhooks → Events. Filtrar por timestamp T0..T1. |
| Pagos exitosos en T0..T1 | Stripe los reintentará. Verificar `Payment` table 24h después. |
| Citas creadas en T0..T1 desde Google Calendar | El sync watch las recapturará en su siguiente sweep. |
| Appointments creadas desde la app | **Pérdida real.** Comunicar a staff para re-agendar manualmente. |
| Documentos firmados en T0..T1 | **Pérdida real si el archivo PDF está solo en `/var/velum/uploads`.** Confirmar con el paciente. |

---

## 3. Comunicación

| Estado | Mensaje | Canal |
|--------|---------|-------|
| Detección | "Detectamos incidente en VELUM, investigando." | Telegram interno |
| En restore | "Restore en progreso. ETA 15 min." | Telegram interno |
| Resuelto | "Servicio restaurado. Pérdida de datos: T0..T1." | Telegram interno + email a staff |
| Postmortem | RFC público en `docs/postmortems/AAAA-MM-DD.md` | Repo |

---

## 4. Cron de validación semanal

Agregar a crontab del usuario `velumadmin` para detectar backups corruptos antes de necesitarlos:

```cron
# Backup diario 03:00 (ya configurado)
0 3 * * * /home/velumadmin/velum-laser-final/scripts/backup-db.sh >> /var/log/velum-backup.log 2>&1

# Restore-test domingos 04:00 — alerta si falla
0 4 * * 0 /home/velumadmin/velum-laser-final/scripts/db-restore-test.sh >> /var/log/velum-restore-test.log 2>&1 || \
  curl -X POST "$SLACK_WEBHOOK" -d '{"text":"⚠️ Velum: restore-test FAILED"}'
```

---

## 5. Restore para debugging (no destructivo)

Cuando necesites revisar datos sin tocar producción:

```bash
# Crea velum_debug a partir del último backup, sin tocar prod.
DUMP=$(ls -1t /home/velumadmin/backups/db/velum_*.sql.gz | head -1)

docker exec velum-laser-final-postgres-1 psql -U postgres -c "DROP DATABASE IF EXISTS velum_debug;"
docker exec velum-laser-final-postgres-1 psql -U postgres -c "CREATE DATABASE velum_debug;"
gunzip -c "$DUMP" | docker exec -i velum-laser-final-postgres-1 \
  psql -U postgres -d velum_debug -v ON_ERROR_STOP=1

# Conectar y consultar.
docker exec -it velum-laser-final-postgres-1 psql -U postgres -d velum_debug

# Cuando termines:
docker exec velum-laser-final-postgres-1 psql -U postgres -c "DROP DATABASE velum_debug;"
```

---

## 6. Mejoras pendientes (Fase 1+)

- **Offsite backups** a Hetzner Storage Box (ver `STORAGEBOX_TOKEN` en `.env.example`).
  Hoy todos los backups viven en el mismo VPS — un fallo de disco los borra a todos.
- **PITR (Point-In-Time Recovery)** vía WAL archiving — reduce RPO de 24h a < 5 min.
- **Backup de `/var/velum/uploads`** — los documentos firmados no están en este flujo.
- **Probar restore en host secundario** — actualmente probamos en el mismo host, lo que
  no valida que se pueda recuperar si el host muere.

---

*Última prueba exitosa de restore-test: ver `/var/log/velum-restore-test.log`.*
