import type { Response } from "express";

// ── SSE broadcaster ───────────────────────────────────────────────────────────
// In-memory map: userId → Set of active SSE response streams
// NOTE: single-process only. For multi-instance deployments add Redis pub/sub.
const sseClients = new Map<string, Set<Response>>();
const MAX_SSE_PER_USER = 3; // prevent memory exhaustion from many open tabs
const SSE_MAX_SESSION_MS = 4 * 60 * 60 * 1000; // 4 h max lifetime — force reconnect

export const registerSseClient = (userId: string, res: Response): void => {
  if (!sseClients.has(userId)) sseClients.set(userId, new Set());
  const clients = sseClients.get(userId)!;

  // Evict oldest connection when limit is exceeded
  if (clients.size >= MAX_SSE_PER_USER) {
    const oldest = clients.values().next().value as Response | undefined;
    if (oldest) {
      try { oldest.end(); } catch { /* already closed */ }
      clients.delete(oldest);
    }
  }
  clients.add(res);

  // Limpiar cliente al desconectar (browser cerrado, navegación, etc.)
  res.on('close', () => {
    const clientSet = sseClients.get(userId);
    if (clientSet) {
      clientSet.delete(res);
      if (clientSet.size === 0) sseClients.delete(userId);
    }
  });

  // Force reconnect after max session lifetime to prevent zombie connections
  const maxSessionTimer = setTimeout(() => {
    try { res.end(); } catch { /* already closed */ }
    unregisterSseClient(userId, res);
  }, SSE_MAX_SESSION_MS);
  if (maxSessionTimer.unref) maxSessionTimer.unref();
};

export const unregisterSseClient = (userId: string, res: Response): void => {
  const clients = sseClients.get(userId);
  if (!clients) return;
  clients.delete(res);
  if (clients.size === 0) sseClients.delete(userId);
};

/** Returns the total number of active SSE connections across all users. */
export const getSseConnectionCount = (): number => {
  let total = 0;
  for (const clients of sseClients.values()) total += clients.size;
  return total;
};

export const broadcastToUser = (userId: string, payload: unknown): void => {
  const clients = sseClients.get(userId);
  if (!clients || clients.size === 0) return;
  const data = `data: ${JSON.stringify(payload)}\n\n`;
  for (const res of clients) {
    try { res.write(data); } catch { clients.delete(res); }
  }
};
