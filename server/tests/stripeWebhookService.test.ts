/**
 * Tests para services/stripeWebhookService.ts
 *
 * Cubre:
 *  - Helper functions puras (sin DB): asRecord, safeParseRecord, safeParseArray,
 *    cleanString, asNumber, asBoolean, extractExpandableId, centsToMajor,
 *    unixToDate, toMembershipStatus
 *  - getStripeWebhookConfig: env, DB, mixto, sin keys
 *  - handleBusinessStripeEvent: invoice.payment_succeeded, customer.subscription.*,
 *    customer.subscription.deleted, evento desconocido, doble llamada (idempotencia)
 *
 * NOTA: Las helpers (asRecord, cleanString, etc.) son module-scope y no están
 * exportadas. Se testean indirectamente a través de getStripeWebhookConfig y
 * handleBusinessStripeEvent, o bien comprobando su comportamiento observable.
 * Para las funciones puramente aritméticas se incluyen pruebas directas a través
 * del comportamiento de getStripeWebhookConfig (cleanString) y handleBusinessStripeEvent.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Variables de entorno mínimas ──────────────────────────────────────────────
process.env.JWT_SECRET           = "test-secret-32-bytes-minimum-len!";
process.env.DATABASE_URL         = "postgresql://x:x@localhost/x";
process.env.INTEGRATIONS_ENC_KEY = "test-enc-key-32-bytes-minimum!!";
process.env.NODE_ENV             = "test";

// ── Mocks hoisted (deben declararse antes de cualquier import del módulo) ──────
const {
  mockAppSettingFindUnique,
  mockMembershipFindFirst,
  mockMembershipCreate,
  mockMembershipUpdate,
  mockMembershipFindFirstById,
  mockPaymentUpsert,
  mockCustomChargeFindUnique,
  mockCustomChargeUpdate,
  mockUserFindUnique,
  mockUserFindFirst,
  mockUserUpdate,
  mockUserUpdateMany,
  mockAppointmentCreate,
} = vi.hoisted(() => ({
  mockAppSettingFindUnique:   vi.fn(),
  mockMembershipFindFirst:    vi.fn(),
  mockMembershipCreate:       vi.fn().mockResolvedValue({ id: "mem-1" }),
  mockMembershipUpdate:       vi.fn().mockResolvedValue({ id: "mem-1" }),
  mockMembershipFindFirstById: vi.fn().mockResolvedValue(null),
  mockPaymentUpsert:          vi.fn().mockResolvedValue({}),
  mockCustomChargeFindUnique: vi.fn(),
  mockCustomChargeUpdate:     vi.fn(),
  mockUserFindUnique:         vi.fn(),
  mockUserFindFirst:          vi.fn(),
  mockUserUpdate:             vi.fn().mockResolvedValue({}),
  mockUserUpdateMany:         vi.fn().mockResolvedValue({ count: 1 }),
  mockAppointmentCreate:      vi.fn().mockResolvedValue({}),
}));

// ── Mock Prisma ───────────────────────────────────────────────────────────────
vi.mock("../src/db/prisma", () => ({
  prisma: {
    appSetting: {
      findUnique: mockAppSettingFindUnique,
    },
    membership: {
      findFirst:  mockMembershipFindFirst,
      create:     mockMembershipCreate,
      update:     mockMembershipUpdate,
    },
    payment: {
      upsert: mockPaymentUpsert,
    },
    customCharge: {
      findUnique: mockCustomChargeFindUnique,
      update:     mockCustomChargeUpdate,
    },
    user: {
      findUnique:  mockUserFindUnique,
      findFirst:   mockUserFindFirst,
      update:      mockUserUpdate,
      updateMany:  mockUserUpdateMany,
    },
    appointment: {
      create: mockAppointmentCreate,
    },
  },
}));

// ── Mock del módulo env para controlar las keys de Stripe en cada test ────────
const mockEnv = vi.hoisted(() => ({
  stripeSecretKey:      "",
  stripePublishableKey: "",
  stripeWebhookSecret:  "",
}));

vi.mock("../src/utils/env", () => ({
  env: mockEnv,
  isProduction: false,
}));

// ── Mock servicios externos (sin efectos secundarios en tests) ─────────────────
vi.mock("../src/services/notificationService", () => ({
  onCustomChargePaid:        vi.fn().mockResolvedValue(undefined),
  onAppointmentDepositPaid:  vi.fn().mockResolvedValue(undefined),
  onMembershipActivated:     vi.fn().mockResolvedValue(undefined),
  onMembershipPaymentFailed: vi.fn().mockResolvedValue(undefined),
  notifyAdmins:              vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../src/services/emailService", () => ({
  sendPaymentReceiptEmail: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../src/services/metricsService", () => ({
  inc: vi.fn(),
}));

vi.mock("../src/utils/errorReporter", () => ({
  reportError: vi.fn(),
}));

// ── Import bajo test ──────────────────────────────────────────────────────────
import {
  getStripeWebhookConfig,
  handleBusinessStripeEvent,
} from "../src/services/stripeWebhookService";

// ── Helpers de factory para eventos Stripe sintéticos ────────────────────────

/** Crea un evento Stripe mínimo válido */
function makeEvent(
  type: string,
  dataObject: Record<string, unknown>,
  id = "evt_test_001"
): import("stripe").default.Event {
  return {
    id,
    type,
    object: "event",
    api_version: "2023-10-16",
    created: Math.floor(Date.now() / 1000),
    livemode: false,
    pending_webhooks: 0,
    request: null,
    data: { object: dataObject },
  } as unknown as import("stripe").default.Event;
}

/** Crea un stripe client mock que retorna una suscripción sintética */
function makeStripeMock(sub: Record<string, unknown> = {}): import("stripe").default {
  const defaultSub = {
    id: "sub_test_001",
    status: "active",
    current_period_end: Math.floor(Date.now() / 1000) + 30 * 86400,
    cancel_at_period_end: false,
    customer: "cus_test_001",
    currency: "mxn",
    items: {
      data: [{ price: { id: "price_test_001" } }],
    },
    ...sub,
  };

  return {
    subscriptions: {
      retrieve: vi.fn().mockResolvedValue(defaultSub),
    },
  } as unknown as import("stripe").default;
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. getStripeWebhookConfig — config de Stripe
// ─────────────────────────────────────────────────────────────────────────────

describe("getStripeWebhookConfig", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Resetear el mock de env entre tests
    mockEnv.stripeSecretKey      = "";
    mockEnv.stripePublishableKey = "";
    mockEnv.stripeWebhookSecret  = "";
  });

  it('devuelve source="env" cuando todas las keys vienen de variables de entorno', async () => {
    mockEnv.stripeSecretKey      = "sk_test_env_secret_key_real";
    mockEnv.stripePublishableKey = "pk_test_env_publishable_key";
    mockEnv.stripeWebhookSecret  = "whsec_env_webhook_secret_key";
    mockAppSettingFindUnique.mockResolvedValue(null);

    const config = await getStripeWebhookConfig();

    expect(config.source).toBe("env");
    expect(config.secretKey).toBe("sk_test_env_secret_key_real");
    expect(config.publishableKey).toBe("pk_test_env_publishable_key");
    expect(config.webhookSecret).toBe("whsec_env_webhook_secret_key");
  });

  it('devuelve source="db" cuando las keys vienen solo de la BD', async () => {
    mockAppSettingFindUnique.mockResolvedValue({
      key: "stripe_config",
      value: JSON.stringify({
        secretKey:      "sk_test_db_secret_key_real",
        publishableKey: "pk_test_db_publishable_key",
        webhookSecret:  "whsec_db_webhook_secret_key",
      }),
    });

    const config = await getStripeWebhookConfig();

    expect(config.source).toBe("db");
    expect(config.secretKey).toBe("sk_test_db_secret_key_real");
  });

  it('devuelve source="mixed" cuando hay keys tanto en env como en DB', async () => {
    mockEnv.stripeSecretKey = "sk_test_env_only_secret_key";
    mockAppSettingFindUnique.mockResolvedValue({
      key: "stripe_config",
      value: JSON.stringify({
        webhookSecret: "whsec_db_only_webhook_secret",
      }),
    });

    const config = await getStripeWebhookConfig();

    expect(config.source).toBe("mixed");
    expect(config.secretKey).toBe("sk_test_env_only_secret_key");
    expect(config.webhookSecret).toBe("whsec_db_only_webhook_secret");
  });

  it('devuelve source="none" cuando no hay ninguna key configurada', async () => {
    mockAppSettingFindUnique.mockResolvedValue(null);

    const config = await getStripeWebhookConfig();

    expect(config.source).toBe("none");
    expect(config.secretKey).toBe("");
    expect(config.webhookSecret).toBe("");
  });

  it("ignora placeholders en env (REEMPLAZA, CHANGE_ME, YOUR_, _HERE)", async () => {
    mockEnv.stripeSecretKey      = "REEMPLAZA_CON_TU_KEY";
    mockEnv.stripePublishableKey = "YOUR_PUBLISHABLE_KEY_HERE";
    mockEnv.stripeWebhookSecret  = "CHANGE_ME";
    mockAppSettingFindUnique.mockResolvedValue(null);

    const config = await getStripeWebhookConfig();

    expect(config.source).toBe("none");
    expect(config.secretKey).toBe("");
    expect(config.publishableKey).toBe("");
    expect(config.webhookSecret).toBe("");
  });

  it("ignora placeholders en DB también", async () => {
    mockAppSettingFindUnique.mockResolvedValue({
      key: "stripe_config",
      value: JSON.stringify({
        secretKey:    "REEMPLAZA_CON_TU_KEY",
        webhookSecret: "YOUR_WEBHOOK_SECRET_HERE",
      }),
    });

    const config = await getStripeWebhookConfig();

    expect(config.source).toBe("none");
    expect(config.secretKey).toBe("");
  });

  it("usa la key de env sobre la de DB cuando ambas están definidas (env tiene precedencia)", async () => {
    mockEnv.stripeSecretKey = "sk_env_has_priority";
    mockAppSettingFindUnique.mockResolvedValue({
      key: "stripe_config",
      value: JSON.stringify({ secretKey: "sk_db_would_be_ignored" }),
    });

    const config = await getStripeWebhookConfig();

    expect(config.secretKey).toBe("sk_env_has_priority");
  });

  it("acepta el formato alternativo de keys en DB (snake_case)", async () => {
    mockAppSettingFindUnique.mockResolvedValue({
      key: "stripe_config",
      value: JSON.stringify({
        secret_key:      "sk_test_snake_case_secret",
        publishable_key: "pk_test_snake_case_pub",
        webhook_secret:  "whsec_snake_case_webhook",
      }),
    });

    const config = await getStripeWebhookConfig();

    expect(config.source).toBe("db");
    expect(config.secretKey).toBe("sk_test_snake_case_secret");
  });

  it("maneja error de BD retornando keys vacías y source=none", async () => {
    // Con env vacío y BD fallando, debe quedar en none
    mockAppSettingFindUnique.mockRejectedValue(new Error("DB connection failed"));

    const config = await getStripeWebhookConfig();

    expect(config.source).toBe("none");
    expect(config.secretKey).toBe("");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. handleBusinessStripeEvent — evento invoice.payment_succeeded
// ─────────────────────────────────────────────────────────────────────────────

describe("handleBusinessStripeEvent — invoice.payment_succeeded", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Sin plan catalog por defecto
    mockAppSettingFindUnique.mockResolvedValue(null);
    // Sin usuario encontrado por defecto
    mockUserFindFirst.mockResolvedValue(null);
    mockUserFindUnique.mockResolvedValue(null);
    // Sin membresía preexistente
    mockMembershipFindFirst.mockResolvedValue(null);
  });

  it("crea una membresía cuando no existe una previa", async () => {
    const stripe = makeStripeMock();
    const event = makeEvent("invoice.payment_succeeded", {
      id: "in_test_001",
      subscription: "sub_test_001",
      customer: "cus_test_001",
      customer_email: "test@example.com",
      amount_paid: 50000,
      amount_due: 50000,
      currency: "mxn",
    });

    mockUserFindFirst.mockResolvedValue({ id: "user-1", email: "test@example.com" });

    await handleBusinessStripeEvent(event, stripe);

    // Debe haber intentado crear o actualizar la membresía
    expect(mockMembershipCreate).toHaveBeenCalledTimes(1);
    const createCall = mockMembershipCreate.mock.calls[0][0] as { data: Record<string, unknown> };
    expect(createCall.data.status).toBe("active");
    expect(createCall.data.stripeSubscriptionId).toBe("sub_test_001");
  });

  it("actualiza membresía existente (idempotencia — no crea duplicado)", async () => {
    const stripe = makeStripeMock();
    const event = makeEvent("invoice.payment_succeeded", {
      id: "in_test_002",
      subscription: "sub_test_001",
      customer: "cus_test_001",
      customer_email: "test@example.com",
      amount_paid: 50000,
      amount_due: 50000,
      currency: "mxn",
    });

    mockUserFindFirst.mockResolvedValue({ id: "user-1", email: "test@example.com" });
    // Simular membresía ya existente
    mockMembershipFindFirst.mockResolvedValue({ id: "mem-existing", stripeSubscriptionId: "sub_test_001" });

    await handleBusinessStripeEvent(event, stripe);

    // Debe actualizar, no crear
    expect(mockMembershipUpdate).toHaveBeenCalledTimes(1);
    expect(mockMembershipCreate).not.toHaveBeenCalled();
  });

  it("idempotencia — dos llamadas con el mismo evento producen una sola membresía", async () => {
    const stripe = makeStripeMock();
    const event = makeEvent("invoice.payment_succeeded", {
      id: "in_test_idem",
      subscription: "sub_idem",
      customer: "cus_idem",
      customer_email: "idem@example.com",
      amount_paid: 30000,
      amount_due: 30000,
      currency: "mxn",
    });

    mockUserFindFirst.mockResolvedValue({ id: "user-idem", email: "idem@example.com" });

    // Primera llamada: no existe membresía → create
    mockMembershipFindFirst.mockResolvedValueOnce(null);
    await handleBusinessStripeEvent(event, stripe);
    expect(mockMembershipCreate).toHaveBeenCalledTimes(1);

    // Segunda llamada: ya existe → update
    mockMembershipFindFirst.mockResolvedValueOnce({ id: "mem-idem", stripeSubscriptionId: "sub_idem" });
    await handleBusinessStripeEvent(event, stripe);
    expect(mockMembershipUpdate).toHaveBeenCalledTimes(1);
    // El create no se llama de nuevo
    expect(mockMembershipCreate).toHaveBeenCalledTimes(1);
  });

  it("no crea membresía si no hay suscripción en el evento", async () => {
    const stripe = makeStripeMock();
    const event = makeEvent("invoice.payment_succeeded", {
      id: "in_no_sub",
      subscription: null,
      customer: "cus_test_001",
      customer_email: "test@example.com",
      amount_paid: 10000,
      amount_due: 10000,
      currency: "mxn",
    });

    await handleBusinessStripeEvent(event, stripe);

    expect(mockMembershipCreate).not.toHaveBeenCalled();
    expect(mockMembershipUpdate).not.toHaveBeenCalled();
  });

  it("registra el pago en la tabla payment cuando hay userId", async () => {
    const stripe = makeStripeMock();
    const event = makeEvent("invoice.payment_succeeded", {
      id: "in_payment_reg",
      subscription: "sub_pay",
      customer: "cus_pay",
      customer_email: "pay@example.com",
      amount_paid: 75000,
      amount_due: 75000,
      currency: "mxn",
    });

    mockUserFindFirst.mockResolvedValue({ id: "user-pay", email: "pay@example.com" });

    await handleBusinessStripeEvent(event, stripe);

    expect(mockPaymentUpsert).toHaveBeenCalledTimes(1);
    const upsertCall = mockPaymentUpsert.mock.calls[0][0] as {
      create: { status: string; amount: number };
    };
    expect(upsertCall.create.status).toBe("paid");
    // 75000 centavos → 750.00
    expect(upsertCall.create.amount).toBe(750);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. handleBusinessStripeEvent — invoice.payment_failed
// ─────────────────────────────────────────────────────────────────────────────

describe("handleBusinessStripeEvent — invoice.payment_failed", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAppSettingFindUnique.mockResolvedValue(null);
    mockUserFindFirst.mockResolvedValue(null);
    mockUserFindUnique.mockResolvedValue(null);
    mockMembershipFindFirst.mockResolvedValue(null);
  });

  it("actualiza status a past_due cuando el pago falla", async () => {
    const stripe = makeStripeMock({ status: "past_due" });
    const event = makeEvent("invoice.payment_failed", {
      id: "in_failed_001",
      subscription: "sub_fail",
      customer: "cus_fail",
      customer_email: "fail@example.com",
      amount_paid: 0,
      amount_due: 50000,
      currency: "mxn",
    });

    mockUserFindFirst.mockResolvedValue({ id: "user-fail", email: "fail@example.com" });

    await handleBusinessStripeEvent(event, stripe);

    expect(mockMembershipCreate).toHaveBeenCalledTimes(1);
    const data = (mockMembershipCreate.mock.calls[0][0] as { data: Record<string, unknown> }).data;
    expect(data.status).toBe("past_due");
  });

  it("registra payment con status=failed", async () => {
    const stripe = makeStripeMock({ status: "past_due" });
    const event = makeEvent("invoice.payment_failed", {
      id: "in_failed_002",
      subscription: "sub_fail2",
      customer: "cus_fail2",
      customer_email: "fail2@example.com",
      amount_paid: 0,
      amount_due: 30000,
      currency: "mxn",
    });

    mockUserFindFirst.mockResolvedValue({ id: "user-fail2", email: "fail2@example.com" });

    await handleBusinessStripeEvent(event, stripe);

    expect(mockPaymentUpsert).toHaveBeenCalledTimes(1);
    const upsertCall = mockPaymentUpsert.mock.calls[0][0] as { create: { status: string } };
    expect(upsertCall.create.status).toBe("failed");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. handleBusinessStripeEvent — customer.subscription.updated
// ─────────────────────────────────────────────────────────────────────────────

describe("handleBusinessStripeEvent — customer.subscription.updated", () => {
  /**
   * processSubscriptionEvent siempre llama a upsertMembership con userId=null.
   * El guard en upsertMembership previene el `create` sin userId,
   * pero el `update` sí funciona cuando la membresía ya existe en BD.
   * Todos los tests de este grupo pre-populan la membresía existente.
   */
  const existingMembership = { id: "mem-existing", stripeSubscriptionId: "sub_upd_001" };

  beforeEach(() => {
    vi.clearAllMocks();
    mockAppSettingFindUnique.mockResolvedValue(null);
    // Membresía existente → fuerza el camino de update
    mockMembershipFindFirst.mockResolvedValue(existingMembership);
    mockUserFindFirst.mockResolvedValue(null);
    mockUserFindUnique.mockResolvedValue(null);
  });

  it("actualiza status de membresía al status de Stripe cuando ya existe", async () => {
    const stripe = makeStripeMock();
    const event = makeEvent("customer.subscription.updated", {
      id: "sub_upd_001",
      status: "active",
      current_period_end: Math.floor(Date.now() / 1000) + 30 * 86400,
      cancel_at_period_end: false,
      customer: "cus_upd",
      currency: "mxn",
      items: { data: [{ price: { id: "price_upd" } }] },
    });

    await handleBusinessStripeEvent(event, stripe);

    expect(mockMembershipUpdate).toHaveBeenCalledTimes(1);
    const call = mockMembershipUpdate.mock.calls[0][0] as { data: Record<string, unknown>; where: Record<string, unknown> };
    expect(call.data.status).toBe("active");
    expect(call.where.id).toBe("mem-existing");
  });

  it("no crea membresía duplicada cuando ya existe (usa update)", async () => {
    const stripe = makeStripeMock();
    mockMembershipFindFirst.mockResolvedValue({ id: "mem-upd", stripeSubscriptionId: "sub_upd_002" });

    const event = makeEvent("customer.subscription.updated", {
      id: "sub_upd_002",
      status: "active",
      current_period_end: Math.floor(Date.now() / 1000) + 30 * 86400,
      cancel_at_period_end: false,
      customer: "cus_upd2",
      currency: "mxn",
      items: { data: [{ price: { id: "price_upd" } }] },
    });

    await handleBusinessStripeEvent(event, stripe);

    expect(mockMembershipUpdate).toHaveBeenCalledTimes(1);
    expect(mockMembershipCreate).not.toHaveBeenCalled();
  });

  it("mapea status 'trialing' a 'active' en la BD", async () => {
    const stripe = makeStripeMock({ status: "trialing" });
    const event = makeEvent("customer.subscription.updated", {
      id: "sub_trial",
      status: "trialing",
      current_period_end: Math.floor(Date.now() / 1000) + 14 * 86400,
      cancel_at_period_end: false,
      customer: "cus_trial",
      currency: "mxn",
      items: { data: [{ price: { id: "price_trial" } }] },
    });

    await handleBusinessStripeEvent(event, stripe);

    const call = mockMembershipUpdate.mock.calls[0][0] as { data: Record<string, unknown> };
    expect(call.data.status).toBe("active");
  });

  it("mapea status 'past_due' a 'past_due' en la BD", async () => {
    const stripe = makeStripeMock({ status: "past_due" });
    const event = makeEvent("customer.subscription.updated", {
      id: "sub_past_due",
      status: "past_due",
      current_period_end: Math.floor(Date.now() / 1000) + 5 * 86400,
      cancel_at_period_end: false,
      customer: "cus_past",
      currency: "mxn",
      items: { data: [{ price: { id: "price_past" } }] },
    });

    await handleBusinessStripeEvent(event, stripe);

    const call = mockMembershipUpdate.mock.calls[0][0] as { data: Record<string, unknown> };
    expect(call.data.status).toBe("past_due");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. handleBusinessStripeEvent — customer.subscription.deleted (cancelación)
// ─────────────────────────────────────────────────────────────────────────────

describe("handleBusinessStripeEvent — customer.subscription.deleted", () => {
  /**
   * processSubscriptionEvent usa userId=null siempre.
   * Al no haber userId, el create está bloqueado. Pre-populamos membresía
   * para ir por el camino update, que sí funciona sin userId.
   */
  beforeEach(() => {
    vi.clearAllMocks();
    mockAppSettingFindUnique.mockResolvedValue(null);
    // Membresía preexistente para forzar el camino de update
    mockMembershipFindFirst.mockResolvedValue({ id: "mem-del", stripeSubscriptionId: "sub_del_001" });
    mockUserFindFirst.mockResolvedValue(null);
    mockUserFindUnique.mockResolvedValue(null);
  });

  it("cancela la membresía (status=canceled) cuando ya existe", async () => {
    const stripe = makeStripeMock({ status: "canceled" });
    const event = makeEvent("customer.subscription.deleted", {
      id: "sub_del_001",
      status: "canceled",
      current_period_end: Math.floor(Date.now() / 1000) - 86400,
      cancel_at_period_end: false,
      customer: "cus_del",
      currency: "mxn",
      items: { data: [{ price: { id: "price_del" } }] },
    });

    await handleBusinessStripeEvent(event, stripe);

    expect(mockMembershipUpdate).toHaveBeenCalledTimes(1);
    const call = mockMembershipUpdate.mock.calls[0][0] as { data: Record<string, unknown> };
    expect(call.data.status).toBe("canceled");
  });

  it("fuerza status=canceled aunque el evento subscription tenga otro status", async () => {
    // La lógica de processSubscriptionEvent fuerza "canceled" para .deleted
    mockMembershipFindFirst.mockResolvedValue({ id: "mem-del-force", stripeSubscriptionId: "sub_del_force" });
    const stripe = makeStripeMock({ status: "active" });
    const event = makeEvent("customer.subscription.deleted", {
      id: "sub_del_force",
      status: "active",
      current_period_end: Math.floor(Date.now() / 1000) + 86400,
      cancel_at_period_end: false,
      customer: "cus_del_force",
      currency: "mxn",
      items: { data: [{ price: { id: "price_del" } }] },
    });

    await handleBusinessStripeEvent(event, stripe);

    const call = mockMembershipUpdate.mock.calls[0][0] as { data: Record<string, unknown> };
    expect(call.data.status).toBe("canceled");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. handleBusinessStripeEvent — customer.subscription.paused / resumed
// ─────────────────────────────────────────────────────────────────────────────

describe("handleBusinessStripeEvent — paused / resumed", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAppSettingFindUnique.mockResolvedValue(null);
    // Membresía existente para forzar el camino de update (userId=null en subscription events)
    mockMembershipFindFirst.mockResolvedValue({ id: "mem-paused", stripeSubscriptionId: "sub_paused" });
    mockUserFindFirst.mockResolvedValue(null);
  });

  it("mapea status 'paused' a 'paused' en la BD", async () => {
    const stripe = makeStripeMock({ status: "paused" });
    const event = makeEvent("customer.subscription.paused", {
      id: "sub_paused",
      status: "paused",
      current_period_end: Math.floor(Date.now() / 1000) + 30 * 86400,
      cancel_at_period_end: false,
      customer: "cus_paused",
      currency: "mxn",
      items: { data: [{ price: { id: "price_paused" } }] },
    });

    await handleBusinessStripeEvent(event, stripe);

    expect(mockMembershipUpdate).toHaveBeenCalledTimes(1);
    const call = mockMembershipUpdate.mock.calls[0][0] as { data: Record<string, unknown> };
    expect(call.data.status).toBe("paused");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 7. handleBusinessStripeEvent — evento desconocido (no debe lanzar)
// ─────────────────────────────────────────────────────────────────────────────

describe("handleBusinessStripeEvent — evento desconocido", () => {
  beforeEach(() => vi.clearAllMocks());

  it("no hace nada y no lanza para un tipo de evento no manejado", async () => {
    const stripe = makeStripeMock();
    const event = makeEvent("payment_intent.created", { id: "pi_unknown" });

    await expect(handleBusinessStripeEvent(event, stripe)).resolves.toBeUndefined();

    expect(mockMembershipCreate).not.toHaveBeenCalled();
    expect(mockMembershipUpdate).not.toHaveBeenCalled();
    expect(mockPaymentUpsert).not.toHaveBeenCalled();
  });

  it("no hace nada para customer.subscription.created con datos mínimos", async () => {
    const stripe = makeStripeMock();
    mockMembershipFindFirst.mockResolvedValue(null);
    mockAppSettingFindUnique.mockResolvedValue(null);

    const event = makeEvent("customer.subscription.created", {
      id: "sub_new",
      status: "active",
      current_period_end: Math.floor(Date.now() / 1000) + 30 * 86400,
      cancel_at_period_end: false,
      customer: "cus_new",
      currency: "mxn",
      items: { data: [{ price: { id: "price_new" } }] },
    });

    // No debe lanzar
    await expect(handleBusinessStripeEvent(event, stripe)).resolves.toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 8. handleBusinessStripeEvent — charge.refunded
// ─────────────────────────────────────────────────────────────────────────────

describe("handleBusinessStripeEvent — charge.refunded", () => {
  beforeEach(() => vi.clearAllMocks());

  it("marca el payment como refunded por payment_intent_id", async () => {
    const stripe = makeStripeMock();
    const mockPaymentUpdateMany = vi.fn().mockResolvedValue({ count: 1 });
    // Re-mock prisma.payment.updateMany para este grupo
    const { prisma } = await import("../src/db/prisma");
    (prisma.payment as unknown as Record<string, unknown>).updateMany = mockPaymentUpdateMany;

    const event = makeEvent("charge.refunded", {
      id: "ch_ref_001",
      payment_intent: "pi_refunded_001",
      amount_refunded: 50000,
    });

    await handleBusinessStripeEvent(event, stripe);

    expect(mockPaymentUpdateMany).toHaveBeenCalledWith({
      where: { stripePaymentIntentId: "pi_refunded_001" },
      data: { status: "refunded" },
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 9. Plan catalog — resolución de planCode por stripePriceId
// ─────────────────────────────────────────────────────────────────────────────

describe("Plan catalog — resolución de planCode vía handleBusinessStripeEvent", () => {
  /**
   * processSubscriptionEvent siempre usa userId=null, por lo que el create
   * está bloqueado. Pre-populamos la membresía existente para que el código
   * vaya por el camino de update, donde sí podemos verificar el planCode.
   */
  const existingMembership = { id: "mem-catalog", stripeSubscriptionId: "sub_catalog" };

  beforeEach(() => {
    vi.clearAllMocks();
    mockMembershipFindFirst.mockResolvedValue(existingMembership);
    mockUserFindFirst.mockResolvedValue(null);
    mockUserFindUnique.mockResolvedValue(null);
  });

  it("asigna planCode correcto cuando el catalog está en BD", async () => {
    const catalog = [
      { planCode: "ESENCIAL", name: "Esencial", amount: 499, interval: "month", stripePriceId: "price_esencial", active: true },
      { planCode: "PREMIUM",  name: "Premium",  amount: 999, interval: "month", stripePriceId: "price_premium",  active: true },
    ];

    // appSetting se llama una vez para el plan catalog
    mockAppSettingFindUnique.mockResolvedValue({
      key: "stripe_plan_catalog_v1",
      value: JSON.stringify(catalog),
    });

    const stripe = makeStripeMock({ items: { data: [{ price: { id: "price_esencial" } }] } });
    const event = makeEvent("customer.subscription.updated", {
      id: "sub_catalog",
      status: "active",
      current_period_end: Math.floor(Date.now() / 1000) + 30 * 86400,
      cancel_at_period_end: false,
      customer: "cus_catalog",
      currency: "mxn",
      items: { data: [{ price: { id: "price_esencial" } }] },
    });

    await handleBusinessStripeEvent(event, stripe);

    expect(mockMembershipUpdate).toHaveBeenCalledTimes(1);
    const call = mockMembershipUpdate.mock.calls[0][0] as { data: Record<string, unknown> };
    expect(call.data.planCode).toBe("ESENCIAL");
  });

  it("deja planCode como null si el priceId no está en el catalog", async () => {
    const catalog = [
      { planCode: "ESENCIAL", stripePriceId: "price_esencial", active: true },
    ];

    mockAppSettingFindUnique.mockResolvedValue({
      key: "stripe_plan_catalog_v1",
      value: JSON.stringify(catalog),
    });

    const stripe = makeStripeMock({ items: { data: [{ price: { id: "price_unknown_xyz" } }] } });
    const event = makeEvent("customer.subscription.updated", {
      id: "sub_no_catalog",
      status: "active",
      current_period_end: Math.floor(Date.now() / 1000) + 30 * 86400,
      cancel_at_period_end: false,
      customer: "cus_no_catalog",
      currency: "mxn",
      items: { data: [{ price: { id: "price_unknown_xyz" } }] },
    });

    await handleBusinessStripeEvent(event, stripe);

    const call = mockMembershipUpdate.mock.calls[0][0] as { data: Record<string, unknown> };
    expect(call.data.planCode).toBeNull();
  });

  it("ignora planes inactivos en el catalog", async () => {
    const catalog = [
      { planCode: "LEGACY", stripePriceId: "price_legacy", active: false },
    ];

    mockAppSettingFindUnique.mockResolvedValue({
      key: "stripe_plan_catalog_v1",
      value: JSON.stringify(catalog),
    });

    const stripe = makeStripeMock({ items: { data: [{ price: { id: "price_legacy" } }] } });
    const event = makeEvent("customer.subscription.updated", {
      id: "sub_inactive_plan",
      status: "active",
      current_period_end: Math.floor(Date.now() / 1000) + 30 * 86400,
      cancel_at_period_end: false,
      customer: "cus_inactive",
      currency: "mxn",
      items: { data: [{ price: { id: "price_legacy" } }] },
    });

    await handleBusinessStripeEvent(event, stripe);

    const call = mockMembershipUpdate.mock.calls[0][0] as { data: Record<string, unknown> };
    // Plan inactivo no debe resolverse
    expect(call.data.planCode).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 10. Verificación indirecta de helpers puros a través de comportamiento observable
// ─────────────────────────────────────────────────────────────────────────────

describe("Helpers puros — verificación a través de comportamiento observable", () => {
  /**
   * Las funciones asRecord, safeParseRecord, safeParseArray, cleanString,
   * asNumber, asBoolean, extractExpandableId, centsToMajor, unixToDate y
   * toMembershipStatus son module-private. Se verifican indirectamente
   * a través de getStripeWebhookConfig y handleBusinessStripeEvent.
   * Este bloque documenta las invariantes que los tests de integración ya validan.
   */

  describe("cleanString — eliminación de placeholders (vía getStripeWebhookConfig)", () => {
    beforeEach(() => {
      vi.clearAllMocks();
      // Resetear el mock de env entre tests
      mockEnv.stripeSecretKey      = "";
      mockEnv.stripePublishableKey = "";
      mockEnv.stripeWebhookSecret  = "";
    });

    it("REEMPLAZA es filtrado → source=none", async () => {
      mockEnv.stripeSecretKey = "REEMPLAZA";
      mockAppSettingFindUnique.mockResolvedValue(null);
      const { source } = await getStripeWebhookConfig();
      expect(source).toBe("none");
    });

    it("CHANGE_ME es filtrado → source=none", async () => {
      mockEnv.stripeSecretKey = "CHANGE_ME_WITH_REAL_KEY";
      mockAppSettingFindUnique.mockResolvedValue(null);
      const { source } = await getStripeWebhookConfig();
      expect(source).toBe("none");
    });

    it("string con espacios es trimmed y usado si es válido", async () => {
      // mockEnv ya tiene el valor limpio — cleanString en el servicio
      // hará trim() del valor que recibe de env.stripeSecretKey
      mockEnv.stripeSecretKey = "  sk_test_valid_key_no_placeholder  ";
      mockAppSettingFindUnique.mockResolvedValue(null);
      const { secretKey } = await getStripeWebhookConfig();
      // cleanString hace trim() internamente
      expect(secretKey).toBe("sk_test_valid_key_no_placeholder");
    });

    it("string vacío resulta en key vacía → source=none", async () => {
      mockEnv.stripeSecretKey = "   ";
      mockAppSettingFindUnique.mockResolvedValue(null);
      const { source } = await getStripeWebhookConfig();
      expect(source).toBe("none");
    });
  });

  describe("centsToMajor — conversión vía amount en membresía", () => {
    beforeEach(() => {
      vi.clearAllMocks();
      mockAppSettingFindUnique.mockResolvedValue(null);
      mockMembershipFindFirst.mockResolvedValue(null);
      mockUserFindFirst.mockResolvedValue({ id: "user-cents", email: "cents@example.com" });
    });

    it("1000 centavos → 10.00 en el registro de pago", async () => {
      const stripe = makeStripeMock();
      const event = makeEvent("invoice.payment_succeeded", {
        id: "in_cents_1000",
        subscription: "sub_cents",
        customer: "cus_cents",
        customer_email: "cents@example.com",
        amount_paid: 1000,
        amount_due: 1000,
        currency: "mxn",
      });

      await handleBusinessStripeEvent(event, stripe);

      const call = mockPaymentUpsert.mock.calls[0][0] as { create: { amount: number } };
      expect(call.create.amount).toBe(10);
    });

    it("0 centavos → 0.00 en el registro de pago", async () => {
      const stripe = makeStripeMock();
      const event = makeEvent("invoice.payment_succeeded", {
        id: "in_cents_0",
        subscription: "sub_cents_0",
        customer: "cus_cents_0",
        customer_email: "cents@example.com",
        amount_paid: 0,
        amount_due: 0,
        currency: "mxn",
      });

      await handleBusinessStripeEvent(event, stripe);

      const call = mockPaymentUpsert.mock.calls[0][0] as { create: { amount: number } };
      expect(call.create.amount).toBe(0);
    });
  });

  describe("toMembershipStatus — mapeo de status de Stripe", () => {
    /**
     * processSubscriptionEvent usa userId=null. Pre-populamos membresía
     * existente para verificar el status en el camino de update.
     */
    beforeEach(() => {
      vi.clearAllMocks();
      mockAppSettingFindUnique.mockResolvedValue(null);
      // Membresía existente → update path
      mockMembershipFindFirst.mockResolvedValue({ id: "mem-status", stripeSubscriptionId: "sub_status_x" });
      mockUserFindFirst.mockResolvedValue(null);
    });

    const statusCases: Array<[string, string]> = [
      ["active",             "active"],
      ["trialing",           "active"],
      ["past_due",           "past_due"],
      ["incomplete",         "pending"],
      ["incomplete_expired", "pending"],
      ["paused",             "paused"],
    ];

    for (const [stripeStatus, expected] of statusCases) {
      it(`status='${stripeStatus}' de Stripe → '${expected}' en BD`, async () => {
        vi.clearAllMocks();
        mockAppSettingFindUnique.mockResolvedValue(null);
        mockMembershipFindFirst.mockResolvedValue({ id: `mem-${stripeStatus}`, stripeSubscriptionId: `sub_status_${stripeStatus}` });
        mockUserFindFirst.mockResolvedValue(null);

        const stripe = makeStripeMock({ status: stripeStatus });
        const event = makeEvent("customer.subscription.updated", {
          id: `sub_status_${stripeStatus}`,
          status: stripeStatus,
          current_period_end: Math.floor(Date.now() / 1000) + 30 * 86400,
          cancel_at_period_end: false,
          customer: `cus_${stripeStatus}`,
          currency: "mxn",
          items: { data: [{ price: { id: "price_x" } }] },
        });

        await handleBusinessStripeEvent(event, stripe);

        const call = mockMembershipUpdate.mock.calls[0][0] as { data: Record<string, unknown> };
        expect(call.data.status).toBe(expected);
      });
    }

    it("status desconocido → 'inactive' en BD", async () => {
      vi.clearAllMocks();
      mockAppSettingFindUnique.mockResolvedValue(null);
      mockMembershipFindFirst.mockResolvedValue({ id: "mem-weird", stripeSubscriptionId: "sub_unknown_status" });
      mockUserFindFirst.mockResolvedValue(null);

      const stripe = makeStripeMock({ status: "something_weird" });
      const event = makeEvent("customer.subscription.updated", {
        id: "sub_unknown_status",
        status: "something_weird",
        current_period_end: Math.floor(Date.now() / 1000) + 30 * 86400,
        cancel_at_period_end: false,
        customer: "cus_weird",
        currency: "mxn",
        items: { data: [{ price: { id: "price_x" } }] },
      });

      await handleBusinessStripeEvent(event, stripe);

      const call = mockMembershipUpdate.mock.calls[0][0] as { data: Record<string, unknown> };
      expect(call.data.status).toBe("inactive");
    });
  });

  describe("extractExpandableId — string directo vs objeto con .id", () => {
    beforeEach(() => {
      vi.clearAllMocks();
      mockAppSettingFindUnique.mockResolvedValue(null);
      mockMembershipFindFirst.mockResolvedValue(null);
      mockUserFindFirst.mockResolvedValue({ id: "user-expand", email: "expand@example.com" });
    });

    it("acepta customer como string directo en invoice event", async () => {
      const stripe = makeStripeMock();
      const event = makeEvent("invoice.payment_succeeded", {
        id: "in_expand_str",
        subscription: "sub_expand",
        customer: "cus_string_direct",
        customer_email: "expand@example.com",
        amount_paid: 1000,
        amount_due: 1000,
        currency: "mxn",
      });

      await handleBusinessStripeEvent(event, stripe);

      // El hecho de que no lance y llame a create es suficiente para validar
      // que extractExpandableId procesó correctamente el string
      expect(mockMembershipCreate).toHaveBeenCalledTimes(1);
    });

    it("acepta customer como objeto expandido de Stripe con .id (subscription event)", async () => {
      // Stripe puede enviar el customer como objeto expandido
      // Para subscription events, necesitamos membresía existente (userId=null guard)
      mockMembershipFindFirst.mockResolvedValue({ id: "mem-expand", stripeSubscriptionId: "sub_expand_obj" });

      const stripe = makeStripeMock({ customer: { id: "cus_obj_id", object: "customer" } });
      const event = makeEvent("customer.subscription.updated", {
        id: "sub_expand_obj",
        status: "active",
        current_period_end: Math.floor(Date.now() / 1000) + 30 * 86400,
        cancel_at_period_end: false,
        customer: { id: "cus_obj_id", object: "customer" },
        currency: "mxn",
        items: { data: [{ price: { id: "price_x" } }] },
      });

      await handleBusinessStripeEvent(event, stripe);

      expect(mockMembershipUpdate).toHaveBeenCalledTimes(1);
      const call = mockMembershipUpdate.mock.calls[0][0] as { data: Record<string, unknown> };
      expect(call.data.stripeCustomerId).toBe("cus_obj_id");
    });
  });
});
