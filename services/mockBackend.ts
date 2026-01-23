import { Member, AuditLogEntry, UserRole } from "../types";

// --- MOCK DATABASE (Simulating PostgreSQL tables) ---

export const DB = {
  users: [
    { 
        id: 1, 
        email: 'ana.garcia@gmail.com',
        passwordHash: 'hashed_secret_123', // Simulated bcrypt
        role: 'member' as UserRole,
        name: 'Ana García', 
        phone: '+52 55 1234 5678',
        dob: '1990-05-15',
        plan: 'Advance (2 Zonas)', 
        amount: 799,
        subscriptionStatus: 'active', 
        nextBillingDate: '25 Nov 2024',
        lastPaymentDate: '25 Oct 2024',
        paymentMethod: { type: 'Visa', last4: '4242', expiry: '12/26' },
        history: [
          { id: 'tx_01', date: '25 Oct 2024', amount: 799, status: 'paid', method: 'Visa 4242', description: 'Mensualidad Octubre' },
        ],
        clinical: {
          fitzpatrickType: 'III',
          allergies: 'Penicilina',
          medications: 'Ninguno',
          surgicalHistory: 'Cesárea (2018)',
          consentFormSigned: true,
          lastUpdate: '25 Oct 2024',
          sessions: [],
          documents: [
            { id: 'doc_1', title: 'Aviso de Privacidad', type: 'privacy_notice', signed: true, version: '1.0', signedAt: '2024-01-01' }
          ]
        }
    },
    { 
        id: 5, 
        email: 'luis.orozco@empresa.com', 
        passwordHash: 'hashed_secret_456',
        role: 'member' as UserRole,
        name: 'Luis Orozco', 
        phone: '+52 55 1111 2222',
        dob: '1985-08-20',
        plan: 'Select', 
        amount: 699,
        subscriptionStatus: 'past_due', 
        nextBillingDate: '22 Oct 2024', 
        lastPaymentDate: '22 Sep 2024',
        paymentMethod: { type: 'Mastercard', last4: '5544', expiry: '01/24' }, 
        history: [],
        clinical: {
          fitzpatrickType: 'IV',
          allergies: 'Negativo',
          medications: 'Omeprazol',
          surgicalHistory: 'Negativo',
          consentFormSigned: false, 
          lastUpdate: '22 Sep 2024',
          sessions: [],
          documents: [
             { id: 'doc_2', title: 'Consentimiento Informado', type: 'informed_consent', signed: false, version: '2.0' }
          ]
        }
    },
    // Admin & Staff Users - Using Partial<Member> + specific properties for Auth
    { 
      id: 99, 
      email: 'admin@velum.com', 
      passwordHash: 'velum', 
      role: 'admin' as UserRole, 
      name: 'Super Admin',
      clinical: { documents: [] } // Empty clinical for admins
    },
    { 
      id: 100, 
      email: 'recepcion@velum.com', 
      passwordHash: 'velum', 
      role: 'reception' as UserRole, 
      name: 'Recepción Principal',
      clinical: { documents: [] }
    }
  ] as Member[], 
  
  auditLogs: [
    { id: '1', timestamp: '2024-10-25 09:15:22', user: 'admin@velum.com', role: 'admin', action: 'Acceso Expediente Clínico', resource: 'Socio ID: 1', ip: '192.168.1.10', status: 'success' },
  ] as AuditLogEntry[]
};

// --- HELPER TO SIMULATE NETWORK LATENCY ---
export const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));