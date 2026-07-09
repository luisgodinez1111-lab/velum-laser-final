import js from "@eslint/js";
import tsParser from "@typescript-eslint/parser";
import tsPlugin from "@typescript-eslint/eslint-plugin";

export default [
  js.configs.recommended,
  {
    files: ["**/*.ts"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        sourceType: "module",
        ecmaVersion: "latest"
      }
    },
    plugins: { "@typescript-eslint": tsPlugin },
    rules: {
      // TypeScript (vía `tsc --noEmit` en CI) ya valida identificadores no
      // definidos. La regla core de ESLint no conoce los globales de Node
      // (process, Buffer, fetch, setTimeout…) y generaba 214 falsos positivos.
      // typescript-eslint la desactiva por diseño para código TS.
      "no-undef": "off",
      // La regla base no entiende tipos/enums/interfaces y choca con TS;
      // usamos únicamente la versión TS-aware.
      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }
      ]
    }
  }
];
