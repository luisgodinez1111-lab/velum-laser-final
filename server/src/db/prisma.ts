import { PrismaClient } from "@prisma/client";

// Explicit connection pool tuning to prevent exhaustion under concurrent load.
// connection_limit=10: max simultaneous DB connections from this process.
// pool_timeout=20: seconds to wait for a free connection before throwing.
const DATABASE_URL = process.env.DATABASE_URL ?? "";
const dbUrl = DATABASE_URL.includes("connection_limit")
  ? DATABASE_URL
  : `${DATABASE_URL}${DATABASE_URL.includes("?") ? "&" : "?"}connection_limit=10&pool_timeout=20`;

export const prisma = new PrismaClient({
  datasources: { db: { url: dbUrl } },
  log: process.env.NODE_ENV === "development" ? ["query", "warn", "error"] : ["warn", "error"],
});
