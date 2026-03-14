import { UserRole } from "../types";
import { apiFetch } from "./apiClient";

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
}

const mapUser = (user: any): AuthUser => {
  const firstName = user?.profile?.firstName ?? "";
  const lastName = user?.profile?.lastName ?? "";
  const name = `${firstName} ${lastName}`.trim() || user.email;
  return {
    id: user.id,
    name,
    email: user.email,
    role: user.role
  };
};

export const authService = {
  login: async (email: string, password: string): Promise<AuthUser> => {
    await apiFetch("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password })
    });
    const me = await apiFetch<any>("/users/me");
    return mapUser(me);
  },

  register: async (payload: { email: string; password: string; firstName?: string; lastName?: string; phone?: string; birthDate?: string }) => {
    await apiFetch("/auth/register", {
      method: "POST",
      body: JSON.stringify(payload)
    });
    const me = await apiFetch<any>("/users/me");
    return mapUser(me);
  },

  logout: async () => {
    await apiFetch("/auth/logout", { method: "POST" });
  },

  verifySession: async (): Promise<AuthUser | null> => {
    try {
      const me = await apiFetch<any>("/users/me");
      return mapUser(me);
    } catch {
      return null;
    }
  },

  // ── Recuperación de contraseña con OTP ──────────────────────────────
  forgotPassword: async (email: string): Promise<void> => {
    await apiFetch("/auth/forgot-password", {
      method: "POST",
      body: JSON.stringify({ email })
    });
  },

  resetPassword: async (email: string, otp: string, password: string): Promise<void> => {
    await apiFetch("/auth/reset-password", {
      method: "POST",
      body: JSON.stringify({ email, otp, password })
    });
  },

  // ── Verificación de correo con OTP ──────────────────────────────────
  verifyEmail: async (email: string, otp: string): Promise<void> => {
    await apiFetch("/auth/verify-email", {
      method: "POST",
      body: JSON.stringify({ email, otp })
    });
  },

  resendVerification: async (email: string): Promise<void> => {
    await apiFetch("/auth/resend-verification", {
      method: "POST",
      body: JSON.stringify({ email })
    });
  }
};
