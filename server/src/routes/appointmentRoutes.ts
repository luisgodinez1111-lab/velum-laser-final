import { Router } from "express";
import { requireAuth, requireRole } from "../middlewares/auth";
import {
  getMyAppointments,
  bookAppointment,
  cancelMyAppointment,
  listAppointmentsAdmin,
  getAppointmentAdmin,
  updateAppointmentAdmin
} from "../controllers/appointmentController";

export const appointmentRoutes = Router();

// Member endpoints
appointmentRoutes.get("/appointments", requireAuth, getMyAppointments);
appointmentRoutes.post("/appointments", requireAuth, bookAppointment);
appointmentRoutes.patch("/appointments/:id/cancel", requireAuth, cancelMyAppointment);

// Admin/Staff endpoints
appointmentRoutes.get("/admin/appointments", requireAuth, requireRole(["staff", "admin"]), listAppointmentsAdmin);
appointmentRoutes.get("/admin/appointments/:id", requireAuth, requireRole(["staff", "admin"]), getAppointmentAdmin);
appointmentRoutes.patch("/admin/appointments/:id", requireAuth, requireRole(["staff", "admin"]), updateAppointmentAdmin);
