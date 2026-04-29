# VELUM OS — Design System MASTER

> **Lenguaje:** Apple híbrido (cálido)
> **Fuente de verdad técnica:** `design/tokens.ts` + `tailwind.config.js`
> **Piloto vivo:** `pages/Dashboard.tsx` líneas 685-900 (commit `ab62fa5`)
> **Audiencia:** desarrolladores aplicando el sistema a módulos cliente y admin
> **Última auditoría:** 2026-04-29

---

## 1. Principios

Cinco reglas que ningún módulo viola:

1. **Una sola CTA primaria por sección.** Las secundarias son outline/ghost o links subrayados, nunca compiten visualmente.
2. **Jerarquía por escala extrema, no por color.** Headlines de 56-88px junto a body de 13-15px. Saltos pequeños (24→28→32) son ruido.
3. **Sans Lato es el idioma. Playfair es momento brand.** Italic Playfair sólo en piezas singulares (nombre del paciente, nombre del plan). Nunca como heading regular.
4. **Densidad cálida, no fría.** Mantener paleta velum (tonos tierra) — el blanco frío de apple.com no encaja con clínica de estética. Whitespace generoso pero superficies con calidez.
5. **El motion explica causa-efecto.** Cada animación debe tener significado (entrada, feedback táctil, transición de estado). Cero animación decorativa.

---

## 2. Tokens (referencia rápida)

> Los valores autoritativos viven en `design/tokens.ts`. Esta tabla es referencia para no abrir el archivo.

### Color — paleta velum

| Token | Hex | Uso canónico |
|-------|-----|--------------|
| `velum-50`  | `#fdfcfb` | canvas (fondo de página) |
| `velum-100` | `#f7f5f2` | hover suave, secciones internas |
| `velum-200` | `#efeadd` | borders subtle |
| `velum-300` | `#e0d6c0` | borders default, dividers visibles |
| `velum-400` | `#ccb999` | meta secundaria sobre fondo oscuro |
| `velum-500` | `#b89c76` | text muted, captions |
| `velum-700` | `#7e664d` | text secondary |
| `velum-800` | `#675341` | bg accent hover, dark surfaces |
| `velum-900` | `#544538` | text primary, surface accent (CTAs/heros) |

### Color — semánticos (intent)

`success` (verde) · `warning` (ámbar) · `danger` (rojo) · `info` (azul)
Uso obligatorio para alerts/badges. Nunca usar `bg-emerald-*` o `bg-amber-*` ad-hoc — siempre `success-*` / `warning-*` / `danger-*` del token.

### Tipografía

| Familia | Token | Uso |
|---------|-------|-----|
| Playfair Display | `font-serif` | **Solo** nombre de paciente, plan, momento brand. Nunca heading genérico. |
| Lato            | `font-sans`  | Headlines, body, CTAs, meta. Es el idioma. |
| SF Mono         | `font-mono`  | Cifras de IDs/códigos, no para body. |

**Escala de headlines (Apple híbrido):**

| Caso | Tamaño | Weight | Tracking | Comentario |
|------|--------|--------|----------|------------|
| Hero brand (nombre) | `text-[88px]` desktop · `text-5xl` mobile | `font-bold` Playfair | `tracking-[-0.025em]` | Único caso Playfair. Siempre acompañado de saludo sans 13px arriba. |
| Hero contextual (próxima cita) | `text-[80px]` desktop · `text-[44px]` mobile | `font-sans font-bold` | `tracking-[-0.035em]` | Sobre `bg-velum-900`. Separadores como `·` en `text-velum-400`. |
| Stat number | `text-[56px]` | `font-sans font-bold tabular-nums` | `tracking-[-0.035em]` | `leading-none` obligatorio. Acompañado de label 13px sans semibold. |
| H2 sección | `text-3xl` (30px) | `font-sans font-bold` | `tracking-[-0.02em]` | |
| H3 subsección | `text-2xl` (24px) | `font-sans font-semibold` | normal | |
| Card title (legacy) | `text-xl` Playfair | — | — | ⚠️ El primitivo `CardTitle` actual usa Playfair italic — **revisar caso por caso** al migrar. |

**Body / meta:**

- Body grande: `text-[15px]` regular, `leading-relaxed`
- Body: `text-sm` (14px) regular, `leading-normal`
- Meta/helper: `text-[13px]` `font-medium` o `font-semibold` (kicker)
- Caption: `text-xs` (12px)
- Microlabel uppercase: solo en KPIs admin extremos. Si se usa: `text-[10px] font-bold uppercase tracking-[0.18em]`. **Evitar en cliente.**

### Espaciado

Escala 4-base (4/8/12/16/20/24/32/40/48/64/80/96 px) — ver `space` en tokens.

**Padding canónico por contenedor:**

| Contenedor | Padding |
|------------|---------|
| Hero block (próxima cita, cobro destacado) | `px-8 py-12 sm:px-12 sm:py-16 lg:px-14` |
| Card normal | `p-6` (Card primitivo padding="md") |
| Stat cell (dentro de trio divide-x) | `px-8 py-10 sm:px-10 sm:py-12` |
| Alert inline | `px-4 py-3.5` |
| Pill CTA | `pl-5 pr-4 py-2.5` |

**Gap entre secciones de página:** `space-y-6` (24px) en mobile, `space-y-8` (32px) desktop.

### Radios

| Token | Valor | Uso |
|-------|-------|-----|
| `rounded-sm`   | 6px  | chips, badges |
| `rounded-md`   | 10px | inputs, micro-pills |
| `rounded-lg`   | 14px | cards normales |
| `rounded-2xl`  | 16px | alerts, notification cells |
| `rounded-3xl`  | 24px | hero blocks, stats trio |
| `rounded-full` | ∞    | CTAs pill, avatares, pills de estado |

**Regla:** hero blocks usan `rounded-3xl`. CTAs primarios/destacados son `rounded-full`. Cards de listado son `rounded-lg`. Nunca mezclar 4 radios distintos en una página.

### Sombras

`shadow-sm` (cards listado) · `shadow-md` (cards elevadas) · `shadow-lg` (modales) · `shadow-xl` (drawers/sheets) · `shadow-focus` (focus ring tokenizado).

**Anti-patrón:** sombras decorativas en hero blocks. El piloto usa `bg-velum-900` plano sin shadow para dar peso.

### Motion

| Token | Duración | Uso |
|-------|----------|-----|
| `duration-fast`   | 120ms | press feedback, hover icons |
| `duration-base`   | 180ms | hover de superficies, color changes |
| `duration-slow`   | 260ms | entrada de cards, transición de tabs |
| `duration-slower` | 400ms | drawers, modales, page transitions |

| Easing | Curva | Uso |
|--------|-------|-----|
| `ease-standard`   | (0.2, 0, 0.2, 1) | default, hovers |
| `ease-decelerate` | (0, 0, 0.2, 1)   | entrada de elementos |
| `ease-accelerate` | (0.4, 0, 1, 1)   | salida |

**Animaciones canónicas** (definidas en `index.css`):
`animate-fade-in` · `animate-fade-in-up` · `animate-scale-in` · `animate-count-in` (números) · `animate-tab-in` · clase `press` (active scale 0.97) · `card-hover` (translate-y-[-1px]).

**Anti-patrones:** animar `width`/`height`/`top`/`left`. Animaciones >500ms en micro-interacciones. Hover-only en mobile.

---

## 3. Patrones canónicos (extraídos del piloto)

### 3.1. Hero personal (cliente)

```
[saludo 13px sans semibold velum-500]
[NOMBRE 88px Playfair bold tracking-tight]
[fecha capitalize 13px sans medium velum-400]
```

Sin background propio (vive sobre canvas). Sin CTA — es momento brand.

### 3.2. Hero contextual oscuro (cliente o admin)

```
section.rounded-3xl.bg-velum-900.text-white.px-8.py-12.sm:px-12.sm:py-16.lg:px-14
  [kicker 13px font-semibold text-velum-300]
  [HEADLINE 80px sans bold tracking-[-0.035em] tabular-nums (cuando aplica)]
  [meta secundaria 15px text-velum-100/300 con · separadores text-velum-600]
  [CTA pill: border-white/30 → hover: border-white bg-white text-velum-900, rounded-full, chevron group-hover:translate-x-0.5]
```

Casos de uso: próxima cita, cobro pendiente destacado, alerta crítica admin (pago vencido grande, paciente en riesgo). **No usar para anuncios neutros** — el peso del bg-900 implica acción/urgencia.

### 3.3. Stats trio (cliente y admin)

```
section.rounded-3xl.bg-white.border-velum-200/70
  grid.grid-cols-1.sm:grid-cols-3.divide-y.sm:divide-y-0.sm:divide-x.divide-velum-100
    cell.px-8.py-10:
      [label 13px sans semibold velum-500]
      [number 56px sans bold tabular-nums leading-none tracking-[-0.035em] animate-count-in]
      [suffix opcional 14px sans semibold velum-500 con chevron si es link]
```

Usado para resumen de KPIs en home cliente y home admin. **Máximo 3 columnas**. Si necesitas 4-6 KPIs, usar Bento Grid (3.4).

### 3.4. Bento Grid (admin KPIs y secciones densas)

Patrón recomendado por ui-ux-pro-max para alta densidad sin clutter. Estructura:

```
grid.grid-cols-12.gap-4
  [tile destacado col-span-6 row-span-2 — KPI primario o gráfica clave]
  [tiles col-span-3 — KPIs secundarios]
  [tile lista col-span-6 — top items / actividad reciente]
```

Tiles son `Card variant="bordered" padding="md"` o subtle. Sin shadow. Tile destacado puede usar `bg-velum-900 text-white` cuando el dato es accionable.

### 3.5. CTA pill (lenguaje Apple)

```tsx
<button className="group inline-flex items-center gap-1.5 text-[14px] font-semibold border border-velum-900/20 hover:border-velum-900 hover:bg-velum-900 hover:text-white rounded-full pl-5 pr-4 py-2.5 transition-all duration-base press">
  Texto acción
  <ChevronRight size={15} className="transition-transform group-hover:translate-x-0.5" />
</button>
```

Variantes:
- **Sobre claro:** `border-velum-900/20 hover:border-velum-900 hover:bg-velum-900 hover:text-white`
- **Sobre oscuro (`bg-velum-900`):** `border-white/30 hover:border-white hover:bg-white hover:text-velum-900`
- **Solid primario:** `bg-velum-900 hover:bg-velum-800 text-white border-transparent`

✅ **Resuelto en Fase 11.0:** existe `<PillButton>` primitive (`components/ui/PillButton.tsx`) con 3 variants (`primary` · `outlineLight` · `outlineDark`) y prop `showChevron` para el chevron animado. Usar este primitive en todos los CTAs heroicos en lugar de inline. El `<Button>` legacy (uppercase tracking-widest) **se conserva** para acciones internas en tablas, forms y drawers admin — son contextos distintos por diseño.

```tsx
// CTA heroico cliente sobre canvas claro
<PillButton variant="primary" size="md" showChevron onClick={...}>
  Agendar sesión
</PillButton>

// CTA secundaria sobre canvas claro
<PillButton variant="outlineLight" showChevron>Ver historial</PillButton>

// CTA dentro de hero contextual oscuro (bg-velum-900)
<PillButton variant="outlineDark" showChevron>Ver todas las citas</PillButton>
```

### 3.6. Alert inline (cliente)

```
[icon container w-7 h-7 rounded-xl bg-{intent}-100]
[icon 13px text-{intent}-600]
[título 13px font-semibold text-{intent}-900]
[descripción 12px text-{intent}-700 leading-snug]
[CTA opcional: link underline o pill xs]
```

Contenedor: `flex items-start gap-3 bg-{intent}-50 border border-{intent}-200/80 rounded-2xl px-4 py-3.5 animate-fade-in`.

Para alerts importantes accionables, considerar el patrón "alert oscuro" (bg-velum-900 con CTA pill blanco) — solo cuando el bloqueo es total.

---

## 4. Primitives — estado de alineación con Apple híbrido

| Primitive | Archivo | Estado | Notas |
|-----------|---------|--------|-------|
| `Card` | `components/ui/Card.tsx` | ✅ alineado | Default `CardTitle` ahora es sans bold tracking-tight (Fase 11.0). Para momentos brand puntuales usar `<CardTitleBrand>` que mantiene Playfair italic. |
| `DataTable` | `components/ui/DataTable.tsx` | ✅ alineado | Migración de Fase 10.3 ya refactorizó 8 tablas admin. Mantiene densidad correcta. |
| `Button` | `components/ui/Button.tsx` | ✅ por convención | Lenguaje editorial uppercase tracking-widest **se conserva** para acciones internas (tablas, forms, drawers admin). No es legacy a eliminar — es el primitive correcto para densidad funcional. Para CTAs heroicos usar `<PillButton>`. |
| `PillButton` | `components/ui/PillButton.tsx` | ✅ nuevo (Fase 11.0) | CTAs heroicos del cliente y alertas accionables admin. 3 variants (primary, outlineLight, outlineDark), 3 sizes, prop `showChevron`. |
| `IconButton` | `components/ui/IconButton.tsx` | ✅ alineado | Touch target 44pt, focus ring tokenizado. |
| `TextField` | `components/ui/TextField.tsx` | ✅ alineado | `rounded-md`, focus state correcto. |
| `Modal` | `components/ui/Modal.tsx` | ✅ alineado | Usa `animate-scale-in` y scrim correcto. |
| `Drawer` | `components/ui/Drawer.tsx` | ✅ alineado | Slide-in derecha, focus management OK. |
| `Tabs` | `components/ui/Tabs.tsx` | ✅ alineado | Underline minimal, no pills coloridos. |
| `Badge` | `components/ui/Badge.tsx` | ✅ alineado | Estados semánticos, 11px uppercase tracking-wide — ok para badges (no es body). |
| `Tooltip` | `components/ui/Tooltip.tsx` | ✅ alineado | |
| `EmptyState` | `components/ui/EmptyState.tsx` | ⚠️ revisar al migrar | Verificar que copy y CTA respeten 3.5. |
| `PageHeader` | `components/ui/PageHeader.tsx` | ⚠️ revisar al migrar | Posible heading Playfair que ahora debe ser sans. |
| `SectionHeading` | `components/ui/SectionHeading.tsx` | ⚠️ revisar al migrar | Idem. |
| `SectionNav` | `components/ui/SectionNav.tsx` | ✅ alineado | Anchor nav de Fase 10.4. |
| `Skeleton` | `components/ui/Skeleton.tsx` | ✅ alineado | Shimmer respeta dark mode. |
| `Stack` | `components/ui/Stack.tsx` | ✅ alineado | Layout helper neutral. |
| `CommandPalette` | `components/ui/CommandPalette.tsx` | ✅ alineado | Patrón Apple-style ya. |
| `MobileBottomNav` | `components/ui/MobileBottomNav.tsx` | ✅ alineado | Max 5 items, label+icon. |
| `ThemeToggle` | `components/ui/ThemeToggle.tsx` | ✅ alineado | Fase 10.5 dark mode. |

---

## 5. Reglas operativas para migrar un módulo

Orden de tareas al rediseñar una página/sección:

1. **Leer el módulo entero antes de tocar.** Identificar: headers, alerts, cards, listados, CTAs, modales abiertos desde la página.
2. **Mapear cada bloque a un patrón de §3.** Si un bloque no encaja en ninguno, parar y proponer un patrón nuevo en este MASTER antes de improvisar.
3. **Sustituir tipografía:** todo `font-serif italic` que no sea momento brand → `font-sans font-bold tracking-tight`. Todo heading >24px → revisar tracking negativo.
4. **Sustituir CTAs:** botones primarios destacados → pill (§3.5). Acciones internas en tablas/listados → mantienen `<Button size="xs">` legacy hasta resolver §6.
5. **Eliminar decoración:** blobs (`absolute -right-10 -top-10 rounded-full bg-*`), capas circulares, ornamentos italic Playfair como subtítulo, microlabels uppercase en cliente.
6. **Verificar dark mode:** contraste ≥4.5:1, dividers visibles, focus state distinto en ambos modos. No invertir colores — usar variantes tonal velum-800/900.
7. **Reducir densidad:** padding generoso en hero blocks (px-8 py-12 mínimo). Gap mínimo entre cards 24px.
8. **Probar en navegador:** 375px (mobile), 768px (tablet), 1280px (desktop). Reduced-motion ON. Dark mode ON.
9. **Migrar como commit aislado:** un módulo = un commit, mensaje `feat(ui): Fase 11.X — <Módulo> apple híbrido`.

---

## 6. Decisiones (resueltas en Fase 11.0 — 2026-04-29)

### 6.1. PillButton vs Button legacy ✅ resuelto: coexisten

Son dos primitives con propósitos distintos. **No se elimina ninguno.**

| Primitive | Cuándo |
|-----------|--------|
| `<PillButton>` | CTAs heroicos del cliente (Dashboard, Memberships, Agenda, CustomCharge) y alertas accionables admin (cobro vencido grande, paciente en riesgo). Lenguaje **emocional**. |
| `<Button>` | Acciones internas: filas de tabla, forms, drawers admin, settings. Lenguaje **funcional** — uppercase tracking-widest sigue siendo correcto para densidad. |

**Regla operacional:** si el botón vive dentro de un hero block (rounded-3xl) o sobre `bg-velum-900`, es `PillButton`. Si vive dentro de una `<Card>` densa, una tabla, un form o un drawer admin, es `Button`.

### 6.2. CardTitle Playfair ✅ resuelto: default sans, brand opt-in

`CardTitle` ahora default es sans bold tracking-tight. Para momentos brand puntuales (nombre del paciente, nombre del plan en una tarjeta editorial) usar `<CardTitleBrand>` exportado del mismo módulo.

```tsx
import { Card, CardTitle, CardTitleBrand } from '@/components/ui';

// Caso común — 95%+ de Cards
<Card><CardTitle>Mediciones recientes</CardTitle></Card>

// Caso brand puntual
<Card><CardTitleBrand>Plan Renacer</CardTitleBrand></Card>
```

### 6.3. Microlabels uppercase ✅ resuelto: solo admin, cero cliente

| Contexto | Regla |
|----------|-------|
| **Cliente** (Dashboard, Agenda, Memberships, CustomCharge, Onboarding) | **Cero microlabels uppercase.** Reemplazar todo `text-[10-11px] font-bold uppercase tracking-[0.18em]` por `text-[13px] font-semibold text-velum-500`. |
| **Admin** (KPIs, columnas tabla, kickers de sección densa) | **Se conservan.** Es convención industry-standard en dashboards densos (Linear, Stripe, Vercel, Apple App Store Connect). Funcionalmente más legible cuando hay muchas etiquetas pequeñas juntas. |

**Razón:** el cliente vive en lenguaje emocional/de respiración. El admin vive en lenguaje funcional/de densidad. Son dos lenguajes hermanos del mismo sistema.

### 6.4. Densidad admin vs cliente ⚪ pendiente (decidir en Fase 11.5)

`DensityContext` con modo `compact` solo aplica al admin. **Decisión:** se toma cuando se rediseñe el primer módulo admin con KPIs (sugerencia: `AdminKPIsSection`). Por ahora, el piloto Apple sólo se ha aplicado en `comfortable`.

---

## 7. Anti-patrones (lista negra)

Cosas que NO deben aparecer en módulos migrados:

- ❌ Emojis como iconos de UI (📅 🔔 💳). Usar Lucide.
- ❌ `font-serif italic` como heading regular (sólo momentos brand singulares).
- ❌ Blobs decorativos (`absolute -right-10 -top-10 rounded-full bg-velum-800/40`).
- ❌ Más de un weight de uppercase en una página (uppercase es una excepción, no un patrón).
- ❌ Headings con `text-2xl` sin tracking negativo (se ven gordos).
- ❌ Stats con sufijos decorativos (`/12`, `/100`) salvo cuando el denominador es un dato real útil.
- ❌ Hover-only para acciones críticas en mobile.
- ❌ Animar `width`/`height` o `top/left` (usar `transform`).
- ❌ Sombras pesadas (`shadow-2xl`) en cards de listado.
- ❌ Colores ad-hoc (`bg-emerald-50`, `text-amber-600`) sin pasar por tokens semánticos.
- ❌ Más de 4 radios distintos en una página.
- ❌ Múltiples CTAs primarios compitiendo en la misma sección.
- ❌ Microlabels uppercase tracking-widest en pantallas de cliente (admin OK, ver §6.3).

---

## 8. Cómo extender este MASTER

- **Nueva regla global:** edita este archivo y añade a la sección correspondiente.
- **Override por página:** crea `design-system/pages/<ruta>.md` (e.g. `dashboard.md`, `agenda.md`). Ese archivo solo contiene desviaciones del MASTER, no toda la guía. Al construir esa página, leer primero el override.
- **Nuevo patrón de UI no listado:** propónlo en §3 con un ejemplo de uso real, justifica por qué los patrones existentes no bastan.
- **Cambio de tokens:** se hace en `design/tokens.ts` y se actualiza la tabla de §2 aquí. Tailwind y CSS vars se regeneran solos.

---

**Estado de adopción (2026-04-29):**

| Módulo | Estado |
|--------|--------|
| `Dashboard.tsx` (cliente) | 🟢 Piloto vivo (3 bloques: hero, próxima cita, stats trio). Resto de la página todavía con membership card legacy y otros bloques pre-piloto. |
| `Agenda.tsx` | ⚪ pendiente |
| `Memberships.tsx` | ⚪ pendiente |
| `CustomChargePage.tsx` | ⚪ pendiente |
| `OnboardingAdmin.tsx` | ⚪ pendiente |
| `Admin.tsx` (shell) | 🟡 Fases 10.3-10.5 (DataTable, jerarquía, dark mode) — base lista, falta lenguaje Apple en heros. |
| `AdminKPIsSection.tsx` | ⚪ pendiente |
| `AdminFinanzasSection.tsx` | 🟡 DataTable migrado (10.3), falta hero/stats. |
| `AdminPagosSection.tsx` | 🟡 DataTable migrado. |
| `AdminExpedientesSection.tsx` | ⚪ pendiente |
| `AdminCumplimientoSection.tsx` | ⚪ pendiente |
| `AdminRiesgosSection.tsx` | ⚪ pendiente |
| `AdminSociasSection.tsx` | ⚪ pendiente |
| `AdminUsersPermissions.tsx` | ⚪ pendiente |
| Settings (Stripe / WhatsApp / Agenda) | ⚪ pendiente |
