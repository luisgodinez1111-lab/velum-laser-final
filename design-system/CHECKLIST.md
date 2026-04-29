# Checklist de paridad Apple — por módulo

> Cada sección/página migrada debe pasar esta revisión antes de marcarse como ✅ en MASTER.md §8.
> Aplicar tras implementar, antes de commit.

## Tipografía

- [ ] Headlines >24px usan `tracking-[-0.02em]` o más cerrado
- [ ] El nombre del usuario (si aparece) es el único Playfair de la página
- [ ] No hay `font-serif italic` como subtítulo o heading no-brand
- [ ] Microlabels uppercase: máximo 1 por sección (cliente: 0)
- [ ] Stat numbers usan `tabular-nums leading-none`
- [ ] Body legible: mínimo 14px, 16px en lectura larga

## Jerarquía

- [ ] Una sola CTA primaria por sección visible
- [ ] Saltos de tamaño tipográfico claros (no 24→28, sí 24→48)
- [ ] El elemento más importante de la pantalla ocupa el espacio visual mayor
- [ ] Meta secundaria contrasta con primaria por **peso/color**, no solo tamaño

## Patrón de bloques (MASTER §3)

- [ ] Cada bloque mapea a un patrón de §3 o se documentó uno nuevo
- [ ] Heros usan `rounded-3xl` y padding generoso (px-8 py-12 mínimo)
- [ ] Stats trio respeta `divide-x divide-velum-100` y no usa borders gruesos
- [ ] Alerts usan paleta semántica (success/warning/danger/info), no hex ad-hoc

## CTAs

- [ ] CTA primario destacado es pill (`rounded-full`)
- [ ] Pill tiene chevron `group-hover:translate-x-0.5` cuando navega
- [ ] Sobre `bg-velum-900`, pill usa `border-white/30 → border-white bg-white text-velum-900`
- [ ] Sobre claro, pill usa `border-velum-900/20 → border-velum-900 bg-velum-900 text-white`
- [ ] CTAs internos en tablas/forms mantienen Button legacy hasta resolver decisión §6.1
- [ ] Toda CTA tiene clase `press` para feedback táctil

## Color y dark mode

- [ ] Probado en light y dark mode independientemente
- [ ] Texto primario contraste ≥4.5:1 en ambos modos
- [ ] Texto secundario contraste ≥3:1 en ambos modos
- [ ] Dividers visibles en ambos modos
- [ ] No hay `bg-emerald-*`, `bg-amber-*`, `bg-rose-*` directos — todo via tokens semánticos
- [ ] Estados (hover/active/disabled) se distinguen en ambos modos

## Decoración eliminada

- [ ] Sin blobs decorativos (`absolute rounded-full bg-velum-800/40`)
- [ ] Sin capas circulares ornamentales
- [ ] Sin sombras decorativas en hero blocks
- [ ] Sin emojis como iconos (todo Lucide o SVG)
- [ ] Sin gradientes random — solo `text-gradient` en `<VelumLogo>` o casos brand

## Motion

- [ ] Cada animación tiene significado (entrada, feedback, transición de estado)
- [ ] Solo `transform` y `opacity` — nunca `width/height/top/left`
- [ ] Duraciones en tokens (`duration-fast/base/slow/slower`)
- [ ] `animate-count-in` en stat numbers
- [ ] `animate-fade-in` o `animate-fade-in-up` en entrada de cards
- [ ] `prefers-reduced-motion` respetado (cubierto por index.css global, verificar que no rompa layout)
- [ ] Hover effects no son la única señal — hay focus state también

## Touch / accesibilidad

- [ ] Todos los targets clickeables ≥44×44 px (touch)
- [ ] Spacing entre targets adyacentes ≥8 px
- [ ] Iconos sin label tienen `aria-label`
- [ ] Inputs tienen `<label>` visible (no solo placeholder)
- [ ] Errores aparecen junto al campo, no solo arriba
- [ ] Tab order coincide con orden visual
- [ ] Focus ring visible en todos los interactivos (`shadow-focus`)
- [ ] Imágenes informativas tienen `alt`
- [ ] Color no es la única señal (errores tienen icon + texto)

## Layout / responsive

- [ ] Probado en 375 / 768 / 1280 px
- [ ] Sin scroll horizontal en mobile
- [ ] Headlines escalan: mobile usa `text-5xl`, desktop puede llegar a `text-[88px]`
- [ ] Stats trio colapsa a `grid-cols-1` en mobile con `divide-y`
- [ ] Padding generoso en mobile, NO comprimir
- [ ] Safe area respetada (mobile bottom nav usa `pb-safe`)

## Performance

- [ ] Sin layout shift al cargar (skeletons reservan espacio)
- [ ] Listas >50 items usan virtualización o paginación
- [ ] Imágenes con `width`/`height` o `aspect-ratio` declarado
- [ ] Iconos via Lucide (tree-shakeable), no via fonts

## Pre-commit final

- [ ] `npm run lint` sin errores nuevos
- [ ] `tsc --noEmit` sin errores
- [ ] Si tocaste código con tests, los 274 tests siguen pasando
- [ ] Comparación lado a lado con versión anterior — capturas en mobile y desktop
- [ ] Mensaje de commit: `feat(ui): Fase 11.X — <Módulo> apple híbrido`
