import { AsyncLocalStorage } from "async_hooks";

interface RequestContext {
  requestId?: string;
}

export const requestContext = new AsyncLocalStorage<RequestContext>();

/** Returns the requestId for the current async context (if any). */
export const getRequestId = (): string | undefined => requestContext.getStore()?.requestId;
