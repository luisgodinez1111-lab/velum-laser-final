import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { UserRole } from '../types';
import { AuthUser, authService } from '../services/authService';

interface RegisterPayload {
  email: string;
  password: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  birthDate?: string;
}

interface AuthContextType {
  user: AuthUser | null;
  isAuthenticated: boolean;
  /** True only during the initial session check on app mount */
  isSessionLoading: boolean;
  /** True during login / register / logout actions */
  isActionLoading: boolean;
  /** @deprecated Use isSessionLoading. Kept for backward compatibility. */
  isLoading: boolean;
  login: (email: string, pass: string) => Promise<AuthUser>;
  register: (payload: RegisterPayload) => Promise<AuthUser>;
  logout: () => Promise<void>;
  hasRole: (roles: UserRole[]) => boolean;
  mustChangePassword: boolean;
  clearMustChangePassword: () => void;
  /** True when a new member should complete first-time onboarding */
  needsOnboarding: boolean;
  completeOnboarding: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isSessionLoading, setIsSessionLoading] = useState(true);
  const [isActionLoading, setIsActionLoading] = useState(false);
  const [mustChangePassword, setMustChangePassword] = useState(false);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);

  useEffect(() => {
    let isMounted = true;
    authService.verifySession()
      .then((userData) => {
        if (!isMounted) return;
        if (userData) {
          setUser(userData);
          setMustChangePassword(userData.mustChangePassword ?? false);
        }
      })
      .catch(() => { /* Session expired or network error — user is unauthenticated */ })
      .finally(() => { if (isMounted) setIsSessionLoading(false); });
    return () => { isMounted = false; };
  }, []);

  // Re-verificar sesión cada 5 min: detecta cambios de rol o cuenta desactivada
  useEffect(() => {
    if (!user) return;
    const interval = setInterval(() => {
      authService.verifySession()
        .then((userData) => {
          if (!userData) {
            setUser(null);
            return;
          }
          // Actualizar solo si el rol o estado activo cambió
          setUser((prev) => {
            if (!prev) return userData;
            if (prev.role !== userData.role) return userData;
            return prev;
          });
        })
        .catch(() => { /* Error de red — mantener sesión actual */ });
    }, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [user?.id]);

  // Auto-logout por inactividad (30 min sin actividad del usuario)
  useEffect(() => {
    if (!user) return;

    const INACTIVITY_MS = 30 * 60 * 1000;
    let timer: ReturnType<typeof setTimeout>;

    const resetTimer = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        authService.logout().catch(() => {});
        setUser(null);
      }, INACTIVITY_MS);
    };

    const events = ["mousedown", "keydown", "touchstart", "scroll"] as const;
    events.forEach(e => window.addEventListener(e, resetTimer, { passive: true }));
    resetTimer(); // inicia el timer al montar

    return () => {
      clearTimeout(timer);
      events.forEach(e => window.removeEventListener(e, resetTimer));
    };
  }, [user?.id]);

  const login = useCallback(async (email: string, pass: string): Promise<AuthUser> => {
    setIsActionLoading(true);
    try {
      const userData = await authService.login(email, pass);
      setUser(userData);
      setMustChangePassword(userData.mustChangePassword ?? false);
      return userData;
    } finally {
      setIsActionLoading(false);
    }
  }, []);

  const register = useCallback(async (payload: RegisterPayload): Promise<AuthUser> => {
    setIsActionLoading(true);
    try {
      const userData = await authService.register(payload);
      setUser(userData);
      return userData;
    } finally {
      setIsActionLoading(false);
    }
  }, []);

  const logout = useCallback(async () => {
    setIsActionLoading(true);
    try {
      await authService.logout();
    } finally {
      setUser(null);
      setIsActionLoading(false);
    }
  }, []);

  const hasRole = useCallback(
    (allowedRoles: UserRole[]): boolean => !!user && allowedRoles.includes(user.role),
    [user]
  );

  const clearMustChangePassword = useCallback(() => {
    setMustChangePassword(false);
    // New members created by admin need to complete first-time onboarding
    setUser((prev) => {
      if (prev?.role === 'member') setNeedsOnboarding(true);
      return prev;
    });
  }, []);

  const completeOnboarding = useCallback(() => setNeedsOnboarding(false), []);

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        isSessionLoading,
        isActionLoading,
        isLoading: isSessionLoading, // backward-compat alias
        login,
        register,
        logout,
        hasRole,
        mustChangePassword,
        clearMustChangePassword,
        needsOnboarding,
        completeOnboarding,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};
