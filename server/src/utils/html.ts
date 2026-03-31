/**
 * html.ts — Utilidades de escape para prevenir XSS en templates HTML (emails, notificaciones).
 *
 * Centraliza la función que estaba duplicada en emailService, notificationService.
 * No usar para escape CSV — usar csvEscape() en su lugar.
 */

/**
 * Escapa caracteres especiales HTML para prevenir inyección XSS.
 * Acepta cualquier valor y lo convierte a string seguro.
 */
export const escapeHtml = (value: string | unknown | null | undefined): string =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
