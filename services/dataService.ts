import { Member, AuditLogEntry, LegalDocument, UserRole } from "../types";
import { DB, delay } from "./mockBackend";

// --- MEMBER MANAGEMENT ---
export const memberService = {
  getAll: async (): Promise<Member[]> => {
    await delay(600);
    // Filter out admin users from the member list
    return DB.users.filter(u => u.role === 'member') as Member[];
  },

  getById: async (id: number): Promise<Member | undefined> => {
    await delay(300);
    return DB.users.find(u => u.id === id && u.role === 'member') as Member;
  },

  update: async (id: number, data: Partial<Member>, actor: string): Promise<Member> => {
    await delay(500);
    const index = DB.users.findIndex(u => u.id === id);
    if (index === -1) throw new Error("User not found");
    
    DB.users[index] = { ...DB.users[index], ...data };
    
    // AUDIT LOG
    DB.auditLogs.unshift({
        id: Date.now().toString(),
        timestamp: new Date().toLocaleString(),
        user: actor,
        role: 'admin', // assuming admin did this
        action: 'Update Member Profile',
        resource: `Member ID: ${id}`,
        ip: '127.0.0.1',
        status: 'success'
    });

    return DB.users[index] as Member;
  }
};

// --- DOCUMENT & COMPLIANCE ---
export const documentService = {
  signDocument: async (userId: number, docId: string, signature: string): Promise<void> => {
    await delay(1000); // Simulate S3 upload of signature image
    
    const user = DB.users.find(u => u.id === userId);
    if (!user) throw new Error("User not found");

    // Logic for Dashboard "Compliance Blocker"
    if (user.clinical && user.clinical.documents) {
        // Check clinical docs
        const doc = user.clinical.documents.find((d: any) => d.id === docId);
        if (doc) {
             doc.signed = true;
             doc.signatureUrl = signature;
             doc.signedAt = new Date().toLocaleString();
        } 
        // Also check if it's the "Consent Form" boolean on the user root
        if(docId.includes('consent') || docId === 'doc_2') {
            user.clinical.consentFormSigned = true;
        }
    }
    
    // AUDIT LOG
    DB.auditLogs.unshift({
        id: Date.now().toString(),
        timestamp: new Date().toLocaleString(),
        user: user.email,
        role: 'member',
        action: 'Digital Signature',
        resource: `Document ID: ${docId}`,
        ip: '127.0.0.1',
        status: 'success'
    });
  }
};

// --- AUDIT LOGS ---
export const auditService = {
  getLogs: async (): Promise<AuditLogEntry[]> => {
    await delay(400);
    return [...DB.auditLogs];
  }
};