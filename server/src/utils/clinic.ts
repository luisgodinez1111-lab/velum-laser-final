import { prisma } from "../db/prisma";
import { env } from "./env";

export const getClinicIdByUserId = async (userId: string) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { clinicId: true }
  });

  return user?.clinicId || env.defaultClinicId;
};
