import { Router } from "express";
import {
  createAppointment,
  deleteAdminAgendaBlock,
  getAdminAgendaConfig,
  getAdminAgendaDay,
  getAdminAgendaReport,
  getMemberAgendaPolicy,
  getMemberAvailableSlots,
  listAppointments,
  postAdminAgendaBlock,
  putAdminAgendaConfig,
  updateAppointment
} from "../controllers/v1AppointmentController";
import { requireAuth, requireRole } from "../middlewares/auth";

export const v1AppointmentRoutes = Router();

v1AppointmentRoutes.get("/api/v1/appointments", requireAuth, listAppointments);
v1AppointmentRoutes.post("/api/v1/appointments", requireAuth, createAppointment);
v1AppointmentRoutes.patch("/api/v1/appointments/:appointmentId", requireAuth, updateAppointment);

// Member-accessible endpoints
v1AppointmentRoutes.get("/api/v1/agenda/public/policy", requireAuth, getMemberAgendaPolicy);
v1AppointmentRoutes.get("/api/v1/agenda/public/slots/:dateKey", requireAuth, getMemberAvailableSlots);

v1AppointmentRoutes.get("/api/v1/agenda/admin/config", requireAuth, requireRole(["staff", "admin", "system"]), getAdminAgendaConfig);
v1AppointmentRoutes.put("/api/v1/agenda/admin/config", requireAuth, requireRole(["staff", "admin", "system"]), putAdminAgendaConfig);
v1AppointmentRoutes.get("/api/v1/agenda/admin/day/:dateKey", requireAuth, requireRole(["staff", "admin", "system"]), getAdminAgendaDay);
v1AppointmentRoutes.get("/api/v1/agenda/admin/report/:dateKey", requireAuth, requireRole(["staff", "admin", "system"]), getAdminAgendaReport);
v1AppointmentRoutes.post("/api/v1/agenda/admin/blocks", requireAuth, requireRole(["staff", "admin", "system"]), postAdminAgendaBlock);
v1AppointmentRoutes.delete("/api/v1/agenda/admin/blocks/:blockId", requireAuth, requireRole(["staff", "admin", "system"]), deleteAdminAgendaBlock);
