# Runbook — Design System

> **Estado actual (Movimiento #9):**
> - Tokens en `design/tokens.ts` (single source of truth, 3 capas: core / semantic / component)
> - `design/tokens.css` regenerable con `npm run tokens:build`
> - `tailwind.config.js` consume tokens vía `import` — sin valores hardcoded
> - Storybook 10 con 3 stories piloto (Button, TextInput, Card)
> - Bundle budget enforced en CI: entry < 70 KB gzip, vendor-react < 70 KB, CSS < 60 KB

---

## Capas del sistema

```
design/tokens.ts
      ├── core      (primitivos: velum.500, neutral.700, intent.danger.500)
      ├── color     (semantic: text.primary, surface.canvas, status.dangerBg)
      ├── space     (4-base: 0,1,2,3,4,5,6,8,10,12,16,20,24)
      ├── radius    (sm 6px, md 10px, lg 14px, xl 20px, full)
      ├── typography (fontFamily, fontSize, fontWeight, lineHeight, letterSpacing)
      ├── shadow    (none, sm, md, lg, xl)
      ├── motion    (duration: fast/base/slow/slower; easing: standard/decelerate/accelerate)
      └── z         (base, raised, sticky, overlay, modal, toast, tooltip)
```

**Regla:** los componentes consumen `color.text.primary`, NO `core.velum[900]`.
La capa `color.*` es el contrato; `core.*` es implementation detail que puede
cambiar sin tocar componentes (ej. dark mode, white-label por tenant).

## Pipeline

```
design/tokens.ts (TS, fuente de verdad)
      ├──> tailwind.config.js  (theme.extend, build time)
      └──> design/tokens.css   (CSS vars vía `npm run tokens:build`, runtime)
```

Los componentes usan **clases Tailwind** que internamente leen los valores
del theme. Los `tokens.css` con CSS variables habilitan futuro dark mode
sin rebuild — solo cambiar el set de vars en `:root[data-theme="dark"]`.

## Comandos

```bash
npm run tokens:build       # regenera tokens.css desde tokens.ts
npm run storybook          # Storybook dev en :6006
npm run storybook:build    # build estático en storybook-static/
npm run size-check         # valida budget de bundle (ver package.json size-limit)
```

## Cuándo añadir un token

1. **Existe ya?** `Ctrl+F` en `tokens.ts`. Lo más probable es que sí.
2. **Es semantic o core?**
   - Si es un valor universal nuevo (ej. un nuevo gris): añadir en `core`.
   - Si es un nuevo significado (ej. `surface.elevated` para un caso nuevo):
     añadirlo en la capa `color.*` apuntando a un `core` existente.
3. Editar `tokens.ts`, correr `npm run tokens:build`, commitear ambos.
4. Si afecta el theme de Tailwind, también ajustar `tailwind.config.js`.

## Cuándo añadir un componente al system

1. Se usa **3 o más veces** en pages/components con variaciones consistentes.
2. Tiene API estable (props bien definidos, no mutará en próximas semanas).
3. Crear en `stories/<Name>.tsx` + `<Name>.stories.tsx`.
4. Cubrir **todos** los estados: default, hover, focus, disabled, loading, error.
5. Accesibilidad: roles ARIA, keyboard nav, contraste WCAG AA mínimo.

Para componentes con lógica compleja (Modal, Combobox, Dropdown), evaluar
**Radix UI** (headless, gratis accesibilidad) en lugar de implementar desde
cero.

## Bundle budget

Definido en `package.json` campo `size-limit`:

| Bucket | Límite (gzip) | Por qué |
|--------|----------|---------|
| Entry chunk (`index-*.js`) | 70 KB | Lazy loading agresivo del rest. Sin esto, FCP se degrada en móvil |
| Vendor React | 70 KB | React + ReactDOM + react-router. Si crece, evaluar `react-router/dom` mini. |
| CSS total | 60 KB | Tailwind purgea correctamente. Si crece, sospechar de `safelist` mal usado. |

CI rompe el build si se excede. Para ajustar: editar el array `size-limit`
en `package.json` (con justificación en el commit).

## Pendientes (priorizadas)

- [ ] **Radix primitives** para Modal, Tooltip, Combobox (no reinventar accesibilidad)
- [ ] **Dark theme** — solo agregar bloque `[data-theme="dark"]` en `tokens.css`
- [ ] **Iconography**: convención de tamaños (16, 20, 24px) — hoy ad-hoc con lucide-react
- [ ] **Migración de UI existente**: pages/components legacy que usan colores hex literales
      o spacing arbitrario — auditar con grep, refactorear oportunísticamente
- [ ] **Visual regression**: Chromatic / Playwright screenshot tests para evitar
      drift visual sin que nadie note
- [ ] **a11y**: instalar `@storybook/addon-a11y` y axe-core checks por story
