import { Response } from "express";

/** Respuesta de lista paginada estandarizada */
export const paginated = <T>(
  res: Response,
  data: T[],
  meta: { page: number; limit: number; total: number }
) => {
  return res.json({
    data,
    pagination: {
      page: meta.page,
      limit: meta.limit,
      total: meta.total,
      pages: Math.ceil(meta.total / meta.limit),
    },
  });
};

/** Respuesta de recurso único */
export const ok = <T>(res: Response, data: T, status = 200) =>
  res.status(status).json(data);

/** Respuesta creación exitosa */
export const created = <T>(res: Response, data: T) =>
  res.status(201).json(data);
