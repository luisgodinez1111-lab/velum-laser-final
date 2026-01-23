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
    "/stripe/webhook": { post: { summary: "Stripe webhook", responses: { "200": { description: "OK" } } } }
  }
};
