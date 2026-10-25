import { APIError } from "../http/client.ts";

type PendingCreate = { key: string; payload: string };
const prefix = "notespace:planning-create:";
const memory = new Map<string, PendingCreate>();

export function pendingCreation(scope: string): PendingCreate | null {
  const current = memory.get(scope);
  if (current) return current;
  try {
    const raw = sessionStorage.getItem(prefix + scope);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && "key" in parsed && "payload" in parsed &&
        typeof parsed.key === "string" && typeof parsed.payload === "string") {
      return { key: parsed.key, payload: parsed.payload };
    }
  } catch {
    // Storage can be disabled; the current submission still gets a fresh key.
  }
  return null;
}

export function creationIdentity(scope: string, payload: string): string {
  const existing = pendingCreation(scope);
  if (existing?.payload === payload) return existing.key;
  const key = crypto.randomUUID();
  memory.set(scope, { key, payload });
  try {
    sessionStorage.setItem(prefix + scope, JSON.stringify({ key, payload }));
  } catch {
    // Reconciliation still works within the current submission.
  }
  return key;
}

export function confirmCreation(scope: string, key: string): void {
  if (pendingCreation(scope)?.key !== key) return;
  memory.delete(scope);
  try {
    sessionStorage.removeItem(prefix + scope);
  } catch {
    // The response was already confirmed.
  }
}

/** Retrying a *keyed* POST is safe even when its first response was lost. */
export async function confirmKeyedPost<T>(commit: () => Promise<T>): Promise<T> {
  try {
    return await commit();
  } catch (error) {
    if (error instanceof APIError && error.status >= 400 && error.status < 500 && error.status !== 408) {
      throw error;
    }
    return commit();
  }
}
