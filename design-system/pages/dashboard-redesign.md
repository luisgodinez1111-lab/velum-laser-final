# Dashboard del paciente — Rediseño UX/UI

> **Fase:** 12.0 (rediseño estructural, NO skin pass)
> **Brief origen:** "complicado y confuso · agendar / pagos / notas son tareas reina · todas las tablas necesarias · objetivos: retención, cancelaciones, upgrade, soporte"
> **Restricción:** cero funcionalidad eliminada. Solo reorganización + reducción de fricción.
> **Sistema visual:** Apple híbrido ya consolidado (no se toca). Este doc es information architecture + interaction design.

---

## 1. Diagnóstico del estado actual

| Tab | Función actual | Frecuencia probable | Puntos de fricción |
|-----|---------------|---------------------|---------------------|
| `overview` | Hero personal · próxima cita · stats trio · membership card · onboarding stepper · quick actions | **🔴 muy alta** (entrada por defecto) | Buen contenido pero **no resuelve las 3 tareas reina con 1 tap**. La "próxima cita" se muestra pero no hay CTA "Agendar la siguiente" prominente cuando no hay próxima. Stats decorativos. |
| `citas` | Próximas + historial de citas con AppointmentCard (cancelar/reprogramar) | 🟢 alta | Agendar nueva = ir a `/agenda` (otra ruta entera). Botón "+ Nueva" lleva a un flujo de 8 vistas. Demasiado pesado para "agendar la siguiente sesión rutinaria". |
| `profile` | Form de datos personales | 🟡 baja | OK. Acción rara, 1-2 veces al año. |
| `security` | Cambio de contraseña con OTP WhatsApp | 🔴 muy baja | OK pero ocupa un tab top-level que no merece esa jerarquía. |
| `records` | Expediente médico + documentos firmar | 🟡 media | OK. La acción "Firmar documento" es importante pero ocasional. |
| `historial` | Cuidados pre · timeline sesiones · feedback por sesión | 🟢 alta | **AQUÍ vive la "tarea reina #3"** (dejar nota/reacción) pero **enterrada a 5 clicks**: tab → expandir card sesión → scroll bajo de params → "+ Dejar comentario" → escribir → guardar. **Anti-patrón grave.** |
| `billing` | Failed alert · próximo cargo · portal Stripe · historial pagos | 🟢 alta | "Tarea reina #2" (pagos) está bien, pero la info "próximo cargo" debería estar en overview, no en sub-tab. |
| `ayuda` | FAQ · contacto · cuidados pre/post | 🟡 baja | Buena para soporte, frecuencia baja. |

**Diagnóstico de negocio:**

- ❌ **Ninguna de las 3 tareas reina (agendar, pagar, notar) se resuelve desde overview con 1 tap.**
- ❌ **El feedback clínico post-sesión está enterrado** — ataca directamente "reducir tickets de soporte" (paciente que no encuentra dónde reportar reacción → llama por WhatsApp).
- ❌ **`security` ocupa jerarquía top-level** que no merece (uso ~1 vez/año).
- ❌ **No hay storytelling de upgrade**: el banner "Plan pre-seleccionado" aparece solo si hay un plan en localStorage, pero el paciente sin membresía o con plan básico nunca ve "estos beneficios desbloquearías con plan superior".
- ⚠️ **Stats trio son decorativos**: muestran "sesiones completadas / documentos / membresía" — datos correctos pero **no accionables**. Sería mejor reemplazar 1-2 con quick actions o métricas de progreso significativas.

---

## 2. Flujos críticos: estado actual vs propuesto

### 2.1. Agendar próxima cita (tarea reina #1)

**Estado actual** (~6-8 acciones):
1. Login → Dashboard (overview) — paciente ve "Próxima cita: Sin sesiones agendadas" + CTA "Agendar sesión"
2. Click → navegación a `/agenda` (sale del Dashboard)
3. Si no tiene expediente: forzado al wizard intake (4 pasos)
4. Si tiene expediente: vista calendar
5. Selecciona mes → día
6. Espera carga de slots
7. Selecciona slot
8. Click "Confirmar y pagar $XXX" → redirect Stripe

**Estado propuesto** (~3 acciones para paciente recurrente):
1. Login → Dashboard rediseñado — paciente ve **AgendaQuickBook card prominente** con próximos 3 días disponibles.
2. Click un slot directamente desde overview (datepicker compacto inline)
3. Confirmación inline + redirect Stripe

**Justificación del impacto:**
- **Reducir cancelaciones:** un paciente que tarda 8 acciones en agendar tiende a postergar y cancelar. 3 acciones = más probabilidad de mantener cadencia mensual.
- **Reducir tickets:** "no sé cómo agendar" disminuye si la primera vista del Dashboard tiene calendario inline.
- **Caso edge:** primera vez (sin expediente) sigue forzando al wizard `/agenda` — eso queda igual porque es legalmente necesario (consentimiento informado, NOM-004).

### 2.2. Ver / autorizar pagos (tarea reina #2)

**Estado actual** (~4 acciones para autorizar cobro adicional):
1. Recibe email con link `/charge/:id`
2. Abre link → CustomChargePage
3. Recibe OTP en email
4. Ingresa OTP → Stripe checkout

**Para ver historial actual:** Dashboard → tab `billing` → scroll → ver lista. **Para próximo cargo:** mismo path. Suma 3 acciones.

**Estado propuesto:**
- Mantener flujo de cobros adicionales por link (es seguro, NOM-151).
- En overview agregar **PaymentSummary card** que muestre: próximo cargo · fecha · estado de método de pago. Si hay un cargo `past_due` o `pending`, **se promueve a hero block oscuro tipo "alerta accionable"** (patrón MASTER §3.2).
- Tab `billing` se mantiene pero ahora es **detalle profundo**, no entrada.

**Justificación:**
- **Reducir cancelaciones:** un cargo `past_due` que el paciente no ve puede provocar cancel automático Stripe a las 4 fallas. Si lo ve hero al login → más probabilidad de actualizar tarjeta.
- **Reducir tickets:** "¿cuándo es mi próximo cargo?" baja al ser visible en overview.

### 2.3. Dejar nota/reacción de sesión (tarea reina #3 — la más rota)

**Estado actual** (~5-6 acciones):
1. Tab `historial`
2. Localizar sesión en timeline
3. Click para expandir card
4. Scroll abajo de los parámetros laser
5. Click "+ Dejar comentario"
6. Escribir
7. Guardar

**Estado propuesto** (~1-2 acciones, contextual):
- **Después de cada sesión completada**, en el overview aparece automáticamente una **SessionFeedbackPrompt card** con kicker "Tu última sesión · hace 2 días", textarea inline, CTA pill "Compartir reacción". Visible por 7 días post-sesión, después se va al historial.
- Si hay reacciones adversas comunes (ardor, ronchas, sensibilidad), **chips de uno-tap** + opcional textarea para detalle.
- Esto es **el cambio más alto-leverage del rediseño.**

**Justificación:**
- **Reducir tickets:** si un paciente tiene reacción adversa y reporta en 1 tap desde Dashboard, no llama por WhatsApp.
- **Reducir cancelaciones:** un paciente que SIENTE que el equipo escucha (recibe acuse de recibo + comentario clínico de respuesta) está más enganchado.
- **Datos clínicos:** la clínica obtiene feedback estructurado mucho más rico (chips → análisis cuantitativo posible).

---

## 3. Information architecture propuesta

### Reorganización de los 7 tabs

| Tab actual | Cambio propuesto | Razón |
|------------|------------------|-------|
| `overview` | 🟢 Se mantiene como entrada principal, **rediseñado** | Sigue siendo el destino del login |
| `citas` | 🟢 Se mantiene | Acción frecuente con detalle propio |
| `profile` | 🔄 **Se fusiona con `security` en un solo tab `cuenta`** | Ambos son rara vez usados, juntos hacen sentido (es "tu cuenta") |
| `security` | 🔄 **Se mueve dentro de `cuenta`** | Eliminar tab top-level que se usa 1×/año |
| `records` | 🟢 Se mantiene como `expediente` | Renombrar para claridad — "records" es jerga inglesa |
| `historial` | 🔄 **Se RENAMBRA a `sesiones`** y se rediseña | "Historial" suena pasado/archivo. "Sesiones" es lo que es realmente. |
| `billing` | 🔄 **Se RENAMBRA a `pagos`** | Inglés→español, paridad con la palabra que el usuario usa al describir tarea reina |
| `ayuda` | 🟢 Se mantiene | Importante para soporte |

**De 8 tabs (overview + 7) → 7 tabs (overview + 6):** `[Inicio · Citas · Sesiones · Pagos · Expediente · Cuenta · Ayuda]`

**Mobile bottom nav:** 5 max según MASTER §9 = `[Inicio · Citas · Sesiones · Pagos · Más]`. El "Más" sheet contiene `[Expediente · Cuenta · Ayuda]`.

### Nuevos quick actions desde overview

Reemplazo del "stats trio decorativo" actual por **3 quick actions accionables**:

| Slot | Tarjeta | Por qué |
|------|---------|---------|
| 1 | **Agendar siguiente** (datepicker inline + slots día siguiente) | Tarea reina #1 con 1 tap |
| 2 | **Próximo cargo** (monto · fecha · estado) | Tarea reina #2 visible siempre |
| 3 | **Mi progreso** (X/12 sesiones con barra visual + storytelling "te faltan 4 para libertad total de Zona III") | Reemplaza stat decorativo + storytelling de upgrade |

---

## 4. Wireframe del overview rediseñado

```
┌────────────────────────────────────────────────────────┐
│  [Saludo 13px]                                         │  ← se queda igual
│  Sofía.                                                │
│  [88px Playfair — momento brand]                       │
│  jueves 30 de mayo de 2026                             │
└────────────────────────────────────────────────────────┘

┌─ ALERTAS PRIORITARIAS (solo si aplica) ────────────────┐
│  🔴 hero oscuro velum-900 con CTA pill                 │
│  Casos: cargo past_due · expediente rejected ·         │
│         doc por firmar · reacción de última sesión     │
│         no reportada (>2h, <7d)                        │
└────────────────────────────────────────────────────────┘

┌─ REACCIÓN DE SESIÓN (solo si <7d post-sesión) ─────────┐
│  Tu última sesión · hace 2 días · Zona III             │
│                                                        │
│  ¿Cómo ha ido tu piel? (selecciona los que apliquen)  │
│  [○ Todo bien] [○ Ardor] [○ Ronchas] [○ Sensibilidad] │
│  [○ Cambio de color] [○ Algo más...]                  │
│                                                        │
│  [textarea opcional]                                   │
│  [PillButton primary] Compartir reacción              │
└────────────────────────────────────────────────────────┘

┌─ PRÓXIMA CITA (existente, queda casi igual) ───────────┐
│  Próxima sesión                                        │
│  Mié 12 jun · 16:30  (sans bold 80px)                 │
│  Bikini · en 13 días                                   │
│  [PillButton outlineDark] Ver todas las citas →        │
└────────────────────────────────────────────────────────┘

   ó (cuando NO hay próxima cita)

┌─ AGENDAR SIGUIENTE (NUEVO — quickbook inline) ─────────┐
│  Sin próxima sesión                                    │
│  Reserva ahora — slots disponibles                    │
│                                                        │
│  Mañana          Pasado            Lun 16             │
│  ──────────      ──────────        ──────────         │
│  10:00 AM        09:00 AM          11:30 AM           │
│  11:30 AM        10:30 AM          14:00 PM           │
│  16:00 PM        16:00 PM          16:30 PM           │
│  [Ver más fechas →]                                   │
└────────────────────────────────────────────────────────┘

┌─ TRIO QUICK ACTIONS (NUEVO — reemplaza stats trio) ────┐
│  ┌──────────────┬──────────────┬──────────────┐        │
│  │ Próximo cargo│  Mi progreso │  Membresía   │        │
│  │ $1,499 MXN   │  ████░░░░ 8/12│  Identidad   │        │
│  │ 15 jun       │  4 más para  │  Renueva     │        │
│  │ ✓ tarjeta OK │  Zona III    │  15 jun      │        │
│  │              │  completa    │              │        │
│  │ Ver pagos →  │  Mi historial│  Mejorar →   │        │
│  └──────────────┴──────────────┴──────────────┘        │
└────────────────────────────────────────────────────────┘

┌─ MEMBERSHIP CARD (existente, queda) ───────────────────┐
│  Plan activo · Identidad                               │
│  $1,499/mes                                            │
│  ───────────────────────────────                       │
│  Sesiones (8) · Próxima (12 jun) · Renueva (15 jun)   │
└────────────────────────────────────────────────────────┘

┌─ ONBOARDING STEPPER (solo si !onboardingComplete) ─────┐
│  Tu progreso                                           │
│  ●─●─●─○ Casi listo. Falta: agendar primera cita     │
│  [Ir →]                                                │
└────────────────────────────────────────────────────────┘
```

**Cambios clave:**
1. **AGREGAR:** SessionFeedbackPrompt card (la pieza más alta-leverage)
2. **AGREGAR:** AgendaQuickBook inline cuando no hay próxima cita (vs. CTA actual que lleva a `/agenda`)
3. **REEMPLAZAR:** Stats trio decorativo → trio de quick actions accionables (Pagos / Progreso / Membresía)
4. **CONSOLIDAR:** Alertas dispersas → un único bloque "ALERTAS PRIORITARIAS" priorizado por urgencia

---

## 5. Patrones nuevos a introducir

### 5.1. `<SessionFeedbackPrompt>` — pieza nueva

```tsx
<SessionFeedbackPrompt
  session={lastCompletedSession}
  daysAgo={2}
  onSubmit={(reactions, note) => ...}
/>
```

- Visible cuando hay sesión completada en últimos 7 días Y no se ha enviado feedback.
- Chips multi-select: ardor, ronchas, sensibilidad, cambio color, hiperpigmentación, "todo bien".
- Textarea opcional para detalle.
- CTA pill primary "Compartir reacción".
- Después de enviar → muta a estado "Recibido. Tu equipo clínico revisará." con icon Check.
- Auto-dismiss a los 7 días post-sesión (cae al historial).

### 5.2. `<AgendaQuickBook>` — pieza nueva

```tsx
<AgendaQuickBook
  upcomingSlots={next7DaysSlots}
  onSelectSlot={(date, slot) => /* navega a /agenda con preselección */}
/>
```

- Muestra próximos 3 días disponibles en columnas.
- Cada slot es un chip clickeable.
- Click → navega a `/agenda` con `?date=YYYY-MM-DD&slot=HH:MM` preseleccionado, saltando datepicker.
- Para paciente recurrente esto reduce 8 → 3 acciones.
- "Ver más fechas →" enlaza al calendario completo.

### 5.3. `<PaymentStatusCard>` — pieza nueva

Reemplaza el slot 1 del trio de quick actions:
- Si hay próximo cargo OK: muestra monto · fecha · ✓ tarjeta válida
- Si hay `past_due`: dot rojo pulsante + CTA "Actualizar método"
- Si hay cargo pendiente OTP: kicker "Tienes un cobro pendiente de autorizar" + link al CustomChargePage

### 5.4. `<ProgressJourney>` — reemplaza stat decorativo

```
8/12 sesiones · ████░░░░ 67%
"Te faltan 4 para liberar Zona III completa"
[barra de progreso por zona maestra]
[Ver historial →]
```

- Storytelling: el número "8/12" no significa nada. "Te faltan 4 para liberar Zona III" sí.
- Aprovecha estructura de zonas VELUM (4 zonas maestras del producto) para narrar progreso.
- **Storytelling de upgrade:** si está en Plan Identidad (1 zona) y ya completó 80%, microcopy: "¿Te animarías a explorar Zona II? Plan Presencia +$XXX/mes" → CTA upgrade.

### 5.5. Patrón `<UpgradeWhisper>` — storytelling contextual

Apariciones sutiles, NO banners agresivos:
- Al completar 80% de las sesiones del plan actual: "¿Lista para más zonas? Conoce Plan Presencia"
- En la session feedback: "Si te interesa tratar otras zonas, aquí están tus opciones"
- En el progress card: bar muestra qué zonas están "bloqueadas" en plan actual con CTA "Desbloquear con upgrade"

---

## 6. Storytelling de upgrade a planes

**Problema actual:** los planes están en `/memberships` (página separada). El paciente que ya tiene plan rara vez la visita. Resultado: bajo upgrade rate.

**Estrategia propuesta:**

1. **Mostrar lo que SÍ tiene en su plan** (con orgullo):
   - "Plan Identidad activo · cubre Zona I (Rostro)"
   - Visual de zonas con la suya iluminada, las otras en gris.
2. **Whispers contextuales** (§5.5) en momentos relevantes:
   - Al completar sesiones del plan actual
   - Al dejar feedback positivo
   - Al ver su progreso 80%+
3. **NUNCA** banner pop-up tipo Black Friday. NO bombardear.

**Métrica:** si en 90 días post-deploy el upgrade rate sube ≥15%, funciona.

---

## 7. Plan de implementación

### Fase 12.0 — Information Architecture (1 commit, ~30 min)
- Renombrar tabs (`historial`→`sesiones`, `billing`→`pagos`, `records`→`expediente`)
- Fusionar `profile` + `security` en `cuenta`
- Reordenar tabKeys array y allTabs
- Verificar bottom nav móvil (5 items max)
- **Riesgo:** bajo. Solo strings y reorganización.

### Fase 12.1 — `SessionFeedbackPrompt` component (1 commit, ~45 min)
- Crear `components/SessionFeedbackPrompt.tsx`
- Lógica: si hay sesión completada <7d sin feedback → render
- Chips multi-select + textarea + submit
- Reusa `clinicalService.submitSessionFeedback` existente (ya hay endpoint)
- Insertar en overview entre alertas y "próxima cita"
- **Riesgo:** medio. Pieza nueva, hay que validar UX en mobile.

### Fase 12.2 — `AgendaQuickBook` component (1 commit, ~60 min)
- Crear `components/AgendaQuickBook.tsx`
- Fetch próximos 3 días con slots disponibles (reusa endpoint existente)
- Render chips de slots por día
- Click → navega a `/agenda?date=X&slot=Y`
- Modificar `/agenda` para preselect desde query params
- **Riesgo:** medio-alto. Toca lógica de slots y navegación.

### Fase 12.3 — Quick Actions Trio rediseñado (1 commit, ~45 min)
- Crear `components/PaymentStatusCard.tsx`
- Crear `components/ProgressJourney.tsx`
- Reemplazar stats trio actual con los 3 nuevos
- Mantener `MembershipMicroCard` (slot 3, casi igual al actual)
- **Riesgo:** medio. Reemplazo visible, requiere testing visual.

### Fase 12.4 — UpgradeWhisper system (1 commit, ~45 min)
- Crear `components/UpgradeWhisper.tsx`
- Lógica de detección de momentos: 80% sesiones · feedback positivo · progress milestone
- Microcopy contextual + link a `/memberships?focus=Plan-X`
- **Riesgo:** bajo. Adicción incremental.

### Fase 12.5 — Cleanup overview (1 commit, ~30 min)
- Eliminar stats trio viejo
- Reorganizar orden de bloques según wireframe §4
- Pulir transiciones entre bloques
- Update CHECKLIST con nuevas reglas
- **Riesgo:** bajo (cosmético).

**Total estimado:** 6 commits, ~4.5 horas. Cada fase aislada y revertible.

---

## 8. Trade-offs y decisiones pendientes

### 8.1. ¿AgendaQuickBook fetch automático en overview = costo backend?

- **Opción A:** fetch slots automático al abrir Dashboard (UX óptima, paciente ve slots inmediato).
- **Opción B:** lazy load — slots solo se piden cuando el paciente clickea "Ver disponibilidad".
- **Recomendación:** B en mobile (ahorra data), A en desktop. Si el endpoint de slots es caro (involucra Google Calendar sync), B siempre.
- **Decisión pendiente:** ¿el endpoint actual de slots es caro? ¿hay caché en Redis?

### 8.2. SessionFeedbackPrompt: chips genéricos vs específicos por tratamiento

- **Opción A:** chips genéricos (ardor, ronchas, sensibilidad, etc.) — fácil de implementar, datos mediocres.
- **Opción B:** chips por treatment/zona (depilación rostro vs piernas tienen reacciones distintas) — datos clínicos ricos, complejidad alta.
- **Recomendación:** A en Fase 12.1, evolucionar a B en Fase 13 si el equipo clínico lo pide.
- **Riesgo de NO B:** datos clínicos genéricos pueden no ser útiles para detectar patrones reales.

### 8.3. UpgradeWhisper: ¿se ve como ad o como recomendación?

- **Opción A:** estilo "ad" pequeño con CTA fuerte → conversión potencialmente más alta, riesgo de molestar.
- **Opción B:** estilo "recomendación clínica suave" tipo "según tu progreso, podrías considerar..." → más respetuoso, conversión menor.
- **Recomendación:** B siempre. La marca VELUM es luxury/clínica, no e-commerce. Whisper, no shout.
- **Métrica de validación:** track click-through rate del whisper. Si <2%, está demasiado escondido. Si >15% pero el upgrade no sube, está siendo agresivo y la gente clickea por curiosidad sin convertir.

### 8.4. ¿Eliminar el `security` tab o solo fusionarlo?

- **Opción A:** eliminar tab top-level, mover dentro de `cuenta` como sección expandible.
- **Opción B:** mantener pero reducir prominencia.
- **Recomendación:** A. La paciente cambia password 1×/año. No merece tab principal.
- **Riesgo:** pacientes habituales que llegaban directo a `security` van a estar perdidos por unas semanas. Aceptable porque el cambio es lógico.

### 8.5. ¿Onboarding stepper se queda dónde está?

- Actualmente está al final del overview, después del membership card.
- Es importante para pacientes nuevos pero ruido para pacientes establecidos.
- **Recomendación:** moverlo a la parte superior (después de alertas) cuando `!onboardingComplete`, hacer collapse-default.

---

## 9. Métricas de éxito

Si tienes analytics (Mixpanel, Amplitude, GA4, server logs), trackear:

| Métrica | Baseline (estimar de logs últimos 30 días) | Objetivo post-deploy 30 días |
|---------|--------------------------------------------|------------------------------|
| **Time-to-book** (login → cita confirmada) | ~3-4 min | <90 segundos |
| **Session feedback submission rate** | <5% (hipótesis) | >40% |
| **Tickets soporte categoría "no encuentro X"** | (medir actual) | -50% |
| **Cancellation rate mensual** | (medir actual) | -20% |
| **Upgrade plan rate (90 días)** | (medir actual) | +15% |
| **Mobile Dashboard bounce rate** | (medir actual) | -25% |

**Si no tienes analytics:** agregar mínimo `posthog` o `plausible` ANTES del deploy de Fase 12. Sin datos, esto es voluntad pura.

---

## 10. Lo que conscientemente NO cambio

1. **Hero personal con nombre Playfair** — momento brand, intocable.
2. **Lógica de Stripe checkout** y custom charges — funcional y NOM-151 compliant.
3. **Wizard intake en `/agenda`** — legalmente necesario (consentimiento informado, NOM-004).
4. **Estructura de los 4 tabs `cuenta`/`expediente`/`sesiones`/`pagos`** — solo renombramos y consolidamos `profile`+`security`. La funcionalidad interior queda igual.
5. **Sistema de tokens Apple híbrido** (Fases 11.0-11.11) — todo se respeta.
6. **Bottom nav móvil 5 items max** — regla MASTER §9.
7. **Membership card** — se queda casi igual, solo se ubica un slot abajo.
8. **Toast notifications system** — funcional.
9. **Dark mode** — el rediseño debe respetarlo (no introducir nada que no soporte dark).
10. **Auth flow + JWT cookie** — intocable.

---

## Resumen ejecutivo

Las **3 decisiones más altas-leverage**:

1. **`SessionFeedbackPrompt` en overview** — convierte una tarea de 5 clicks en 1-2. Ataca directamente "reducir tickets de soporte" (paciente que reporta reacción no llama por WhatsApp). **Esta sola feature justifica el rediseño.**
2. **`AgendaQuickBook` inline** — el paciente recurrente puede agendar en 3 acciones desde overview vs 8 actuales. Ataca "reducir cancelaciones" (menos fricción = más adherencia a cadencia mensual).
3. **Quick Actions trio accionable** + **UpgradeWhisper system** — reemplaza decoración por valor. Storytelling sutil de upgrade en momentos relevantes (no banner agresivo).

Los **2 trade-offs más relevantes**:
- **AgendaQuickBook:** auto-fetch en overview vs lazy load. Decisión depende del costo del endpoint.
- **SessionFeedback chips:** genéricos (rápido) vs específicos por tratamiento (datos ricos pero complejo). Recomiendo iterar.

**Estimación:** 6 commits, ~4.5 horas, todo aislado y revertible.

**Veredicto honesto:** este rediseño tiene potencial real de mover los KPIs declarados, **siempre y cuando se mida**. Si no hay analytics, la decisión de "funcionó o no" será subjetiva. La feature de mayor leverage (SessionFeedbackPrompt) ataca un anti-patrón documentable que reduce tickets de soporte de forma medible. Las otras features son mejoras valiosas pero menos transformadoras.

**El skin pass que hicimos antes (Fases 11.x) era condición necesaria pero no suficiente.** Con el sistema visual ya consolidado, AHORA tiene sentido invertir en estructura. No al revés.
