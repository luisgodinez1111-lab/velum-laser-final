/** @type {import('tailwindcss').Config} */
// Tokens consumidos desde design/tokens.ts vía require dinámico — Tailwind config
// corre en CommonJS pero los tokens están en TS. Una build paralela los compila
// con tsx. Si el bundle peta, fallback a hex literales explícitos.
//
// Para regenerar luego de tocar tokens.ts:
//   npx tsx design/tokens.css.ts > design/tokens.css
//   (Tailwind se rebuildea automático en `npm run build` / `npm run dev`)

import { core, space, radius, typography, shadow } from "./design/tokens.ts";

export default {
  content: [
    './index.html',
    './index.tsx',
    './App.tsx',
    './pages/**/*.{js,ts,jsx,tsx}',
    './components/**/*.{js,ts,jsx,tsx}',
    './context/**/*.{js,ts,jsx,tsx}',
    './services/**/*.{js,ts,jsx,tsx}',
    './stories/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      fontFamily: typography.fontFamily,
      fontSize: typography.fontSize,
      fontWeight: typography.fontWeight,
      lineHeight: typography.lineHeight,
      letterSpacing: typography.letterSpacing,
      colors: {
        velum: core.velum,
        // Semantic alias — usar `bg-success-50`, `text-danger-700`, etc.
        success: core.intent.success,
        warning: core.intent.warning,
        danger:  core.intent.danger,
        info:    core.intent.info,
      },
      borderRadius: {
        sm: radius.sm,
        md: radius.md,
        lg: radius.lg,
        xl: radius.xl,
      },
      spacing: space,
      boxShadow: {
        sm: shadow.sm,
        md: shadow.md,
        lg: shadow.lg,
        xl: shadow.xl,
      },
    },
  },
  plugins: [],
};
