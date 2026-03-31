import { Router } from "express";
import {
  confirmAppointmentByToken,
  createAppointment,
  getMemberAgendaPolicy,
  getMemberAvailableSlots,
  listAppointments,
  triggerAppointmentSync,
  updateAppointment
} from "../controllers/v1AppointmentController";
import {
  deleteAdminAgendaBlock,
  getAdminAgendaConfig,
  getAdminAgendaDay,
  getAdminAgendaReport,
  postAdminAgendaBlock,
  putAdminAgendaConfig
} from "../controllers/agendaAdminController";
import { requireAuth, requireRole } from "../middlewares/auth";

export const v1AppointmentRoutes = Router();

v1AppointmentRoutes.get("/api/v1/appointments", requireAuth, listAppointments);
v1AppointmentRoutes.post("/api/v1/appointments", requireAuth, createAppointment);
v1AppointmentRoutes.patch("/api/v1/appointments/:appointmentId", requireAuth, updateAppointment);

// Sync explícito — POST para respetar REST (GET sin side effects)
v1AppointmentRoutes.post("/api/v1/appointments/sync", requireAuth, requireRole(["staff", "admin", "system"]), triggerAppointmentSync);

// Member-accessible endpoints
v1AppointmentRoutes.get("/api/v1/agenda/public/policy", requireAuth, getMemberAgendaPolicy);
v1AppointmentRoutes.get("/api/v1/agenda/public/slots/:dateKey", requireAuth, getMemberAvailableSlots);

v1AppointmentRoutes.get("/api/v1/agenda/admin/config", requireAuth, requireRole(["staff", "admin", "system"]), getAdminAgendaConfig);
v1AppointmentRoutes.put("/api/v1/agenda/admin/config", requireAuth, requireRole(["staff", "admin", "system"]), putAdminAgendaConfig);
v1AppointmentRoutes.get("/api/v1/agenda/admin/day/:dateKey", requireAuth, requireRole(["staff", "admin", "system"]), getAdminAgendaDay);
v1AppointmentRoutes.get("/api/v1/agenda/admin/report/:dateKey", requireAuth, requireRole(["staff", "admin", "system"]), getAdminAgendaReport);
v1AppointmentRoutes.post("/api/v1/agenda/admin/blocks", requireAuth, requireRole(["staff", "admin", "system"]), postAdminAgendaBlock);
v1AppointmentRoutes.delete("/api/v1/agenda/admin/blocks/:blockId", requireAuth, requireRole(["staff", "admin", "system"]), deleteAdminAgendaBlock);

// Public token-based confirmation (no auth required — HMAC-signed token)
v1AppointmentRoutes.get("/api/v1/appointments/confirm", confirmAppointmentByToken);
