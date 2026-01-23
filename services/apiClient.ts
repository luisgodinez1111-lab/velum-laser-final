const API_BASE_URL = import.meta.env.VITE_API_URL ?? "/api";

export const apiFetch = async <T>(path: string, options: RequestInit = {}): Promise<T> => {
  const isFormData = options.body instanceof FormData;
  const response = await fetch(`${API_BASE_URL}${path}`, {
    credentials: "include",
    headers: {
      ...(isFormData ? {} : { "Content-Type": "application/json" }),
      ...(options.headers ?? {})
    },
    ...options
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    throw new Error(errorBody.message ?? "Error en la solicitud");
  }

  if (response.status === 204) {
    return {} as T;
  }

  return response.json() as Promise<T>;
};
