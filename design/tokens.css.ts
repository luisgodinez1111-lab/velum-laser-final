/**
 * Genera tokens.css desde tokens.ts.
 *
 * Uso:
 *   npx tsx design/tokens.css.ts > design/tokens.css
 *
 * El archivo generado se importa en index.css con `@import './design/tokens.css';`
 * — define CSS variables que Tailwind y los componentes consumen vía `var(...)`.
 *
 * Por qué CSS vars y no solo el JS object:
 *   - Cambio de tema (dark / white-label) sin rebuild — solo cambiar el set de
 *     vars en :root[data-theme="dark"].
 *   - Inspector del navegador muestra el nombre del token, no el hex.
 *   - El user puede sobrescribir vars puntuales (preferencia de fontSize, etc.).
 */
import { core, color, space, radius, typography, shadow, motion, z } from "./tokens";

const lines: string[] = [];
lines.push("/* AUTO-GENERATED from design/tokens.ts — do not edit manually. */");
lines.push("/* Regenerar: npx tsx design/tokens.css.ts > design/tokens.css */");
lines.push("");
lines.push(":root {");

// Core
for (const [k, v] of Object.entries(core.velum)) lines.push(`  --color-velum-${k}: ${v};`);
for (const [k, v] of Object.entries(core.neutral)) lines.push(`  --color-neutral-${k}: ${v};`);
for (const [intent_, scale] of Object.entries(core.intent)) {
  for (const [k, v] of Object.entries(scale)) lines.push(`  --color-${intent_}-${k}: ${v};`);
}

lines.push("");
// Semantic — color
for (const [scope, group] of Object.entries(color)) {
  for (const [k, v] of Object.entries(group)) lines.push(`  --color-${scope}-${kebab(k)}: ${v};`);
}

lines.push("");
// Spacing
for (const [k, v] of Object.entries(space)) lines.push(`  --space-${k}: ${v};`);

lines.push("");
// Radius
for (const [k, v] of Object.entries(radius)) lines.push(`  --radius-${k}: ${v};`);

lines.push("");
// Typography
for (const [k, v] of Object.entries(typography.fontFamily)) lines.push(`  --font-${k}: ${v};`);
for (const [k, v] of Object.entries(typography.fontSize)) lines.push(`  --text-${k}: ${v};`);
for (const [k, v] of Object.entries(typography.fontWeight)) lines.push(`  --weight-${k}: ${v};`);
for (const [k, v] of Object.entries(typography.lineHeight)) lines.push(`  --leading-${k}: ${v};`);
for (const [k, v] of Object.entries(typography.letterSpacing)) lines.push(`  --tracking-${k}: ${v};`);

lines.push("");
// Shadow
for (const [k, v] of Object.entries(shadow)) lines.push(`  --shadow-${k}: ${v};`);

lines.push("");
// Motion
for (const [k, v] of Object.entries(motion.duration)) lines.push(`  --duration-${k}: ${v};`);
for (const [k, v] of Object.entries(motion.easing)) lines.push(`  --easing-${k}: ${v};`);

lines.push("");
// z-index
for (const [k, v] of Object.entries(z)) lines.push(`  --z-${k}: ${v};`);

lines.push("}");
lines.push("");

function kebab(s: string): string {
  return s.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
}

process.stdout.write(lines.join("\n"));
