import { describe, it, expect, beforeEach, afterEach } from "vitest";

describe("resolveBaseUrl", () => {
  const originalEnv = process.env.STRIPE_CHECKOUT_BASE_URL;

  beforeEach(() => {
    delete process.env.STRIPE_CHECKOUT_BASE_URL;
  });

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.STRIPE_CHECKOUT_BASE_URL = originalEnv;
    } else {
      delete process.env.STRIPE_CHECKOUT_BASE_URL;
    }
  });

  it("usa env var cuando está configurada", async () => {
    process.env.STRIPE_CHECKOUT_BASE_URL = "https://velumlaser.com/";
    // Force reimport to pick up env change
    const mod = await import("../src/utils/baseUrl?t=" + Date.now());
    expect(mod.resolveBaseUrl()).toBe("https://velumlaser.com");
  });

  it("elimina trailing slash", async () => {
    process.env.STRIPE_CHECKOUT_BASE_URL = "https://velumlaser.com///";
    const mod = await import("../src/utils/baseUrl?t=" + Date.now() + "1");
    expect(mod.resolveBaseUrl()).toBe("https://velumlaser.com");
  });

  it("retorna fallback cuando no hay env var", async () => {
    const mod = await import("../src/utils/baseUrl?t=" + Date.now() + "2");
    expect(mod.resolveBaseUrl()).toBe("https://velumlaser.com");
  });
});
