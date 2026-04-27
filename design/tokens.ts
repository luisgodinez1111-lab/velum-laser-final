/**
 * Design tokens — single source of truth.
 *
 * Estructura en 3 capas (siguiendo el patrón de Material Design 3 / Adobe Spectrum):
 *
 *   1. **core**   — valores primitivos. velum-50..900, neutral-*, semantic colors.
 *                    NO se usan directamente en componentes — son building blocks.
 *
 *   2. **semantic** — significado. text.primary, surface.subtle, border.danger.
 *                    Lo que usan los componentes. Permite re-tematización (dark mode,
 *                    white-label por tenant) cambiando solo la capa semantic.
 *
 *   3. **component** (futuro) — overrides por componente cuando un caso especial
 *                                lo amerita. Hoy: vacío.
 *
 * Pipeline:
 *
 *   tokens.ts (TS, fuente de verdad)
 *      ├─→ tailwind.config.js  (theme.extend, build time)
 *      ├─→ tokens.css          (CSS vars, runtime — habilita dark mode con cambio
 *      │                         de variable sin rebuild)
 *      └─→ Storybook design tab (próximamente con @storybook/addon-designs)
 *
 * No agregar valores ad-hoc en CSS o componentes. Si un caso nuevo requiere un
 * color/spacing, primero añadirlo aquí.
 */

// ── 1. Core tokens (primitive values) ──────────────────────────────────────

const velum = {
  50:  "#fdfcfb",
  100: "#f7f5f2",
  200: "#efeadd",
  300: "#e0d6c0",
  400: "#ccb999",
  500: "#b89c76",
  600: "#9d8160",
  700: "#7e664d",
  800: "#675341",
  900: "#544538",
} as const;

const neutral = {
  0:    "#ffffff",
  50:   "#fafafa",
  100:  "#f5f5f5",
  200:  "#e5e5e5",
  300:  "#d4d4d4",
  400:  "#a3a3a3",
  500:  "#737373",
  600:  "#525252",
  700:  "#404040",
  800:  "#262626",
  900:  "#171717",
  1000: "#000000",
} as const;

const intent = {
  success: { 50: "#f0fdf4", 100: "#dcfce7", 500: "#22c55e", 700: "#15803d" },
  warning: { 50: "#fffbeb", 100: "#fef3c7", 500: "#f59e0b", 700: "#b45309" },
  danger:  { 50: "#fef2f2", 100: "#fee2e2", 500: "#ef4444", 700: "#b91c1c" },
  info:    { 50: "#eff6ff", 100: "#dbeafe", 500: "#3b82f6", 700: "#1d4ed8" },
} as const;

export const core = { velum, neutral, intent } as const;

// ── 2. Semantic tokens ─────────────────────────────────────────────────────
// Usar estos en componentes, NO los core directamente.

export const color = {
  text: {
    primary:    velum[900],
    secondary:  velum[700],
    muted:      velum[500],
    inverse:    neutral[0],
    onAccent:   neutral[0],
    success:    intent.success[700],
    warning:    intent.warning[700],
    danger:     intent.danger[700],
  },
  surface: {
    canvas:     velum[50],   // fondo de página
    raised:     neutral[0],  // cards, modales
    subtle:     velum[100],  // hover, secciones suaves
    accent:     velum[900],  // botones primarios
    accentHover: velum[800],
    inverse:    velum[900],
  },
  border: {
    subtle:     velum[200],
    default:    velum[300],
    strong:     velum[500],
    accent:     velum[900],
    success:    intent.success[500],
    warning:    intent.warning[500],
    danger:     intent.danger[500],
  },
  status: {
    successBg:  intent.success[50],
    successFg:  intent.success[700],
    warningBg:  intent.warning[50],
    warningFg:  intent.warning[700],
    dangerBg:   intent.danger[50],
    dangerFg:   intent.danger[700],
    infoBg:     intent.info[50],
    infoFg:     intent.info[700],
  },
} as const;

export const space = {
  /** spacing scale 4-base (Tailwind compat) */
  0:   "0px",
  1:   "0.25rem",  // 4px
  2:   "0.5rem",   // 8px
  3:   "0.75rem",  // 12px
  4:   "1rem",     // 16px
  5:   "1.25rem",  // 20px
  6:   "1.5rem",   // 24px
  8:   "2rem",     // 32px
  10:  "2.5rem",   // 40px
  12:  "3rem",     // 48px
  16:  "4rem",     // 64px
  20:  "5rem",     // 80px
  24:  "6rem",     // 96px
} as const;

export const radius = {
  none: "0",
  sm:   "0.375rem",  // 6px — chips, badges
  md:   "0.625rem",  // 10px — inputs
  lg:   "0.875rem",  // 14px — cards
  xl:   "1.25rem",   // 20px — modales, secciones grandes
  full: "9999px",    // pills, avatares
} as const;

export const typography = {
  fontFamily: {
    serif: '"Playfair Display", serif',
    sans:  '"Lato", sans-serif',
    mono:  'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
  },
  fontSize: {
    xs:   "0.75rem",   // 12px — captions, helper text
    sm:   "0.875rem",  // 14px — body small
    base: "1rem",      // 16px — body
    lg:   "1.125rem",  // 18px — body large
    xl:   "1.25rem",   // 20px — h4
    "2xl":"1.5rem",    // 24px — h3
    "3xl":"1.875rem",  // 30px — h2
    "4xl":"2.25rem",   // 36px — h1
  },
  fontWeight: {
    regular:  "400",
    medium:   "500",
    semibold: "600",
    bold:     "700",
  },
  lineHeight: {
    tight:   "1.2",
    snug:    "1.4",
    normal:  "1.5",
    relaxed: "1.7",
  },
  letterSpacing: {
    tight:  "-0.02em",
    normal: "0",
    wide:   "0.04em",
  },
} as const;

export const shadow = {
  none: "none",
  sm:   "0 1px 2px 0 rgb(0 0 0 / 0.04)",
  md:   "0 4px 12px -2px rgb(0 0 0 / 0.06)",
  lg:   "0 12px 28px -8px rgb(0 0 0 / 0.10)",
  xl:   "0 24px 48px -16px rgb(0 0 0 / 0.18)",
} as const;

export const motion = {
  duration: {
    fast:    "120ms",
    base:    "180ms",
    slow:    "260ms",
    slower:  "400ms",
  },
  easing: {
    standard:   "cubic-bezier(0.2, 0, 0.2, 1)",
    decelerate: "cubic-bezier(0, 0, 0.2, 1)",
    accelerate: "cubic-bezier(0.4, 0, 1, 1)",
  },
} as const;

export const z = {
  base:    0,
  raised:  10,
  sticky:  20,
  overlay: 50,
  modal:   60,
  toast:   70,
  tooltip: 80,
} as const;

// ── Export agregado para consumidores externos (Tailwind, Storybook) ────────

export const tokens = { core, color, space, radius, typography, shadow, motion, z } as const;

export type Tokens = typeof tokens;
