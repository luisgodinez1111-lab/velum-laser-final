import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    setupFiles: ["./tests/setup.ts"],
    // Vars requeridas por env.ts, aplicadas ANTES de cargar los módulos (setup.ts
    // corre demasiado tarde para el hoisting de ESM). El patrón `process.env.X ||`
    // respeta los valores reales de CI/entorno cuando existen. Los tests mockean
    // Prisma, así que estos valores solo satisfacen la validación de env.ts.
    env: {
      NODE_ENV:             process.env.NODE_ENV             || "test",
      DATABASE_URL:         process.env.DATABASE_URL         || "postgresql://test:test@localhost:5432/velum_test",
      JWT_SECRET:           process.env.JWT_SECRET           || "test-secret-32-bytes-minimum-length!!",
      INTEGRATIONS_ENC_KEY: process.env.INTEGRATIONS_ENC_KEY || "integrations-test-key-32-bytes-mn!",
      PHI_MASTER_KEY:       process.env.PHI_MASTER_KEY       || "phi-test-master-key-32-bytes-min!!",
      CORS_ORIGIN:          process.env.CORS_ORIGIN          || "http://localhost:5173",
    },
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      reportsDirectory: "./coverage",
      exclude: [
        "src/index.ts",
        "src/routes/**",
        "src/db/prisma.ts",
        "src/utils/logger.ts",
        "dist/**",
        "tests/**",
        "prisma/**",
        "**/*.d.ts",
      ],
      // Umbrales — se irán subiendo conforme avancen las fases
      // Fase 0: solo medición (sin umbral que falle el CI)
      // thresholds: { lines: 80, functions: 80, branches: 70 }
    },
  },
});
