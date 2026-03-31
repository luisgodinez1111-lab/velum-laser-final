/**
 * Setup global para todos los tests de Vitest.
 * Se ejecuta antes de cada archivo de test.
 *
 * NOTA: Los tests individuales pueden sobreescribir estas variables de entorno
 * si necesitan valores específicos distintos.
 */
import { vi, beforeEach } from "vitest";

// Variables de entorno mínimas requeridas por el servidor
process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "test-secret-32-bytes-minimum-length!!";
process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/velum_test";
process.env.COOKIE_NAME = "access_token";
process.env.REFRESH_COOKIE_NAME = "refresh_token";
process.env.FRONTEND_URL = "http://localhost:5173";
process.env.BASE_URL = "http://localhost:4000";

// Mock del logger para evitar output en tests
vi.mock("../src/utils/logger", () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    trace: vi.fn(),
    child: vi.fn().mockReturnThis(),
  },
}));

// Limpiar todos los mocks entre tests
beforeEach(() => {
  vi.clearAllMocks();
});
