// Shared TypeScript interfaces for API responses.
// Import these instead of using apiFetch<any> for better type safety.

export interface NotificationItem {
  id: string;
  type: string;
  title: string;
  body: string | null;
  read: boolean;
  readAt: string | null;
  createdAt: string;
  data?: Record<string, unknown>;
}

export interface NotificationListResponse {
  items: NotificationItem[];
  total: number;
  unread: number;
}

export interface UnreadCountResponse {
  count: number;
}

export interface AuditLogItem {
  id: string;
  action: string;
  result: 'success' | 'failed';
  createdAt: string;
  ip?: string | null;
  actorUser?: { id: string; email: string; role: string } | null;
  targetUser?: { id: string; email: string; role: string } | null;
}

export interface AuditLogListResponse {
  logs: AuditLogItem[];
  total: number;
  page: number;
  limit: number;
  pages: number;
}

export interface PaymentItem {
  id: string;
  amount?: number | null;
  currency?: string | null;
  status: string;
  createdAt: string;
  paidAt?: string | null;
  user?: { email?: string; profile?: { fullName?: string } } | null;
}

export interface PaymentListResponse {
  payments: PaymentItem[];
  total: number;
  page: number;
  pages: number;
}

export interface ServerReports {
  users: number;
  activeMemberships: number;
  pastDueMemberships: number;
  pendingDocuments: number;
}

export interface UserProfile {
  fullName: string;
  email: string;
  phone: string;
}

// ── Auth endpoints ────────────────────────────────────────────────────────────

/** Respuesta de GET /users/me */
export interface MeApiResponse {
  id: string;
  email: string;
  role: string;
  mustChangePassword?: boolean;
  profile?: {
    firstName?: string | null;
    lastName?: string | null;
    phone?: string | null;
    birthDate?: string | null;
  } | null;
}

// ── Admin users endpoints ─────────────────────────────────────────────────────

/** Documento raw tal como lo devuelve el backend */
export interface RawApiDocument {
  id: string;
  type: string;
  status: string;
  signedAt: string | null;
  signatureKey?: string | null;
  version?: string | null;
}

/** Usuario raw tal como lo devuelve GET /admin/users o GET /admin/users/:id */
export interface RawApiUser {
  id: string;
  email: string;
  role: string;
  createdAt: string;
  isActive: boolean;
  deletedAt: string | null;
  mustChangePassword?: boolean;
  profile?: {
    firstName?: string | null;
    lastName?: string | null;
    phone?: string | null;
    birthDate?: string | null;
  } | null;
  memberships?: Array<{
    id?: string;
    status?: string | null;
    planId?: string | null;
    planCode?: string | null;
    amount?: number | null;
    currentPeriodEnd?: string | null;
    source?: string | null;
    catalogEntry?: {
      name?: string;
      amount?: number;
      interval?: string;
    } | null;
  }>;
  documents?: RawApiDocument[];
  medicalIntake?: { status?: string | null } | null;
}

/** Respuesta paginada de GET /admin/users */
export interface AdminUsersApiResponse {
  data: RawApiUser[];
  total: number;
  page: number | null;
  limit: number;
  pages: number;
  nextCursor: string | null;
}

/** Respuesta de GET /admin/audit-logs */
export interface AdminAuditLogsApiResponse {
  data: Array<{
    id: string;
    action: string;
    result?: string | null;
    createdAt: string;
    ip?: string | null;
    resourceId?: string | null;
    resourceType?: string | null;
    metadata?: Record<string, unknown> | null;
    actorUser?: { id: string; email: string; role: string } | null;
    user?: { id: string; email: string; role: string } | null;
    targetUser?: { id: string; email: string; role: string } | null;
  }>;
  pagination?: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}
