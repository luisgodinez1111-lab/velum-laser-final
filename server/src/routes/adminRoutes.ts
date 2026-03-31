import { Router } from "express";
import { requireAuth, requireRole } from "../middlewares/auth";
import { listUsers, getUserById, updateUserRole, createPatient, getMemberHistory, exportUsers } from "../controllers/userAdminController";
import { listMemberships, updateMembershipStatus, adminActivateMembership } from "../controllers/membershipAdminController";
import { adminUpdatePatientIntake } from "../controllers/intakeAdminController";
import { listAuditLogs, exportAuditLogsCSV, reports, listDocumentsAdmin } from "../controllers/auditAdminController";

export const adminRoutes = Router();

adminRoutes.use("/admin", requireAuth, requireRole(["staff", "admin", "system"]));

adminRoutes.get("/admin/users", listUsers);
adminRoutes.get("/admin/users/export", exportUsers);
adminRoutes.get("/admin/users/:userId", getUserById);
adminRoutes.get("/admin/memberships", listMemberships);
adminRoutes.get("/admin/documents", listDocumentsAdmin);
adminRoutes.get("/admin/reports", reports);
adminRoutes.get("/admin/audit-logs", requireRole(["admin", "system"]), listAuditLogs);
adminRoutes.get("/admin/audit-logs/export", requireRole(["admin", "system"]), exportAuditLogsCSV);
adminRoutes.patch("/admin/users/:userId/membership", updateMembershipStatus);
adminRoutes.patch("/admin/users/:userId/role", requireRole(["admin", "system"]), updateUserRole);
adminRoutes.post("/admin/patients", createPatient);
adminRoutes.put("/admin/patients/:userId/intake", adminUpdatePatientIntake);
adminRoutes.post("/admin/patients/:userId/activate-membership", adminActivateMembership);
adminRoutes.get("/admin/users/:userId/history", getMemberHistory);
