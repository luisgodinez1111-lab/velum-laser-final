/**
 * Exporta el spec OpenAPI definido en `src/openapi.ts` a un archivo JSON.
 * Este JSON es el contrato de fuente única para:
 *   - Generación de tipos cliente (frontend) — ver scripts/codegen.sh en root
 *   - Documentación interactiva (Swagger UI)
 *   - Validación contractual en CI
 *
 * Uso:
 *   tsx scripts/export-openapi.ts > openapi.json
 *   tsx scripts/export-openapi.ts /ruta/destino.json
 */
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { openApiSpec } from "../src/openapi";

const target = process.argv[2] ?? resolve(import.meta.dirname ?? __dirname, "..", "openapi.json");
const json = JSON.stringify(openApiSpec, null, 2);

if (target === "-") {
  process.stdout.write(json + "\n");
} else {
  writeFileSync(target, json + "\n", "utf8");
  console.error(`OpenAPI spec written: ${target} (${json.length} bytes)`);
}
