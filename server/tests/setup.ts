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
process.env.PHI_MASTER_KEY = process.env.PHI_MASTER_KEY ?? "phi-test-master-key-32-bytes-min!!";
process.env.INTEGRATIONS_ENC_KEY = process.env.INTEGRATIONS_ENC_KEY ?? "integrations-test-key-32-bytes-mn!";

// Resend keys: 6 clientes dedicados (ver CLAUDE.md / emailService.ts).
// Tests no envían email real — pero el constructor de Resend valida que
// la key no sea undefined al cargar el módulo. Stub keys placeholder.
process.env.RESEND_KEY_VERIFICATION   = process.env.RESEND_KEY_VERIFICATION   ?? "re_test_verification_stub";
process.env.RESEND_KEY_RESET          = process.env.RESEND_KEY_RESET          ?? "re_test_reset_stub";
process.env.RESEND_KEY_REMINDERS      = process.env.RESEND_KEY_REMINDERS      ?? "re_test_reminders_stub";
process.env.RESEND_KEY_DOCUMENTS      = process.env.RESEND_KEY_DOCUMENTS      ?? "re_test_documents_stub";
process.env.RESEND_KEY_ADMIN_INVITE   = process.env.RESEND_KEY_ADMIN_INVITE   ?? "re_test_admin_invite_stub";
process.env.RESEND_KEY_NOTIFICATIONS  = process.env.RESEND_KEY_NOTIFICATIONS  ?? "re_test_notifications_stub";
process.env.RESEND_FROM_EMAIL         = process.env.RESEND_FROM_EMAIL         ?? "test@velumlaser.test";

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
