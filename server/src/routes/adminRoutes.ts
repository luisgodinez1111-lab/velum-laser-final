import { Router } from "express";
import { requireAuth, requireRole } from "../middlewares/auth";
import {
  listAuditLogs,
  listDocumentsAdmin,
  listMemberships,
  listUsers,
  getUserById,
  reports,
  updateMembershipStatus,
  updateUserRole,
  createPatient,
  adminUpdatePatientIntake,
  adminActivateMembership,
  exportUsers,
  getMemberHistory,
} from "../controllers/adminController";

export const adminRoutes = Router();

adminRoutes.use("/admin", requireAuth, requireRole(["staff", "admin", "system"]));

adminRoutes.get("/admin/users", listUsers);
adminRoutes.get("/admin/users/export", exportUsers);
adminRoutes.get("/admin/users/:userId", getUserById);
adminRoutes.get("/admin/memberships", listMemberships);
adminRoutes.get("/admin/documents", listDocumentsAdmin);
adminRoutes.get("/admin/reports", reports);
adminRoutes.get("/admin/audit-logs", requireRole(["admin", "system"]), listAuditLogs);
adminRoutes.patch("/admin/users/:userId/membership", updateMembershipStatus);
adminRoutes.patch("/admin/users/:userId/role", requireRole(["admin", "system"]), updateUserRole);
adminRoutes.post("/admin/patients", createPatient);
adminRoutes.put("/admin/patients/:userId/intake", adminUpdatePatientIntake);
adminRoutes.post("/admin/patients/:userId/activate-membership", adminActivateMembership);
adminRoutes.get("/admin/users/:userId/history", getMemberHistory);
