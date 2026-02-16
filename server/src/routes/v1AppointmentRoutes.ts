import { Router } from "express";
import { createAppointment, listAppointments, updateAppointment } from "../controllers/v1AppointmentController";
import { requireAuth } from "../middlewares/auth";

export const v1AppointmentRoutes = Router();

v1AppointmentRoutes.get("/api/v1/appointments", requireAuth, listAppointments);
v1AppointmentRoutes.post("/api/v1/appointments", requireAuth, createAppointment);
v1AppointmentRoutes.patch("/api/v1/appointments/:appointmentId", requireAuth, updateAppointment);
