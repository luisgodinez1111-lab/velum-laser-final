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
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isSessionLoading, setIsSessionLoading] = useState(true);
  const [isActionLoading, setIsActionLoading] = useState(false);

  useEffect(() => {
    authService.verifySession()
      .then((userData) => { if (userData) setUser(userData); })
      .catch(() => { /* Session expired or network error — user is unauthenticated */ })
      .finally(() => setIsSessionLoading(false));
  }, []);

  const login = useCallback(async (email: string, pass: string): Promise<AuthUser> => {
    setIsActionLoading(true);
    try {
      const userData = await authService.login(email, pass);
      setUser(userData);
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
