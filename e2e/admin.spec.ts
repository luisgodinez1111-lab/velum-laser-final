import { test, expect, type Page } from "@playwright/test";

const ADMIN_URL = "/#/admin";

const ADMIN_USER = {
  id: "admin-1",
  email: "admin@velum.test",
  role: "admin",
  profile: { firstName: "Admin", lastName: "Test", phone: null, birthDate: null },
  mustChangePassword: false,
  tenantId: "default",
  clinicId: "default",
};

/**
 * Mock stateful del backend para el flujo admin: sin sesión antes de login
 * (401), usuario admin después. Solo /admin/users necesita shape válida (el
 * resto de cargas del panel tienen fallback).
 */
async function mockAdminBackend(page: Page) {
  const state = { loggedIn: false };
  // Catch-all: {} (las cargas del panel con .catch() lo toleran).
  await page.route("**/api/**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: "{}" }));
  // /admin/users: memberService.getAll no tiene catch → array vacío válido.
  await page.route("**/api/admin/users**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: "[]" }));
  // Probe de sesión: 401 hasta que el login marca la sesión.
  await page.route(/\/api\/(users\/me|me)(\?|$)/, (route) =>
    route.fulfill(
      state.loggedIn
        ? { status: 200, contentType: "application/json", body: JSON.stringify(ADMIN_USER) }
        : { status: 401, contentType: "application/json", body: "{}" },
    ));
  await page.route("**/api/auth/refresh", (route) =>
    route.fulfill({ status: 401, contentType: "application/json", body: "{}" }));
  await page.route("**/api/auth/login", (route) => {
    state.loggedIn = true;
    route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
  });
}

test("admin: login → el panel renderiza sin pantalla blanca (regresión #310)", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (e) => pageErrors.push(e.message));

  await mockAdminBackend(page);
  await page.goto(ADMIN_URL);

  // Antes de login: pantalla de acceso administrativo.
  await expect(page.getByRole("heading", { name: /acceso administrativo/i })).toBeVisible();

  await page.locator('input[type="email"]').first().fill("admin@velum.test");
  await page.locator('input[type="password"]').first().fill("Password1234!");
  await page.getByRole("button", { name: /acceder al panel/i }).click();

  // Tras autenticar: el login desaparece y el PANEL renderiza. Si el bug #310
  // (hook tras early return) regresa, el render del admin autenticado crashea y
  // la app queda en blanco → estas aserciones fallan.
  await expect(page.getByRole("heading", { name: /acceso administrativo/i })).toBeHidden();
  // Prueba POSITIVA de que el panel renderizó (no pantalla blanca): el nombre y
  // rol del admin autenticado aparecen en la cabecera del panel.
  await expect(page.getByText("Admin Test").first()).toBeVisible();
  await expect(page.getByText(/administrador general/i).first()).toBeVisible();

  // No debe haber excepciones no capturadas (un #310 lanzaría fuera del boundary).
  expect(pageErrors).toEqual([]);
});
