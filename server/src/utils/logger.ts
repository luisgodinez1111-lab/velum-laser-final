import pino from "pino";
import pinoHttp from "pino-http";

const redactPaths = [
  "req.headers.authorization",
  "req.headers.cookie",
  "req.body.password",
  "req.body.token",
  "req.body.signature",
  "req.body.email",
  "res.headers['set-cookie']"
];

export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  redact: {
    paths: redactPaths,
    remove: true
  }
});

export const httpLogger = pinoHttp({
  logger,
  redact: {
    paths: redactPaths,
    remove: true
  },
  customAttributeKeys: { requestId: "requestId" },
  genReqId: (req) => req.headers["x-request-id"] as string | undefined,
});
