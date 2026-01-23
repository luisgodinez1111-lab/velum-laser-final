import { UserRole } from "../types";
import { DB, delay } from "./mockBackend";

interface AuthResponse {
  user: {
    id: number;
    name: string;
    email: string;
    role: UserRole;
  };
  token: string; // JWT simulation
}

export const authService = {
  login: async (email: string, password: string): Promise<AuthResponse> => {
    await delay(800); // Simulate network request
    
    // In production: POST /api/auth/login -> Backend verifies hash(password)
    const user = DB.users.find(u => u.email === email && u.passwordHash === password); // Simplistic check for mock
    
    if (!user) {
      throw new Error("Credenciales inválidas.");
    }

    // Simulate JWT creation
    const token = `fake_jwt_token_${user.id}_${Date.now()}`;
    
    // Log login action (Security Audit)
    DB.auditLogs.unshift({
        id: Date.now().toString(),
        timestamp: new Date().toLocaleString(),
        user: user.email,
        role: user.role,
        action: 'Login',
        resource: 'Auth System',
        ip: '127.0.0.1', // Mock IP
        status: 'success'
    });

    return {
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
      token
    };
  },

  logout: async () => {
    await delay(200);
    // In production: POST /api/auth/logout (invalidate session)
  },

  // Simulates verifying the JWT on page load
  verifySession: async (token: string): Promise<AuthResponse['user'] | null> => {
     await delay(500);
     // In real app, verify signature. Here, we just assume token exists = valid user.
     if(!token) return null;
     
     // Mock: find user based on dummy token structure or just return admin for demo
     if(token.includes('admin')) return DB.users.find(u => u.role === 'admin');
     return null; // For simplicity in this mock, only explicit login persists state correctly in context
  }
};