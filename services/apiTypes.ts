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
