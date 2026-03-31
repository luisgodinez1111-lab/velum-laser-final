import { Response } from "express";
import { IntegrationJobStatus } from "@prisma/client";
import { prisma } from "../db/prisma";
import { AuthRequest } from "../middlewares/auth";
import { getClinicIdByUserId } from "../utils/resolveClinicId";

export const listIntegrationJobs = async (req: AuthRequest, res: Response) => {
  const clinicId = await getClinicIdByUserId(req.user!.id);
  const status = typeof req.query.status === "string" ? req.query.status : undefined;
  const limit = Math.min(Number(req.query.limit ?? 100), 500);

  const jobs = await prisma.integrationJob.findMany({
    where: {
      clinicId,
      ...(status ? { status: status as IntegrationJobStatus } : {})
    },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true,
      type: true,
      status: true,
      attempts: true,
      maxAttempts: true,
      runAt: true,
      lastError: true,
      finishedAt: true,
      createdAt: true,
      googleIntegrationId: true
    }
  });

  return res.json({ jobs });
};
