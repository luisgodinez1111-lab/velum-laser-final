/** @type {import('tailwindcss').Config} */
// Tokens consumidos desde design/tokens.ts vía require dinámico — Tailwind config
// corre en CommonJS pero los tokens están en TS. Una build paralela los compila
// con tsx. Si el bundle peta, fallback a hex literales explícitos.
//
// Para regenerar luego de tocar tokens.ts:
//   npx tsx design/tokens.css.ts > design/tokens.css
//   (Tailwind se rebuildea automático en `npm run build` / `npm run dev`)

import { core, space, radius, typography, shadow, motion } from "./design/tokens.ts";

export default {
  // Dark mode opt-in vía .dark en <html>. ThemeProvider lo gestiona y
  // persiste preferencia en localStorage. Default sigue siendo light.
  darkMode: 'class',
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
        // Focus ring elegante — usado por todos los primitivos interactivos
        focus: `0 0 0 3px ${core.velum[300]}66`,
        focusDanger: `0 0 0 3px ${core.intent.danger[500]}40`,
      },
      // motion tokens (design/tokens.ts) → utility classes:
      //   duration-fast / duration-base / duration-slow / duration-slower
      //   ease-standard / ease-decelerate / ease-accelerate
      transitionDuration: motion.duration,
      transitionTimingFunction: motion.easing,
      // Keyframes y animaciones consistentes — usar en lugar de duration-* hardcoded
      keyframes: {
        'fade-in':       { '0%': { opacity: '0' }, '100%': { opacity: '1' } },
        'fade-in-up':    { '0%': { opacity: '0', transform: 'translateY(8px)' }, '100%': { opacity: '1', transform: 'translateY(0)' } },
        'fade-in-down':  { '0%': { opacity: '0', transform: 'translateY(-8px)' }, '100%': { opacity: '1', transform: 'translateY(0)' } },
        'scale-in':      { '0%': { opacity: '0', transform: 'scale(0.96)' }, '100%': { opacity: '1', transform: 'scale(1)' } },
        'shimmer':       { '0%': { backgroundPosition: '-200% 0' }, '100%': { backgroundPosition: '200% 0' } },
        'spin-slow':     { '0%': { transform: 'rotate(0deg)' }, '100%': { transform: 'rotate(360deg)' } },
      },
      animation: {
        'fade-in':      `fade-in ${motion.duration.base} ${motion.easing.decelerate} both`,
        'fade-in-up':   `fade-in-up ${motion.duration.slow} ${motion.easing.decelerate} both`,
        'fade-in-down': `fade-in-down ${motion.duration.slow} ${motion.easing.decelerate} both`,
        'scale-in':     `scale-in ${motion.duration.base} ${motion.easing.decelerate} both`,
        'shimmer':      'shimmer 1.6s linear infinite',
        'spin-slow':    'spin-slow 1s linear infinite',
      },
    },
  },
  plugins: [],
};
