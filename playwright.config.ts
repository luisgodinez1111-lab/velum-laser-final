import { defineConfig, devices } from "@playwright/test";

/**
 * E2E con Playwright. Enfoque: flujos de frontend con el backend MOCKEADO
 * (page.route) — hermético, rápido, sin tocar DB/Stripe reales. Atrapa la clase
 * de bugs de flujo que los unit tests no ven (p.ej. el crash #310 de pantalla
 * blanca al autenticarse como admin, o el login mostrando "credenciales
 * incorrectas" ante un error de servidor en cold start).
 *
 * Una capa E2E full-stack (contra un backend de prueba con DB) queda como
 * siguiente iteración.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
  // Levanta el dev server de Vite. Como el backend va mockeado por page.route,
  // no hace falta el API real ni la DB.
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
