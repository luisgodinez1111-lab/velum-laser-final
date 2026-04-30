/**
 * Analytics wrapper — Fase A.1
 *
 * Encapsula window.umami para evitar:
 *   - typos en nombres de eventos
 *   - acoplamiento directo con Umami (mañana podemos cambiar de provider sin
 *     tocar los componentes)
 *   - bugs cuando window.umami no está disponible (script bloqueado, error
 *     de red, paciente con AdBlock, fase de desarrollo local)
 *
 * Política de privacidad:
 *   - NUNCA enviar PII al tracker (email, nombre, teléfono, IDs personales)
 *   - Solo enviar IDs anónimos (sessionId, treatmentType, etc.) y eventos
 *     de UX (tabs, clicks, errores)
 *   - Umami self-hosted vive en TU servidor, sin Google
 */

// Catálogo cerrado de eventos. Si quieres agregar uno, edita este type primero.
// Esto previene que devs futuros (o yo) inventen nombres ad-hoc.
export type AnalyticsEvent =
  // Dashboard navegación
  | "dashboard_tab_change"
  // Sesión feedback (tarea reina #3 del rediseño)
  | "feedback_chip_select"
  | "feedback_submit"
  | "feedback_response_view"
  // Agendar cita (tarea reina #1)
  | "agenda_intro_choose"     // intro: login vs register
  | "agenda_slot_select"      // calendar: slot tiempo elegido
  | "agenda_book_attempt"     // pre-checkout
  | "agenda_book_success"     // payment redirect ok
  // Pagos (tarea reina #2)
  | "payment_portal_open"     // click "Ir al portal" en billing
  | "custom_charge_authorize" // OTP verificado en CustomChargePage
  // Memberships (upsell)
  | "membership_plan_select"
  | "membership_checkout_click"
  | "membership_zone_toggle"
  // Errores notables (no spam — solo categorías mayores)
  | "error_payment"
  | "error_intake_blocked";

/**
 * Datos opcionales del evento. Solo valores anónimos / categóricos.
 * Si necesitas pasar PII, NO lo hagas — agrega el dato al backend audit log.
 */
export type AnalyticsData = Record<string, string | number | boolean | undefined>;

declare global {
  interface Window {
    umami?: {
      track: (event: string, data?: AnalyticsData) => void;
    };
  }
}

/**
 * Reporta un evento. Si Umami no está cargado (script bloqueado, dev local,
 * primer setup sin website-id), falla silenciosamente.
 *
 * Ejemplo:
 *   track("dashboard_tab_change", { from: "overview", to: "citas" });
 *   track("feedback_submit", { severity: "mild", chipsCount: 2 });
 */
export const track = (event: AnalyticsEvent, data?: AnalyticsData): void => {
  // Filtra valores undefined antes de enviar para no contaminar la data.
  let cleanData: AnalyticsData | undefined;
  if (data) {
    cleanData = {};
    for (const [k, v] of Object.entries(data)) {
      if (v !== undefined) cleanData[k] = v;
    }
    if (Object.keys(cleanData).length === 0) cleanData = undefined;
  }

  try {
    if (typeof window !== "undefined" && window.umami) {
      window.umami.track(event, cleanData);
    }
  } catch {
    // Umami down / script bloqueado / etc. — never throw.
  }
};
