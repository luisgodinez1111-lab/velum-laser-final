export const openApiSpec = {
  openapi: "3.1.0",
  info: {
    title: "VELUM API",
    version: "1.1.0"
  },
  servers: [{ url: "/" }],
  components: {
    securitySchemes: {
      cookieAuth: {
        type: "apiKey",
        in: "cookie",
        name: "velum_token"
      }
    },
    schemas: {
      Error: {
        type: "object",
        properties: {
          message: { type: "string" }
        }
      },
      LeadCreate: {
        type: "object",
        required: ["name", "email", "phone", "consent"],
        properties: {
          name: { type: "string" },
          email: { type: "string", format: "email" },
          phone: { type: "string" },
          consent: { type: "boolean", enum: [true] },
          utm_source: { type: "string" },
          utm_medium: { type: "string" },
          utm_campaign: { type: "string" },
          utm_term: { type: "string" },
          utm_content: { type: "string" },
          fbp: { type: "string" },
          fbc: { type: "string" },
          fbclid: { type: "string" }
        }
      },
      MedicalIntake: {
        type: "object",
        properties: {
          id: { type: "string" },
          userId: { type: "string" },
          status: {
            type: "string",
            enum: ["draft", "submitted", "approved", "rejected"]
          },
          phototype: { type: "integer", minimum: 1, maximum: 6 },
          personalJson: { type: "object" },
          historyJson: { type: "object" }
        }
      },
      Appointment: {
        type: "object",
        properties: {
          id: { type: "string" },
          userId: { type: "string" },
          startAt: { type: "string", format: "date-time" },
          endAt: { type: "string", format: "date-time" },
          status: {
            type: "string",
            enum: ["scheduled", "confirmed", "completed", "canceled", "no_show"]
          }
        }
      }
    }
  },
  paths: {
    "/auth/register": { post: { summary: "Registro", responses: { "201": { description: "Created" } } } },
    "/auth/login": { post: { summary: "Login", responses: { "200": { description: "OK" } } } },
    "/auth/logout": { post: { summary: "Logout", responses: { "204": { description: "No Content" } } } },
    "/auth/forgot": { post: { summary: "Forgot password", responses: { "200": { description: "OK" } } } },
    "/auth/reset": { post: { summary: "Reset password", responses: { "200": { description: "OK" } } } },
    "/auth/verify-email": { post: { summary: "Verify email", responses: { "200": { description: "OK" } } } },
    "/me": {
      get: {
        summary: "Ruta legacy - usuario autenticado",
        security: [{ cookieAuth: [] }],
        responses: { "200": { description: "OK" } }
      }
    },
    "/users/me": {
      get: {
        summary: "Alias compatible de /me",
        security: [{ cookieAuth: [] }],
        responses: { "200": { description: "OK" } }
      }
    },
    "/me/profile": { put: { summary: "Update profile", responses: { "200": { description: "OK" } } } },
    "/membership/status": { get: { summary: "Membership status", responses: { "200": { description: "OK" } } } },
    "/membership/change-plan": { post: { summary: "Change plan", responses: { "200": { description: "OK" } } } },
    "/membership/cancel": { post: { summary: "Cancel membership", responses: { "200": { description: "OK" } } } },
    "/documents": { get: { summary: "List documents", responses: { "200": { description: "OK" } } } },
    "/documents/upload": { post: { summary: "Create upload", responses: { "200": { description: "OK" } } } },
    "/documents/{id}": { get: { summary: "Download document", responses: { "200": { description: "OK" } } } },
    "/admin/users": { get: { summary: "Admin users", responses: { "200": { description: "OK" } } } },
    "/admin/memberships": { get: { summary: "Admin memberships", responses: { "200": { description: "OK" } } } },
    "/admin/documents": { get: { summary: "Admin documents", responses: { "200": { description: "OK" } } } },
    "/admin/reports": { get: { summary: "Admin reports", responses: { "200": { description: "OK" } } } },
    "/admin/audit-logs": { get: { summary: "Admin audit logs", responses: { "200": { description: "OK" } } } },
    "/stripe/webhook": { post: { summary: "Stripe webhook", responses: { "200": { description: "OK" } } } },
    "/api/v1/leads": {
      post: {
        summary: "Crear lead de marketing",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/LeadCreate" }
            }
          }
        },
        responses: {
          "201": { description: "Lead creado" },
          "400": {
            description: "Error de validación",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Error" }
              }
            }
          }
        }
      }
    },
    "/api/v1/medical-intakes/me": {
      get: {
        summary: "Obtener expediente médico del usuario autenticado",
        security: [{ cookieAuth: [] }],
        responses: {
          "200": {
            description: "OK",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/MedicalIntake" }
              }
            }
          }
        }
      },
      put: {
        summary: "Actualizar expediente médico",
        security: [{ cookieAuth: [] }],
        responses: {
          "200": {
            description: "Actualizado",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/MedicalIntake" }
              }
            }
          }
        }
      }
    },
    "/api/v1/medical-intakes/{userId}/approve": {
      post: {
        summary: "Aprobar expediente (staff/admin/system)",
        security: [{ cookieAuth: [] }],
        parameters: [{ name: "userId", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          "200": { description: "Aprobado" },
          "403": { description: "Forbidden" }
        }
      }
    },
    "/api/v1/appointments": {
      get: {
        summary: "Listar citas (según rol)",
        security: [{ cookieAuth: [] }],
        responses: { "200": { description: "OK" } }
      },
      post: {
        summary: "Crear cita",
        security: [{ cookieAuth: [] }],
        responses: {
          "201": {
            description: "Cita creada",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Appointment" }
              }
            }
          }
        }
      }
    },
    "/api/v1/appointments/{appointmentId}": {
      patch: {
        summary: "Reprogramar/cancelar cita",
        security: [{ cookieAuth: [] }],
        parameters: [{ name: "appointmentId", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "Actualizado" } }
      }
    },
    "/api/v1/sessions": {
      post: {
        summary: "Registrar sesión clínica (staff/admin/system)",
        security: [{ cookieAuth: [] }],
        responses: { "201": { description: "Sesión creada" } }
      }
    },
    "/api/v1/sessions/{sessionId}/feedback": {
      patch: {
        summary: "Agregar feedback de sesión",
        security: [{ cookieAuth: [] }],
        responses: { "200": { description: "Feedback guardado" } }
      }
    },
    "/api/v1/payments/me": {
      get: {
        summary: "Historial de pagos del usuario",
        security: [{ cookieAuth: [] }],
        responses: { "200": { description: "OK" } }
      }
    },
    "/api/v1/payments": {
      get: {
        summary: "Historial de pagos admin/staff/system",
        security: [{ cookieAuth: [] }],
        responses: { "200": { description: "OK" } }
      }
    },
    "/api/v1/audit-logs": {
      get: {
        summary: "Audit logs filtrables (admin/system)",
        security: [{ cookieAuth: [] }],
        responses: { "200": { description: "OK" } }
      }
    },
    "/api/v1/marketing/events": {
      post: {
        summary: "Registrar y enviar evento a Meta CAPI",
        responses: { "202": { description: "Accepted" } }
      },
      get: {
        summary: "Monitorear eventos de marketing",
        security: [{ cookieAuth: [] }],
        responses: { "200": { description: "OK" } }
      }
    },
    "/admin/marketing/events": {
      get: {
        summary: "Alias admin para monitoreo de eventos de marketing",
        security: [{ cookieAuth: [] }],
        responses: { "200": { description: "OK" } }
      }
    }
  }
};
