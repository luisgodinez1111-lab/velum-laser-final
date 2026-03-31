/**
 * Setup global para tests del frontend (Vitest).
 * Los tests de componentes React deben agregar:
 * // @vitest-environment jsdom
 * al inicio del archivo.
 */
import { vi, beforeEach } from "vitest";

// Variables de entorno del frontend
process.env.NODE_ENV = "test";
process.env.VITE_API_URL = "/api";

beforeEach(() => {
  vi.clearAllMocks();
});
