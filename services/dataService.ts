import { AuditLogEntry, LegalDocument, Member, UserRole } from "../types";
import { apiFetch } from "./apiClient";
import { MEMBERSHIPS } from "../constants";

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

const mapDocuments = (documents: any[]): LegalDocument[] =>
  (documents ?? []).map((doc) => ({
    id: doc.id,
    type: doc.type as LegalDocument["type"],
    title: toTitle(doc.type),
    signed: doc.status === "signed",
    signedAt: doc.signedAt ? new Date(doc.signedAt).toLocaleDateString("es-MX") : undefined,
    version: doc.version ?? "1.0",
    signatureUrl: doc.signatureKey
  }));

const mapMember = (user: any): Member => {
  const membership = user.memberships?.[0];
  const tier = MEMBERSHIPS.find((t) => t.stripePriceId === membership?.planId);
  const name = `${user.profile?.firstName ?? ""} ${user.profile?.lastName ?? ""}`.trim() || user.email;
  return {
    id: user.id,
    name,
    email: user.email,
    role: user.role as UserRole,
    phone: user.profile?.phone,
    plan: tier?.name ?? "Plan Velum",
    subscriptionStatus: membership?.status ?? "inactive",
    nextBillingDate: membership?.currentPeriodEnd ? new Date(membership.currentPeriodEnd).toLocaleDateString("es-MX") : undefined,
    clinical: {
      consentFormSigned: user.documents?.some((doc: any) => doc.status === "signed" && doc.type === "informed_consent"),
      documents: mapDocuments(user.documents ?? [])
    }
  };
};

export const memberService = {
  getAll: async (): Promise<Member[]> => {
    const users = await apiFetch<any[]>("/admin/users");
    return users.filter((user) => user.role === "member").map(mapMember);
  },

  getById: async (id: string): Promise<Member | undefined> => {
    const user = await apiFetch<any>("/me");
    if (user.id !== id || user.role !== "member") {
      return undefined;
    }
    return mapMember(user);
  },

  updateMembershipStatus: async (userId: string, status: string): Promise<void> => {
    await apiFetch(`/admin/users/${userId}/membership`, {
      method: "PATCH",
      body: JSON.stringify({ status })
    });
  }
};

export const documentService = {
  signDocument: async (docId: string, signature: string): Promise<void> => {
    await apiFetch(`/documents/${docId}/sign`, {
      method: "POST",
      body: JSON.stringify({ signature })
    });
  }
};

export const auditService = {
  getLogs: async (): Promise<AuditLogEntry[]> => {
    const logs = await apiFetch<any[]>("/admin/audit-logs");
    return logs.map((log) => ({
      id: log.id,
      timestamp: new Date(log.createdAt).toLocaleString("es-MX"),
      user: log.actorUser?.email ?? log.user?.email ?? "system",
      role: (log.actorUser?.role ?? log.user?.role ?? "admin") as UserRole,
      action: log.action,
      resource: log.resourceId ?? log.resourceType ?? log.metadata?.targetUserId ?? log.metadata?.documentId ?? "-",
      ip: log.ip ?? log.metadata?.ip ?? "N/A",
      status: (log.result ?? "success") as AuditLogEntry["status"]
    }));
  }
};
