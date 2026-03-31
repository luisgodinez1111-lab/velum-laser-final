import { z } from "zod";

export const medicalIntakeUpdateSchema = z.object({
  personalJson: z.record(z.string().max(500)).optional(),
  historyJson: z.record(z.string().max(2000)).optional(),
  phototype: z.number().int().min(1).max(6).nullish(),
  consentAccepted: z.boolean().optional(),
  signatureKey: z.string().min(3).max(200).optional(),
  signatureImageData: z.string().min(10).optional().refine(
    (val) => val === undefined || val.length <= 3_145_728,
    { message: "La firma excede el tamaño máximo permitido (3MB)." }
  ),
  status: z.enum(["draft", "submitted"]).optional()
});

export const medicalIntakeApproveSchema = z.object({
  approved: z.boolean(),
  rejectionReason: z.string().min(3).max(500).optional()
}).superRefine((data, ctx) => {
  if (!data.approved && !data.rejectionReason) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["rejectionReason"], message: "El motivo de rechazo es obligatorio al rechazar un expediente" });
  }
});
