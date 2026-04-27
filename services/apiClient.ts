/// <reference types="vite/client" />

const API_BASE_URL = (import.meta.env.VITE_API_URL ?? '/api').replace(/\/$/, '');
const DEFAULT_TIMEOUT_MS = 15_000;

// ── Silent refresh token rotation ─────────────────────────────────────────────
// On 401, try POST /auth/refresh before redirecting to login.
// Shared promise prevents multiple concurrent refresh calls (e.g. parallel requests).
let _refreshInFlight: Promise<boolean> | null = null;

const attemptTokenRefresh = (): Promise<boolean> => {
  if (_refreshInFlight) return _refreshInFlight;
  _refreshInFlight = fetch(`${API_BASE_URL}/auth/refresh`, {
    method: 'POST',
    credentials: 'include',
  })
    .then((r) => r.ok)
    .catch(() => false)
    .finally(() => { _refreshInFlight = null; });
  return _refreshInFlight;
};

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

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const fetchWithRetry = async (
  url: string,
  init: RequestInit,
  retries: number,
  backoff: number
): Promise<Response> => {
  try {
    const response = await fetch(url, init);

    // 429: espera el Retry-After del servidor antes de reintentar
    if (response.status === 429 && retries > 0) {
      const retryAfter = parseInt(response.headers.get('Retry-After') ?? '5', 10);
      await sleep(retryAfter * 1000);
      return fetchWithRetry(url, init, retries - 1, backoff * 2);
    }

    // 503: reintenta tras 2 segundos
    if (response.status === 503 && retries > 0) {
      await sleep(2000);
      return fetchWithRetry(url, init, retries - 1, backoff * 2);
    }

    return response;
  } catch (err) {
    // Error de red (fetch failed, sin conexión) — reintenta con backoff
    if (retries > 0 && !(err instanceof DOMException)) {
      await sleep(backoff);
      return fetchWithRetry(url, init, retries - 1, backoff * 2);
    }
    throw err;
  }
};

const generateRequestId = (): string => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
};

export const apiFetch = async <T>(
  path: string,
  options: RequestInit = {},
  timeoutMs = DEFAULT_TIMEOUT_MS
): Promise<T> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;

  try {
    const isFormData = options.body instanceof FormData;
    const init: RequestInit = {
      credentials: 'include',
      signal: controller.signal,
      ...options,
      headers: {
        ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
        'x-request-id': generateRequestId(),
        ...(options.headers ?? {}),
      },
    };

    const response = await fetchWithRetry(`${API_BASE_URL}${normalizedPath}`, init, 2, 500);

    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({}));
      const message =
        (typeof errorBody === 'object' &&
          errorBody !== null &&
          'message' in errorBody &&
          typeof (errorBody as Record<string, unknown>).message === 'string')
          ? (errorBody as Record<string, unknown>).message as string
          : `Error ${response.status}`;

      // On 401: try silent refresh then retry the original request once.
      // Skip for auth paths to prevent infinite loops.
      if (response.status === 401 && !normalizedPath.startsWith('/auth/')) {
        const refreshed = await attemptTokenRefresh();
        if (refreshed) {
          const retryResp = await fetch(`${API_BASE_URL}${normalizedPath}`, init).catch(() => null);
          if (retryResp?.ok) {
            if (retryResp.status === 204) return undefined as unknown as T;
            return retryResp.json() as Promise<T>;
          }
        }
        if (!window.location.hash.includes('/login')) {
          window.location.replace('/#/login');
        }
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
