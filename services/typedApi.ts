/// <reference types="vite/client" />
/**
 * Cliente HTTP tipado contra el contrato OpenAPI.
 *
 * Single source of truth: `server/src/openapi.ts` → `services/__generated__/api-types.ts`
 * (regenerar con `npm run codegen`).
 *
 * Por qué este wrapper coexiste con `apiClient.ts`:
 *   - `apiClient.ts` sigue siendo el cliente runtime: maneja refresh, retries,
 *     timeouts, ApiError. NO duplicamos esa lógica aquí.
 *   - `typedApi` solo agrega una capa de tipos por encima — `paths` y
 *     `components.schemas` del OpenAPI quedan disponibles en cada llamada.
 *   - Adopción incremental: código existente sigue funcionando; nuevas
 *     features escriben con `typedApi.get('/path')` y obtienen autocompletado
 *     + zero drift.
 *
 * Uso:
 *
 *   import { typedApi, components } from './typedApi';
 *
 *   type Lead = components['schemas']['LeadCreate'];
 *
 *   const lead: Lead = { name, email, phone, consent: true };
 *   const created = await typedApi.post('/leads', lead);
 *   //    ^? typed según el response del POST /leads en openapi.ts
 */
import { apiFetch } from './apiClient';
import type { paths, components } from './__generated__/api-types';

export type { components, paths };

/**
 * Extrae el body del response 200/201 de una operación.
 * Si el path no tiene response 2xx con JSON, el tipo cae a `unknown`.
 */
type ResponseBody<Op> =
  Op extends { responses: infer R }
    ? R extends { 200: { content: { 'application/json': infer T } } }
      ? T
      : R extends { 201: { content: { 'application/json': infer T } } }
        ? T
        : R extends { 204: unknown }
          ? void
          : unknown
    : unknown;

type RequestBody<Op> =
  Op extends { requestBody: { content: { 'application/json': infer T } } } ? T : never;

type GetPaths = {
  [P in keyof paths]: paths[P] extends { get: unknown } ? P : never;
}[keyof paths];

type PostPaths = {
  [P in keyof paths]: paths[P] extends { post: unknown } ? P : never;
}[keyof paths];

type PutPaths = {
  [P in keyof paths]: paths[P] extends { put: unknown } ? P : never;
}[keyof paths];

type DeletePaths = {
  [P in keyof paths]: paths[P] extends { delete: unknown } ? P : never;
}[keyof paths];

export const typedApi = {
  get: <P extends GetPaths>(
    path: P,
    init?: RequestInit,
  ): Promise<ResponseBody<paths[P] extends { get: infer G } ? G : never>> =>
    apiFetch(path as string, { ...init, method: 'GET' }) as Promise<
      ResponseBody<paths[P] extends { get: infer G } ? G : never>
    >,

  post: <P extends PostPaths>(
    path: P,
    body?: RequestBody<paths[P] extends { post: infer Op } ? Op : never>,
    init?: RequestInit,
  ): Promise<ResponseBody<paths[P] extends { post: infer Op } ? Op : never>> =>
    apiFetch(path as string, {
      ...init,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    }) as Promise<ResponseBody<paths[P] extends { post: infer Op } ? Op : never>>,

  put: <P extends PutPaths>(
    path: P,
    body?: RequestBody<paths[P] extends { put: infer Op } ? Op : never>,
    init?: RequestInit,
  ): Promise<ResponseBody<paths[P] extends { put: infer Op } ? Op : never>> =>
    apiFetch(path as string, {
      ...init,
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    }) as Promise<ResponseBody<paths[P] extends { put: infer Op } ? Op : never>>,

  del: <P extends DeletePaths>(
    path: P,
    init?: RequestInit,
  ): Promise<ResponseBody<paths[P] extends { delete: infer Op } ? Op : never>> =>
    apiFetch(path as string, { ...init, method: 'DELETE' }) as Promise<
      ResponseBody<paths[P] extends { delete: infer Op } ? Op : never>
    >,
};
