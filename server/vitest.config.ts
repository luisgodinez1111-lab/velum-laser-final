import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    setupFiles: ["./tests/setup.ts"],
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
