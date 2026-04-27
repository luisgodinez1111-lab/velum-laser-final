/**
 * Migración idempotente: re-cifra MedicalIntake.signatureImageData del
 * formato legacy `enc1:<...>` (cifrado con INTEGRATIONS_ENC_KEY) al
 * formato nuevo `phi:v1:<...>` (cifrado con PHI_MASTER_KEY).
 *
 * Es idempotente — correrlo varias veces no rompe nada. Filas ya
 * migradas se ignoran.
 *
 * Pre-condiciones:
 *   - PHI_MASTER_KEY (32 bytes) configurada en env
 *   - INTEGRATIONS_ENC_KEY (la KEK vieja) configurada en env
 *   - Backup de DB tomado antes de correr (precaución elemental)
 *
 * Uso:
 *   npx tsx scripts/migrate-signatures-to-phi.ts            # dry-run, cuenta filas
 *   npx tsx scripts/migrate-signatures-to-phi.ts --apply    # ejecuta
 */
import { prisma } from "../src/db/prisma";
import { decrypt as legacyDecrypt } from "../src/utils/crypto";
import { encryptSignature, isEncrypted } from "../src/utils/phiCrypto";

const LEGACY_PREFIX = "enc1:";
const APPLY = process.argv.includes("--apply");

async function main(): Promise<void> {
  const candidates = await prisma.medicalIntake.findMany({
    where: { signatureImageData: { startsWith: LEGACY_PREFIX } },
    select: { id: true, userId: true, signatureImageData: true },
  });

  console.log(`Encontradas ${candidates.length} filas con formato legacy ${LEGACY_PREFIX}*`);

  if (candidates.length === 0) {
    console.log("Nada que migrar. Bye.");
    return;
  }

  if (!APPLY) {
    console.log("Dry-run. Re-correr con --apply para ejecutar la migración.");
    console.log("Sample IDs:", candidates.slice(0, 3).map((r) => r.id));
    return;
  }

  let migrated = 0;
  let skipped = 0;
  let failed = 0;

  for (const row of candidates) {
    const val = row.signatureImageData;
    if (!val || !val.startsWith(LEGACY_PREFIX)) { skipped++; continue; }
    if (isEncrypted(val)) { skipped++; continue; } // ya migrado entre passes

    try {
      const plain = legacyDecrypt(val.slice(LEGACY_PREFIX.length));
      const reencrypted = encryptSignature(plain);
      await prisma.medicalIntake.update({
        where: { id: row.id },
        data: { signatureImageData: reencrypted },
      });
      migrated++;
      console.log(`✓ ${row.id} (user=${row.userId})`);
    } catch (err) {
      const e = err instanceof Error ? err.message : String(err);
      console.error(`✗ ${row.id} (user=${row.userId}): ${e}`);
      failed++;
    }
  }

  console.log(`\nResumen: migrated=${migrated} skipped=${skipped} failed=${failed}`);

  if (failed > 0) {
    process.exit(1);
  }
}

main()
  .catch((err) => { console.error(err); process.exit(1); })
  .finally(() => prisma.$disconnect());
