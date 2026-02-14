export const openApiSpec = {
  openapi: "3.0.3",
  info: {
    title: "VELUM API",
    version: "1.0.0"
  },
  servers: [{ url: "/" }],
  paths: {
    "/auth/register": { post: { summary: "Registro", responses: { "201": { description: "Created" } } } },
    "/auth/login": { post: { summary: "Login", responses: { "200": { description: "OK" } } } },
    "/auth/logout": { post: { summary: "Logout", responses: { "204": { description: "No Content" } } } },
    "/auth/forgot": { post: { summary: "Forgot password", responses: { "200": { description: "OK" } } } },
    "/auth/reset": { post: { summary: "Reset password", responses: { "200": { description: "OK" } } } },
    "/auth/verify-email": { post: { summary: "Verify email", responses: { "200": { description: "OK" } } } },
    "/me": { get: { summary: "Current user", responses: { "200": { description: "OK" } } } },
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
    "/stripe/webhook": { post: { summary: "Stripe webhook", responses: { "200": { description: "OK" } } } },

    // Phase 1: Medical Intake
    "/intake": {
      get: { summary: "Get current user's medical intake", responses: { "200": { description: "OK" } } },
      post: { summary: "Create/update intake draft", responses: { "200": { description: "OK" } } }
    },
    "/intake/submit": { post: { summary: "Submit intake for review", responses: { "200": { description: "OK" } } } },
    "/intake/sign": { post: { summary: "Sign intake with digital signature", responses: { "200": { description: "OK" } } } },

    // Phase 1: Appointments
    "/appointments": {
      get: { summary: "Get current user's appointments", responses: { "200": { description: "OK" } } },
      post: { summary: "Book new appointment", responses: { "201": { description: "Created" } } }
    },
    "/appointments/{id}/cancel": { patch: { summary: "Cancel own appointment", responses: { "200": { description: "OK" } } } },

    // Phase 1: Schedule
    "/schedule/availability": { get: { summary: "Get available time slots for a date", responses: { "200": { description: "OK" } } } },

    // Phase 1: Leads (public)
    "/leads": { post: { summary: "Capture lead from website (public)", responses: { "201": { description: "Created" } } } },

    // Phase 1: Admin - Intakes
    "/admin/intakes": { get: { summary: "List all intakes (staff/admin)", responses: { "200": { description: "OK" } } } },
    "/admin/intakes/{id}": { get: { summary: "Get intake detail (staff/admin)", responses: { "200": { description: "OK" } } } },
    "/admin/intakes/{id}/review": { post: { summary: "Approve or reject intake", responses: { "200": { description: "OK" } } } },

    // Phase 1: Admin - Appointments
    "/admin/appointments": { get: { summary: "List all appointments (staff/admin)", responses: { "200": { description: "OK" } } } },
    "/admin/appointments/{id}": {
      get: { summary: "Get appointment detail (staff/admin)", responses: { "200": { description: "OK" } } },
      patch: { summary: "Update appointment status/staff (staff/admin)", responses: { "200": { description: "OK" } } }
    },

    // Phase 1: Admin - Leads
    "/admin/leads": { get: { summary: "List all leads (staff/admin)", responses: { "200": { description: "OK" } } } },
    "/admin/leads/{id}": {
      get: { summary: "Get lead detail (staff/admin)", responses: { "200": { description: "OK" } } },
      patch: { summary: "Update lead status/notes (staff/admin)", responses: { "200": { description: "OK" } } }
    },
    "/admin/leads/{id}/convert": { post: { summary: "Convert lead to user account", responses: { "200": { description: "OK" } } } },

    // Phase 1: Admin - Schedule
    "/admin/schedule": {
      get: { summary: "Get all schedule configs (admin)", responses: { "200": { description: "OK" } } },
      put: { summary: "Bulk update schedule configs (admin)", responses: { "200": { description: "OK" } } }
    },
    "/admin/schedule/blocks": {
      get: { summary: "List blocked dates (staff/admin)", responses: { "200": { description: "OK" } } },
      post: { summary: "Block a date (staff/admin)", responses: { "201": { description: "Created" } } }
    },
    "/admin/schedule/blocks/{id}": { delete: { summary: "Unblock a date (admin)", responses: { "204": { description: "No Content" } } } },

    // Phase 2: Sessions
    "/me/sessions": { get: { summary: "Get current user's treatment sessions", responses: { "200": { description: "OK" } } } },
    "/admin/sessions": {
      get: { summary: "List all sessions (staff/admin)", responses: { "200": { description: "OK" } } },
      post: { summary: "Create treatment session for appointment", responses: { "201": { description: "Created" } } }
    },
    "/admin/sessions/{id}": {
      get: { summary: "Get session detail (staff/admin)", responses: { "200": { description: "OK" } } },
      patch: { summary: "Update session (staff/admin)", responses: { "200": { description: "OK" } } }
    },

    // Phase 2: Notifications
    "/me/notifications": { get: { summary: "Get current user's notifications", responses: { "200": { description: "OK" } } } },
    "/me/notifications/unread-count": { get: { summary: "Get unread notification count", responses: { "200": { description: "OK" } } } },
    "/me/notifications/{id}/read": { patch: { summary: "Mark notification as read", responses: { "200": { description: "OK" } } } },
    "/me/notifications/read-all": { post: { summary: "Mark all notifications as read", responses: { "200": { description: "OK" } } } },

    // Phase 2: Marketing Events
    "/marketing/events": { post: { summary: "Track marketing event (public)", responses: { "201": { description: "Created" } } } },
    "/admin/marketing/pending": { get: { summary: "List pending CAPI events (admin)", responses: { "200": { description: "OK" } } } },
    "/admin/marketing/process": { post: { summary: "Process pending CAPI events (admin)", responses: { "200": { description: "OK" } } } },

    // Phase 2: Analytics
    "/admin/analytics/overview": { get: { summary: "Analytics overview (admin)", responses: { "200": { description: "OK" } } } },
    "/admin/analytics/appointments": { get: { summary: "Appointment analytics (admin)", responses: { "200": { description: "OK" } } } },
    "/admin/analytics/leads": { get: { summary: "Lead analytics (admin)", responses: { "200": { description: "OK" } } } },
    "/admin/analytics/sessions": { get: { summary: "Session analytics (admin)", responses: { "200": { description: "OK" } } } },
    // Phase 3 endpoints
    "/me/treatment-plans": { get: { summary: "My treatment plans", responses: { "200": { description: "OK" } } } },
    "/admin/treatment-plans": {
      get: { summary: "List all treatment plans (staff/admin)", responses: { "200": { description: "OK" } } },
      post: { summary: "Create treatment plan (staff/admin)", responses: { "201": { description: "Created" } } }
    },
    "/admin/treatment-plans/{id}": {
      get: { summary: "Get treatment plan detail (staff/admin)", responses: { "200": { description: "OK" } } },
      patch: { summary: "Update treatment plan (staff/admin)", responses: { "200": { description: "OK" } } }
    },
    "/admin/treatment-plans/{id}/increment": { post: { summary: "Increment plan session (staff/admin)", responses: { "200": { description: "OK" } } } },
    "/files/upload": { post: { summary: "Upload file", responses: { "201": { description: "Created" } } } },
    "/me/files": { get: { summary: "My uploaded files", responses: { "200": { description: "OK" } } } },
    "/files/{id}/download": { get: { summary: "Download file", responses: { "200": { description: "OK" } } } },
    "/files/{id}": { delete: { summary: "Delete file", responses: { "200": { description: "OK" } } } },
    "/admin/files/{entityType}/{entityId}": { get: { summary: "Files by entity (staff/admin)", responses: { "200": { description: "OK" } } } },
    "/me/invoices": { get: { summary: "My invoices", responses: { "200": { description: "OK" } } } },
    "/admin/invoices": {
      get: { summary: "List all invoices (staff/admin)", responses: { "200": { description: "OK" } } },
      post: { summary: "Create invoice (admin)", responses: { "201": { description: "Created" } } }
    },
    "/admin/invoices/{id}": { get: { summary: "Get invoice detail (staff/admin)", responses: { "200": { description: "OK" } } } },
    "/admin/analytics/revenue": { get: { summary: "Revenue analytics (admin)", responses: { "200": { description: "OK" } } } },
    "/me/onboarding": { get: { summary: "Onboarding status", responses: { "200": { description: "OK" } } } },
    "/admin/reminders/upcoming": { post: { summary: "Trigger appointment reminders (admin)", responses: { "200": { description: "OK" } } } },
    "/admin/reminders/no-show": { post: { summary: "Trigger no-show follow-up (admin)", responses: { "200": { description: "OK" } } } }
  }
};
