export type ZoneId = string;

export interface Zone {
  id: ZoneId;
  name: string;
  description: string;
}

export interface MembershipTier {
  id: number;
  name: string;
  price: number;
  maxZones: number; 
  description: string;
  isFullBody: boolean;
  stripePriceId: string;
}

export interface UserSubscription {
  membershipId: number;
  selectedZones: ZoneId[];
  startDate: string;
  status: SubscriptionStatus;
}

// --- SECURITY & COMPLIANCE TYPES ---

export type UserRole = 'admin' | 'staff' | 'member' | 'system';
export type MedicalIntakeStatus = 'draft' | 'submitted' | 'approved' | 'rejected';
export type SubscriptionStatus = 'active' | 'pending' | 'canceled' | 'past_due' | 'paused';

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  user: string;
  role: UserRole;
  action: string;
  resource: string;
  ip: string; // Critical for audit
  status: 'success' | 'failed';
}

export interface LegalDocument {
  id: string;
  type: 'informed_consent' | 'privacy_notice' | 'medical_history';
  title: string;
  signed: boolean;
  signedAt?: string;
  signatureUrl?: string; // Base64 signature
  version: string;
}

export interface Member {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  phone?: string;
  dob?: string;
  plan?: string;
  amount?: number;
  subscriptionStatus?: string;
  nextBillingDate?: string;
  lastPaymentDate?: string;
  paymentMethod?: { type: string; last4: string; expiry: string };
  intakeStatus?: MedicalIntakeStatus;
  clinical?: {
    fitzpatrickType?: string;
    allergies?: string;
    medications?: string;
    surgicalHistory?: string;
    consentFormSigned?: boolean;
    lastUpdate?: string;
    sessions?: SessionSummary[];
    documents?: LegalDocument[];
  };
}

export interface SessionSummary {
  id: string;
  date: string;
  zone?: string;
  staff?: string;
  feedback?: string;
}
