import tsParser from "@typescript-eslint/parser";
import reactHooks from "eslint-plugin-react-hooks";

// Config enfocado a propósito: solo `rules-of-hooks` como error. Esa regla
// atrapa hooks llamados condicionalmente o tras un early return — exactamente
// la clase de bug que causó el crash #310 en producción y que ningún gate
// detectaba. Mantenemos el resto en off para no inundar de warnings ni bloquear
// el CI por estilo; el objetivo es blindar contra violaciones de hooks.
export default [
  {
    ignores: ["dist/**", "node_modules/**", "server/**", "public/**"],
  },
  {
    files: ["**/*.{ts,tsx}"],
    // Con exhaustive-deps en off, las directivas `eslint-disable` de esa regla
    // quedan "sin usar"; no las reportamos para no meter ruido y para preservar
    // la intención por si algún día se activa exhaustive-deps.
    linterOptions: { reportUnusedDisableDirectives: "off" },
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaFeatures: { jsx: true },
        sourceType: "module",
        ecmaVersion: "latest",
      },
    },
    plugins: { "react-hooks": reactHooks },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "off",
    },
  },
];
