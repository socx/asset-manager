import { AsyncLocalStorage } from 'async_hooks';

interface TraceStore {
  traceId: string;
}

const als = new AsyncLocalStorage<TraceStore>();

export function runWithTraceId<T>(traceId: string, fn: () => T): T {
  return als.run({ traceId }, fn);
}

export function getTraceId(): string | undefined {
  return als.getStore()?.traceId;
}
