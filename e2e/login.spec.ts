import { test, expect, type Page } from "@playwright/test";

const LOGIN_URL = "/#/agenda?mode=login";

/**
 * Mockea el backend a nivel de red. Catch-all devuelve 200 {} para que la app
 * cargue sin API real; los tests sobreescriben endpoints específicos.
 */
async function mockBackend(page: Page) {
  await page.route("**/api/**", (route) => {
    const url = route.request().url();
    // Sin sesión: el probe de sesión (/api/users/me, /api/me) y el refresh
    // devuelven 401 → la app se muestra como NO autenticada y renderiza el
    // login. (Con 200 {} la app creía que había usuario y mostraba el intake.)
    if (/\/api\/(users\/me|me|auth\/refresh)(\?|$|\/)/.test(url)) {
      return route.fulfill({ status: 401, contentType: "application/json", body: JSON.stringify({ message: "No autenticado" }) });
    }
    return route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
  });
}

async function submitLogin(page: Page, email = "paciente@velum.test", password = "Password1234!") {
  await page.getByPlaceholder("correo@ejemplo.com").first().fill(email);
  await page.locator('input[type="password"]').first().fill(password);
  // El submit del form de login es el botón "Entrar" (el h2 dice "Iniciar sesión").
  await page.locator('button[type="submit"]').first().click();
}

test.describe("Login — mapeo de errores", () => {
  test("carga la pantalla de login", async ({ page }) => {
    await mockBackend(page);
    await page.goto(LOGIN_URL);
    await expect(page.getByRole("heading", { name: "Iniciar sesión" })).toBeVisible();
    await expect(page.getByPlaceholder("correo@ejemplo.com").first()).toBeVisible();
    await expect(page.locator('button[type="submit"]').first()).toBeVisible();
  });

  test("401 muestra 'credenciales incorrectas'", async ({ page }) => {
    await mockBackend(page);
    await page.route("**/api/auth/login", (route) =>
      route.fulfill({ status: 401, contentType: "application/json", body: JSON.stringify({ message: "Credenciales inválidas" }) }),
    );
    await page.goto(LOGIN_URL);
    await submitLogin(page);
    await expect(page.getByText(/credenciales incorrectas/i)).toBeVisible();
  });

  test("error de servidor (503) NO se muestra como credenciales — regresión del cold start", async ({ page }) => {
    await mockBackend(page);
    await page.route("**/api/auth/login", (route) =>
      route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ message: "Service Unavailable" }) }),
    );
    await page.goto(LOGIN_URL);
    await submitLogin(page);
    // Debe indicar que el servidor puede estar iniciando…
    await expect(page.getByText(/servidor.*(iniciando|conectar)|puede estar iniciando/i)).toBeVisible();
    // …y NO culpar a las credenciales (el bug original).
    await expect(page.getByText(/credenciales incorrectas/i)).toHaveCount(0);
  });
});
