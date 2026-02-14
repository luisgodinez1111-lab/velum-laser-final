import { prisma } from "../db/prisma.js";
import type { PlanStatus } from "@prisma/client";

export const treatmentPlanService = {
  async create(data: {
    userId: string;
    membershipId: string;
    zones: string[];
    totalSessions: number;
    notes?: string;
  }) {
    const expectedEnd = new Date();
    expectedEnd.setMonth(expectedEnd.getMonth() + data.totalSessions);

    return prisma.treatmentPlan.create({
      data: {
        ...data,
        expectedEndDate: expectedEnd,
      },
      include: { user: { include: { profile: true } }, membership: true },
    });
  },

  async getByUser(userId: string) {
    return prisma.treatmentPlan.findMany({
      where: { userId },
      include: { membership: true },
      orderBy: { createdAt: "desc" },
    });
  },

  async getById(id: string) {
    return prisma.treatmentPlan.findUnique({
      where: { id },
      include: {
        user: { include: { profile: true } },
        membership: true,
      },
    });
  },

  async update(id: string, data: {
    completedSessions?: number;
    status?: PlanStatus;
    notes?: string;
    totalSessions?: number;
  }) {
    return prisma.treatmentPlan.update({
      where: { id },
      data,
      include: { user: { include: { profile: true } }, membership: true },
    });
  },

  async incrementSession(id: string) {
    const plan = await prisma.treatmentPlan.findUnique({ where: { id } });
    if (!plan) throw new Error("Plan not found");

    const newCompleted = plan.completedSessions + 1;
    const newStatus: PlanStatus = newCompleted >= plan.totalSessions ? "completed" : "active";

    return prisma.treatmentPlan.update({
      where: { id },
      data: { completedSessions: newCompleted, status: newStatus },
    });
  },

  async listAll(filters?: { status?: PlanStatus }) {
    return prisma.treatmentPlan.findMany({
      where: filters?.status ? { status: filters.status } : undefined,
      include: {
        user: { include: { profile: true } },
        membership: true,
      },
      orderBy: { createdAt: "desc" },
    });
  },
};
