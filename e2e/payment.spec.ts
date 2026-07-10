import { test, expect, type Page } from "@playwright/test";

const CHARGE_ID = "chg-e2e-1";

const PENDING_CHARGE = {
  charge: {
    id: CHARGE_ID,
    title: "Sesión adicional de láser",
    description: "Cobro puntual de tu tratamiento",
    amount: 50000,
    currency: "mxn",
    amountFormatted: "$500",
    type: "ONE_TIME",
    status: "PENDING_ACCEPTANCE",
    user: { email: "paciente@velum.test", profile: { firstName: "Ana" } },
  },
};

/**
 * Mockea el cobro (público, sin login) y la respuesta de verify. /users/me → 401
 * para que no aparezcan overlays de sesión encima del formulario.
 */
async function mockChargeBackend(page: Page, verify: { status: number; body: object }) {
  await page.route("**/api/**", (route) => {
    const url = route.request().url();
    if (/\/api\/(users\/me|me|auth\/refresh)(\?|$|\/)/.test(url)) {
      return route.fulfill({ status: 401, contentType: "application/json", body: "{}" });
    }
    return route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
  });
  await page.route(`**/api/v1/custom-charges/${CHARGE_ID}`, (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(PENDING_CHARGE) }));
  await page.route(`**/api/v1/custom-charges/${CHARGE_ID}/verify`, (route) =>
    route.fulfill({ status: verify.status, contentType: "application/json", body: JSON.stringify(verify.body) }));
}

async function fillOtp(page: Page, code = "123456") {
  const inputs = page.locator('input[maxlength="1"]');
  await expect(inputs).toHaveCount(6);
  for (let i = 0; i < 6; i++) await inputs.nth(i).fill(code[i]);
}

test.describe("Pago — custom charge (OTP + checkout)", () => {
  test("OTP correcto → redirige al checkout de Stripe", async ({ page }) => {
    await mockChargeBackend(page, { status: 200, body: { checkoutUrl: "http://localhost:3000/?stripe=checkout-stub" } });
    await page.goto(`/#/custom-charge/${CHARGE_ID}`);
    await expect(page.getByRole("button", { name: /autorizar y pagar/i })).toBeVisible();
    await fillOtp(page);
    await page.getByRole("button", { name: /autorizar y pagar/i }).click();
    // La app redirige a la URL de checkout de Stripe (aquí un stub del mismo origen).
    await page.waitForURL(/stripe=checkout-stub/);
  });

  test("OTP incorrecto → muestra error y NO redirige", async ({ page }) => {
    await mockChargeBackend(page, { status: 400, body: { message: "Código incorrecto. Verifica e intenta de nuevo" } });
    await page.goto(`/#/custom-charge/${CHARGE_ID}`);
    await fillOtp(page, "000000");
    await page.getByRole("button", { name: /autorizar y pagar/i }).click();
    await expect(page.getByText(/código incorrecto/i)).toBeVisible();
    // Sigue en la página del cobro — no hubo redirección al checkout.
    expect(page.url()).toContain(`custom-charge/${CHARGE_ID}`);
  });
});
