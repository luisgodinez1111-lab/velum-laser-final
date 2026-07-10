/// <reference types="vite/client" />

const API_BASE_URL = (import.meta.env.VITE_API_URL ?? '/api').replace(/\/$/, '');
const DEFAULT_TIMEOUT_MS = 15_000;

const baseIncludesApiPrefix = (baseUrl: string): boolean => /(^|\/)api$/.test(baseUrl.replace(/\/$/, ''));

export const normalizeApiPath = (path: string, apiBaseUrl = API_BASE_URL): string => {
  const withLeadingSlash = path.startsWith('/') ? path : `/${path}`;
  if (baseIncludesApiPrefix(apiBaseUrl)) {
    return withLeadingSlash.replace(/^\/api(?=\/|$)/, '') || '/';
  }
  if (/^\/v1(?=\/|$)/.test(withLeadingSlash)) {
    return `/api${withLeadingSlash}`;
  }
  return withLeadingSlash;
};

export const buildApiUrl = (path: string): string => {
  if (/^https?:\/\//i.test(path)) return path;
  return `${API_BASE_URL}${normalizeApiPath(path)}`;
};

// ── Silent refresh token rotation ─────────────────────────────────────────────
// On 401, try POST /auth/refresh before redirecting to login.
// Shared promise prevents multiple concurrent refresh calls (e.g. parallel requests).
let _refreshInFlight: Promise<boolean> | null = null;

const attemptTokenRefresh = (): Promise<boolean> => {
  if (_refreshInFlight) return _refreshInFlight;
  _refreshInFlight = fetch(buildApiUrl('/auth/refresh'), {
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

const IDEMPOTENT_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

const fetchWithRetry = async (
  url: string,
  init: RequestInit,
  retries: number,
  backoff: number
): Promise<Response> => {
  const method = (init.method ?? 'GET').toUpperCase();
  const isIdempotent = IDEMPOTENT_METHODS.has(method);
  try {
    const response = await fetch(url, init);

    // 429: el request no se procesó (rate limit) → reintentar es seguro para
    // cualquier método. Retry-After puede venir en segundos o como fecha HTTP;
    // si no es un número, usamos 5s (antes NaN → sleep(NaN) → retry inmediato).
    if (response.status === 429 && retries > 0) {
      const parsed = parseInt(response.headers.get('Retry-After') ?? '', 10);
      const retryAfter = Number.isNaN(parsed) ? 5 : Math.min(Math.max(parsed, 0), 60);
      await sleep(retryAfter * 1000);
      return fetchWithRetry(url, init, retries - 1, backoff * 2);
    }

    // 503: servicio no disponible, el request no se procesó → reintenta.
    if (response.status === 503 && retries > 0) {
      await sleep(2000);
      return fetchWithRetry(url, init, retries - 1, backoff * 2);
    }

    return response;
  } catch (err) {
    // Error de red: el request PUDO haberse procesado en el servidor. Solo
    // reintentamos métodos idempotentes (GET/HEAD/OPTIONS) para no duplicar
    // mutaciones (cobros, reservas, verificación OTP). POST/PATCH/PUT/DELETE
    // se propagan al caller para que decida.
    if (retries > 0 && isIdempotent && !(err instanceof DOMException)) {
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

// ── Estado de sesión para el manejo de 401 ──────────────────────────────────
// Solo redirigimos a login cuando había una sesión autenticada previa (token
// expirado a mitad de sesión). Un visitante ANÓNIMO que dispara /users/me al
// cargar el sitio público NO debe ser expulsado a la pantalla de login.
// AuthContext actualiza este flag en login/logout/verificación de sesión.
let hasAuthenticatedSession = false;
export const setAuthenticatedSession = (value: boolean): void => {
  hasAuthenticatedSession = value;
};

const _doApiFetch = async <T>(
  path: string,
  options: RequestInit = {},
  timeoutMs = DEFAULT_TIMEOUT_MS
): Promise<T> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const normalizedPath = normalizeApiPath(path);
  const requestUrl = buildApiUrl(normalizedPath);

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

    const response = await fetchWithRetry(requestUrl, init, 2, 500);

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
          const retryResp = await fetch(requestUrl, init).catch(() => null);
          if (retryResp?.ok) {
            if (retryResp.status === 204) return undefined as unknown as T;
            return retryResp.json() as Promise<T>;
          }
        }
        // Solo expulsar a login si había sesión autenticada (no a visitantes
        // anónimos del sitio público cuya sesión-probe devuelve 401).
        if (hasAuthenticatedSession && !window.location.hash.includes('/agenda?mode=login')) {
          window.location.replace('/#/agenda?mode=login');
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

// ── Dedupe de GETs en vuelo ──────────────────────────────────────────────────
// Peticiones GET idénticas concurrentes comparten una sola promesa/fetch (p.ej.
// varios componentes pidiendo los slots de agenda del mismo día a la vez). Solo
// dedupe GETs "planos" (sin body, headers, ni signal custom) para no colapsar
// peticiones que podrían diferir. Se limpia al resolver/rechazar (no es caché).
const _inflightGets = new Map<string, Promise<unknown>>();

export const apiFetch = <T>(
  path: string,
  options: RequestInit = {},
  timeoutMs = DEFAULT_TIMEOUT_MS
): Promise<T> => {
  const method = (options.method ?? 'GET').toUpperCase();
  const canDedupe = method === 'GET' && !options.body && !options.headers && !options.signal;
  if (!canDedupe) return _doApiFetch<T>(path, options, timeoutMs);

  const key = buildApiUrl(normalizeApiPath(path));
  const existing = _inflightGets.get(key);
  if (existing) return existing as Promise<T>;

  const p = _doApiFetch<T>(path, options, timeoutMs).finally(() => {
    _inflightGets.delete(key);
  });
  _inflightGets.set(key, p);
  return p;
};
