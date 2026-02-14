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
  status: 'active' | 'pending' | 'canceled' | 'past_due' | 'paused';
}

export enum Resolution {
  ONE_K = '1K',
  TWO_K = '2K',
  FOUR_K = '4K'
}

// --- SECURITY & COMPLIANCE TYPES ---

export type UserRole = 'admin' | 'staff' | 'member' | 'system';

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
  history?: any[];
  clinical?: {
    fitzpatrickType?: string;
    allergies?: string;
    medications?: string;
    surgicalHistory?: string;
    consentFormSigned?: boolean;
    lastUpdate?: string;
    sessions?: any[];
    documents?: LegalDocument[];
  };
  passwordHash?: string;
}

// --- PHASE 1: MEDICAL INTAKE, APPOINTMENTS, LEADS ---

export type IntakeStatus = 'draft' | 'submitted' | 'approved' | 'rejected';
export type AppointmentStatus = 'pending' | 'confirmed' | 'in_progress' | 'completed' | 'canceled' | 'no_show';
export type AppointmentType = 'valuation' | 'treatment' | 'follow_up';
export type LeadStatus = 'new_lead' | 'contacted' | 'qualified' | 'converted' | 'lost';
export type LeadSource = 'website' | 'instagram' | 'facebook' | 'referral' | 'walk_in' | 'phone' | 'whatsapp' | 'other';

export interface MedicalIntakeData {
  id: string;
  userId: string;
  status: IntakeStatus;
  fitzpatrickType?: string;
  questionnaire: Record<string, unknown>;
  contraindications: string[];
  contraindicationNotes?: string;
  signatureKey?: string;
  signedAt?: string;
  reviewedAt?: string;
  reviewNotes?: string;
  reviewedBy?: { profile?: { firstName?: string; lastName?: string } };
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface AppointmentData {
  id: string;
  userId: string;
  staffUserId?: string;
  type: AppointmentType;
  status: AppointmentStatus;
  scheduledAt: string;
  durationMin: number;
  zones: string[];
  notes?: string;
  cancelReason?: string;
  canceledAt?: string;
  user?: { email: string; profile?: { firstName?: string; lastName?: string } };
  staff?: { profile?: { firstName?: string; lastName?: string } };
  createdAt: string;
  updatedAt: string;
}

export interface ScheduleSlot {
  time: string;
  available: boolean;
}

export interface LeadData {
  id: string;
  firstName: string;
  lastName?: string;
  email?: string;
  phone: string;
  source: LeadSource;
  status: LeadStatus;
  notes?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmContent?: string;
  utmTerm?: string;
  referrerUrl?: string;
  convertedUserId?: string;
  convertedAt?: string;
  assignedTo?: { profile?: { firstName?: string; lastName?: string } };
  createdAt: string;
  updatedAt: string;
}

// --- PHASE 2: SESSIONS, NOTIFICATIONS, MARKETING, ANALYTICS ---

export type NotificationType = 'in_app' | 'email' | 'whatsapp';
export type NotificationStatus = 'pending' | 'sent' | 'failed' | 'read';

export interface SessionTreatmentData {
  id: string;
  appointmentId: string;
  userId: string;
  staffUserId: string;
  zones: string[];
  laserSettings: Record<string, unknown>;
  skinResponse?: string;
  fitzpatrickUsed?: string;
  energyDelivered?: string;
  notes?: string;
  beforePhotoKey?: string;
  afterPhotoKey?: string;
  appointment?: { scheduledAt: string; type: string; status: string };
  staff?: { profile?: { firstName?: string; lastName?: string } };
  createdAt: string;
}

export interface NotificationData {
  id: string;
  userId: string;
  type: NotificationType;
  status: NotificationStatus;
  title: string;
  body: string;
  readAt?: string;
  createdAt: string;
}

export interface AnalyticsOverview {
  totalUsers: number;
  totalLeads: number;
  totalAppointments: number;
  activeMembers: number;
  pendingIntakes: number;
}

// --- PHASE 3: TREATMENT PLANS, INVOICES, FILES, ONBOARDING ---

export type PlanStatus = 'active' | 'completed' | 'paused' | 'canceled';
export type InvoiceStatus = 'pending' | 'paid' | 'failed' | 'refunded';
export type FileCategory = 'before_photo' | 'after_photo' | 'consent_doc' | 'intake_doc' | 'other';

export interface TreatmentPlanData {
  id: string;
  userId: string;
  membershipId: string;
  zones: string[];
  totalSessions: number;
  completedSessions: number;
  status: PlanStatus;
  startDate: string;
  expectedEndDate?: string;
  notes?: string;
  createdAt: string;
}

export interface InvoiceData {
  id: string;
  userId: string;
  amount: number;
  currency: string;
  status: InvoiceStatus;
  description?: string;
  paidAt?: string;
  createdAt: string;
}

export interface FileUploadData {
  id: string;
  userId: string;
  category: FileCategory;
  fileName: string;
  mimeType: string;
  size: number;
  storageKey: string;
  entityType?: string;
  entityId?: string;
  createdAt: string;
}

export interface OnboardingStatus {
  profileComplete: boolean;
  intakeSubmitted: boolean;
  intakeApproved: boolean;
  membershipActive: boolean;
  hasAppointment: boolean;
  completionPercent: number;
  nextStep: string;
}

// Window augmentation for AI Studio
declare global {
  interface AIStudio {
    hasSelectedApiKey: () => Promise<boolean>;
    openSelectKey: () => Promise<void>;
  }
}
