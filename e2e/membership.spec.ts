import { test, expect, type Page } from "@playwright/test";

const MEMBER_USER = {
  id: "m1",
  email: "member@velum.test",
  role: "member",
  profile: { firstName: "Ana", lastName: "López", phone: null, birthDate: null },
  mustChangePassword: false,
  tenantId: "default",
  clinicId: "default",
};

/**
 * Miembro autenticado (sesión verificada por /users/me) + checkout de Stripe
 * mockeado. Al verificar sesión, needsOnboarding queda en false → sin overlays.
 */
async function mockMemberBackend(page: Page) {
  await page.route("**/api/**", (route) => {
    const url = route.request().url();
    if (/\/api\/(users\/me|me)(\?|$)/.test(url)) {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(MEMBER_USER) });
    }
    return route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
  });
  await page.route("**/api/v1/billing/checkout", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ checkoutUrl: "http://localhost:3000/?stripe=membership-stub" }) }));
}

test("membresía: seleccionar plan → checkout de Stripe (reserva de plan + pago)", async ({ page }) => {
  await mockMemberBackend(page);
  await page.goto("/#/memberships");

  // Paso 1: elegir el plan full-body "Signature" (salta la selección de zonas
  // y va directo a la confirmación/pago porque el miembro está autenticado).
  await page.getByText("Signature", { exact: true }).first().click();

  // Paso 3: pagar y activar → redirige al checkout de Stripe.
  const pay = page.getByRole("button", { name: /pagar y activar membresía/i });
  await expect(pay).toBeVisible();
  await pay.click();
  await page.waitForURL(/stripe=membership-stub/);
});
