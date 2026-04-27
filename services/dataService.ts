import { AuditLogEntry, LegalDocument, Member, UserRole } from "../types";
import { apiFetch, buildApiUrl } from "./apiClient";
import { MEMBERSHIPS } from "../constants";
import type { RawApiDocument, RawApiUser, AdminUsersApiResponse, AdminAuditLogsApiResponse } from "./apiTypes";

const toTitle = (type: string) => {
  switch (type) {
    case "informed_consent":
      return "Consentimiento Informado";
    case "privacy_notice":
      return "Aviso de Privacidad";
    case "medical_history":
      return "Cuestionario Médico";
    default:
      return "Documento";
  }
};

const mapDocuments = (documents: RawApiDocument[]): LegalDocument[] =>
  (documents ?? []).map((doc) => ({
    id: doc.id,
    type: doc.type as LegalDocument["type"],
    title: toTitle(doc.type),
    signed: doc.status === "signed",
    signedAt: doc.signedAt ? new Date(doc.signedAt).toLocaleDateString("es-MX") : undefined,
    version: doc.version ?? "1.0",
    signatureUrl: doc.signatureKey
  }));

const mapMember = (user: RawApiUser): Member => {
  const membership = user.memberships?.[0];
  const catalog = membership?.catalogEntry; // enriched by listUsers endpoint
  const tier = MEMBERSHIPS.find((t) => t.stripePriceId === membership?.planId);
  const name = `${user.profile?.firstName ?? ""} ${user.profile?.lastName ?? ""}`.trim() || user.email;
  return {
    id: user.id,
    name,
    email: user.email,
    role: user.role as UserRole,
    phone: user.profile?.phone,
    plan: catalog?.name ?? tier?.name ?? membership?.planCode ?? "Plan Velum",
    amount: catalog?.amount ?? tier?.price ?? membership?.amount ?? undefined,
    interval: catalog?.interval ?? "month",
    subscriptionStatus: membership?.status ?? "inactive",
    nextBillingDate: membership?.currentPeriodEnd ? new Date(membership.currentPeriodEnd).toLocaleDateString("es-MX") : undefined,
    intakeStatus: (user.medicalIntake?.status ?? "draft") as Member["intakeStatus"],
    clinical: {
      consentFormSigned: user.documents?.some((doc) => doc.status === "signed" && doc.type === "informed_consent"),
      documents: mapDocuments(user.documents ?? [])
    }
  };
};

// Unwrap paginated o legacy array response del endpoint /admin/users
const extractUsers = (resp: AdminUsersApiResponse | RawApiUser[]): RawApiUser[] => {
  if (Array.isArray(resp)) return resp;
  if (resp && Array.isArray(resp.data)) return resp.data;
  return [];
};

export const memberService = {
  getAll: async (params?: { page?: number; limit?: number; search?: string; role?: string; status?: string }): Promise<{ members: Member[]; total: number; pages: number }> => {
    const qs = new URLSearchParams();
    if (params?.page)   qs.set("page",   String(params.page));
    if (params?.limit)  qs.set("limit",  String(params.limit));
    if (params?.search) qs.set("search", params.search);
    if (params?.role)   qs.set("role",   params.role);
    if (params?.status) qs.set("status", params.status);
    const query = qs.toString() ? `?${qs.toString()}` : "";
    const resp = await apiFetch<AdminUsersApiResponse | RawApiUser[]>(`/admin/users${query}`);
    const users = extractUsers(resp);
    const paginatedResp = Array.isArray(resp) ? null : resp;
    return {
      members: users.filter((u) => u.role === "member").map(mapMember),
      total: paginatedResp?.total ?? users.length,
      pages: paginatedResp?.pages ?? 1,
    };
  },

  getById: async (id: string): Promise<Member | undefined> => {
    try {
      const user = await apiFetch<RawApiUser>(`/admin/users/${id}`);
      if (!user) return undefined;
      return mapMember(user);
    } catch {
      return undefined;
    }
  },

  updateMembershipStatus: async (userId: string, status: string): Promise<void> => {
    await apiFetch(`/admin/users/${userId}/membership`, {
      method: "PATCH",
      body: JSON.stringify({ status })
    });
  },

  createPatient: async (payload: {
    email: string;
    firstName: string;
    lastName: string;
    phone?: string;
    birthDate?: string;
    intake?: {
      personalJson?: Record<string, unknown>;
      historyJson?: Record<string, unknown>;
      phototype?: number;
      consentAccepted?: boolean;
      signatureKey?: string;
    };
    planCode?: string;
    activateMembership?: boolean;
    sendCredentials?: boolean;
  }): Promise<{ message: string; patient: { id: string; email: string }; inviteEmailSent: boolean }> => {
    return apiFetch('/admin/patients', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  },

  adminUpdatePatientIntake: async (userId: string, intake: {
    personalJson?: Record<string, unknown>;
    historyJson?: Record<string, unknown>;
    phototype?: number;
    consentAccepted?: boolean;
    signatureKey?: string;
  }): Promise<void> => {
    await apiFetch(`/admin/patients/${userId}/intake`, {
      method: 'PUT',
      body: JSON.stringify(intake)
    });
  },

  adminActivateMembership: async (userId: string, planCode: string): Promise<void> => {
    await apiFetch(`/admin/patients/${userId}/activate-membership`, {
      method: 'POST',
      body: JSON.stringify({ planCode, status: 'active' })
    });
  },
};

export const documentService = {
  listMy: async (): Promise<LegalDocument[]> => {
    const docs = await apiFetch<RawApiDocument[]>('/documents');
    return mapDocuments(docs);
  },
  signDocument: async (docId: string, signature: string): Promise<void> => {
    await apiFetch(`/documents/${docId}/sign`, {
      method: "POST",
      body: JSON.stringify({ signature })
    });
  },
  downloadDocument: async (docId: string, filename: string): Promise<void> => {
    const resp = await fetch(buildApiUrl(`/documents/${docId}`), { credentials: "include" });
    if (!resp.ok) throw new Error("No se pudo descargar el documento");
    const blob = await resp.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }
};

export const auditService = {
  getLogs: async (): Promise<AuditLogEntry[]> => {
    const resp = await apiFetch<AdminAuditLogsApiResponse>("/admin/audit-logs");
    // Backend devuelve { data: logs[], pagination } — extraer el array defensivamente
    const logs = Array.isArray(resp) ? resp : (resp?.data ?? []);
    return logs.map((log) => ({
      id: log.id,
      timestamp: log.createdAt,
      user: log.actorUser?.email ?? log.user?.email ?? "system",
      role: (log.actorUser?.role ?? log.user?.role ?? "admin") as UserRole,
      action: log.action,
      resource: log.resourceId ?? log.resourceType ?? log.metadata?.targetUserId ?? log.metadata?.documentId ?? "-",
      ip: log.ip ?? log.metadata?.ip ?? "—",
      status: (log.result ?? "success") as AuditLogEntry["status"]
    }));
  }
};
