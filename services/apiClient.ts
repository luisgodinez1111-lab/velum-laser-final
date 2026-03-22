/// <reference types="vite/client" />

const API_BASE_URL = import.meta.env.VITE_API_URL ?? '/api';
const DEFAULT_TIMEOUT_MS = 15_000;

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body?: unknown
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export const apiFetch = async <T>(
  path: string,
  options: RequestInit = {},
  timeoutMs = DEFAULT_TIMEOUT_MS
): Promise<T> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const isFormData = options.body instanceof FormData;
    const response = await fetch(`${API_BASE_URL}${path}`, {
      credentials: 'include',
      signal: controller.signal,
      ...options,
      headers: {
        ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
        ...(options.headers ?? {}),
      },
    });

    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({}));
      const message =
        (typeof errorBody === 'object' &&
          errorBody !== null &&
          'message' in errorBody &&
          typeof (errorBody as Record<string, unknown>).message === 'string')
          ? (errorBody as Record<string, unknown>).message as string
          : `Error ${response.status}`;
      if (response.status === 401 && !window.location.pathname.includes('/login')) {
        window.location.replace('/login');
      }
      throw new ApiError(message, response.status, errorBody);
    }

    if (response.status === 204) return undefined as unknown as T;

    return response.json() as Promise<T>;
  } catch (err) {
    if (err instanceof ApiError) throw err;
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new ApiError('La solicitud tardó demasiado. Inténtalo de nuevo.', 408);
    }
    throw new ApiError(
      err instanceof Error ? err.message : 'Error de red desconocido',
      0
    );
  } finally {
    clearTimeout(timer);
  }
};
