import { buildApiUrl } from './apiClient';

const DOWNLOAD_TIMEOUT_MS = 30_000;

/**
 * Descarga un recurso binario autenticado (CSV, PDF) y dispara la descarga en el
 * navegador.
 *
 * NO pasa por `apiFetch` a propósito: apiFetch hace `response.json()`, inservible
 * para respuestas binarias. Aquí replicamos lo esencial que sí importa —
 * `credentials: 'include'` (cookie httpOnly), timeout con AbortController y un
 * error explícito— para no quedar con descargas colgadas ni fallos silenciosos.
 * Prefiere el filename de `Content-Disposition` del servidor y cae al fallback.
 */
export const downloadBlob = async (path: string, fallbackFilename: string): Promise<void> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS);
  try {
    const res = await fetch(buildApiUrl(path), { credentials: 'include', signal: controller.signal });
    if (!res.ok) throw new Error(`Error ${res.status} al exportar`);
    const blob = await res.blob();
    const filename = res.headers.get('Content-Disposition')?.match(/filename="?([^"]+)"?/)?.[1] ?? fallbackFilename;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new Error('La descarga tardó demasiado. Inténtalo de nuevo.');
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
};
