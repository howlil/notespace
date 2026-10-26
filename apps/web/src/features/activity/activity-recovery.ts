import type { ActivityHeartbeat } from "../../adapters/http/activity-api";
import { activitySessionStorageKey } from "./activity-session-storage.ts";
import { readLocalStorage, removeLocalStorage, writeLocalStorage } from "../../shared/browser/local-storage.ts";

export type PendingActivityFinalization = {
  sessionId: string;
  heartbeat: ActivityHeartbeat;
  handoffTaskId?: string;
  /** Distinguishes user End from the ongoing session's day rollover. */
  endSession?: true;
};

export type ActivityRecoveryState = {
  finalizations: PendingActivityFinalization[];
  handoffTaskIds: string[];
};

// Keep the v1 key for migration of pending finalizations from existing installs.
export const ACTIVITY_RECOVERY_STORAGE_KEY = "notespace.activity-recovery:v1";
export const ACTIVITY_RECOVERY_FINALIZATION_PREFIX = "notespace.activity-finalization:v2:";
// Immutable records avoid cross-tab lost updates to the same session key.
export const ACTIVITY_RECOVERY_ATTEMPT_PREFIX = "notespace.activity-finalization:v3:";
export const ACTIVITY_RECOVERY_HANDOFF_PREFIX = "notespace.activity-handoff:v2:";
export const ACTIVITY_RECOVERY_PENDING_EVENT = "notespace:activity-recovery-pending";

const emptyRecovery = (): ActivityRecoveryState => ({ finalizations: [], handoffTaskIds: [] });
const finalizationKey = (id: string) => ACTIVITY_RECOVERY_FINALIZATION_PREFIX + encodeURIComponent(id);
const attemptKey = (id: string) =>
  ACTIVITY_RECOVERY_ATTEMPT_PREFIX + encodeURIComponent(id) + ":" + crypto.randomUUID();
const belongsToAttempt = (key: string, id: string) =>
  key.startsWith(ACTIVITY_RECOVERY_ATTEMPT_PREFIX + encodeURIComponent(id) + ":");
const handoffKey = (id: string) => ACTIVITY_RECOVERY_HANDOFF_PREFIX + encodeURIComponent(id);

function isOptionalString(value: unknown) {
  return value === undefined || typeof value === "string";
}

function isHeartbeat(value: unknown): value is ActivityHeartbeat {
  if (!value || typeof value !== "object") return false;
  const heartbeat = value as Partial<ActivityHeartbeat>;
  return (
    typeof heartbeat.activityDate === "string"
    && typeof heartbeat.activeSeconds === "number"
    && Number.isFinite(heartbeat.activeSeconds)
    && heartbeat.activeSeconds >= 0
    && heartbeat.finish === true
    && typeof heartbeat.title === "string"
    && typeof heartbeat.activityType === "string"
    && isOptionalString(heartbeat.workspaceId)
    && isOptionalString(heartbeat.workspaceTitleSnapshot)
    && isOptionalString(heartbeat.taskId)
    && isOptionalString(heartbeat.taskTitleSnapshot)
  );
}

function isFinalization(value: unknown): value is PendingActivityFinalization {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<PendingActivityFinalization>;
  return (
    typeof item.sessionId === "string"
    && item.sessionId.length > 0
    && isHeartbeat(item.heartbeat)
    && isOptionalString(item.handoffTaskId)
    && (item.endSession === undefined || item.endSession === true)
  );
}

function parseFinalization(raw: string | null): PendingActivityFinalization | null {
  if (!raw) return null;
  try {
    const item: unknown = JSON.parse(raw);
    return isFinalization(item) ? item : null;
  } catch {
    return null;
  }
}

function parseLegacyRecovery(): ActivityRecoveryState {
  const raw = readLocalStorage(ACTIVITY_RECOVERY_STORAGE_KEY);
  if (!raw) return emptyRecovery();
  try {
    const state = JSON.parse(raw) as Partial<ActivityRecoveryState>;
    return {
      finalizations: Array.isArray(state.finalizations) ? state.finalizations.filter(isFinalization) : [],
      handoffTaskIds: Array.isArray(state.handoffTaskIds)
        ? state.handoffTaskIds.filter((v): v is string => typeof v === "string" && v.length > 0)
        : [],
    };
  } catch {
    return emptyRecovery();
  }
}

function storageKeys(prefix: string): string[] {
  if (typeof window === "undefined") return [];
  try {
    const keys: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (key?.startsWith(prefix)) keys.push(key);
    }
    return keys;
  } catch {
    return [];
  }
}

/** Move existing pending work to independent keys without dropping v1 before all writes succeed. */
function migrateLegacyRecovery(): boolean {
  if (!readLocalStorage(ACTIVITY_RECOVERY_STORAGE_KEY)) return true;
  const legacy = parseLegacyRecovery();
  for (const item of legacy.finalizations) {
    const key = finalizationKey(item.sessionId);
    if (readLocalStorage(key) === null && !writeLocalStorage(key, JSON.stringify(item))) return false;
  }
  for (const taskId of legacy.handoffTaskIds) {
    const key = handoffKey(taskId);
    if (readLocalStorage(key) === null && !writeLocalStorage(key, "1")) return false;
  }
  removeLocalStorage(ACTIVITY_RECOVERY_STORAGE_KEY);
  return readLocalStorage(ACTIVITY_RECOVERY_STORAGE_KEY) === null;
}

export function readActivityRecovery(): ActivityRecoveryState {
  // A failed migration keeps v1 readable and retryable.
  migrateLegacyRecovery();
  const legacy = parseLegacyRecovery();
  const finalizations = new Map<string, PendingActivityFinalization>();
  const include = (item: PendingActivityFinalization) => {
    const current = finalizations.get(item.sessionId);
    if (!current
      || item.heartbeat.activeSeconds > current.heartbeat.activeSeconds
      || (item.heartbeat.activeSeconds === current.heartbeat.activeSeconds
        && ((item.endSession && !current.endSession)
          || (item.endSession === current.endSession
            && (!current.handoffTaskId || !!item.handoffTaskId))))) {
      finalizations.set(item.sessionId, item);
    }
  };
  for (const item of legacy.finalizations) include(item);
  for (const key of storageKeys(ACTIVITY_RECOVERY_FINALIZATION_PREFIX)) {
    const item = parseFinalization(readLocalStorage(key));
    if (item && finalizationKey(item.sessionId) === key) include(item);
  }
  for (const key of storageKeys(ACTIVITY_RECOVERY_ATTEMPT_PREFIX)) {
    const item = parseFinalization(readLocalStorage(key));
    if (item && belongsToAttempt(key, item.sessionId)) include(item);
  }
  const handoffTaskIds = new Set(legacy.handoffTaskIds);
  for (const key of storageKeys(ACTIVITY_RECOVERY_HANDOFF_PREFIX)) {
    if (readLocalStorage(key) === null) continue;
    const taskId = key.slice(ACTIVITY_RECOVERY_HANDOFF_PREFIX.length);
    try {
      const decoded = decodeURIComponent(taskId);
      if (decoded && handoffKey(decoded) === key) handoffTaskIds.add(decoded);
    } catch { /* Ignore malformed persisted key. */ }
  }
  return { finalizations: [...finalizations.values()], handoffTaskIds: [...handoffTaskIds] };
}

export function enqueueActivityFinalization(finalization: PendingActivityFinalization) {
  if (!migrateLegacyRecovery()) return false;
  // Retried midnight rollovers may enqueue the same payload every second if
  // persisting the next day's session fails. Reuse an already durable record
  // rather than creating an unbounded series of UUID keys while offline.
  const existing = readActivityRecovery().finalizations.find((item) =>
    item.sessionId === finalization.sessionId);
  if (existing && sameFinalization(existing, finalization)) return true;
  // Every attempt has its own immutable key. Another tab may enqueue or
  // acknowledge the same session in the middle of this write without
  // overwriting a newer duration.
  const written = writeLocalStorage(attemptKey(finalization.sessionId), JSON.stringify(finalization));
  if (written && typeof window !== "undefined") {
    window.dispatchEvent(new Event(ACTIVITY_RECOVERY_PENDING_EVENT));
  }
  return written;
}

/** A failed End must not flush finish while the exact logical session is still recoverable. */
export function canFlushActivityFinalization(finalization: PendingActivityFinalization): boolean {
  if (!finalization.endSession) return true;
  if (typeof window === "undefined") return false;
  try {
    // Unlike readLocalStorage(), a read error must fail closed, not look like
    // an absent key, or an unavailable storage backend could end a live timer.
    const raw = window.localStorage.getItem(activitySessionStorageKey);
    if (raw === null || raw === "null") return true;
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object") return false;
    const snapshot = value as { logicalSessionId?: unknown; segmentId?: unknown };
    if (typeof snapshot.segmentId !== "string") return false;
    const storedId = typeof snapshot.logicalSessionId === "string" && snapshot.logicalSessionId
      ? snapshot.logicalSessionId
      : logicalSessionId(snapshot.segmentId);
    return storedId !== logicalSessionId(finalization.sessionId);
  } catch {
    return false;
  }
}

// A response acknowledges only the exact payload it sent.
function sameFinalization(a: PendingActivityFinalization, b: PendingActivityFinalization) {
  const x = a.heartbeat;
  const y = b.heartbeat;
  return a.sessionId === b.sessionId && a.handoffTaskId === b.handoffTaskId
    && a.endSession === b.endSession
    && x.activityDate === y.activityDate && x.activeSeconds === y.activeSeconds
    && x.finish === y.finish && x.title === y.title && x.activityType === y.activityType
    && x.workspaceId === y.workspaceId && x.workspaceTitleSnapshot === y.workspaceTitleSnapshot
    && x.taskId === y.taskId && x.taskTitleSnapshot === y.taskTitleSnapshot;
}

export function acknowledgeActivityFinalization(confirmed: PendingActivityFinalization) {
  if (!migrateLegacyRecovery()) return false;
  // Acknowledgement only deletes records whose keys were observed before
  // this call. A concurrent enqueue uses a new key and remains durable.
  const candidates = [finalizationKey(confirmed.sessionId),
    ...storageKeys(ACTIVITY_RECOVERY_ATTEMPT_PREFIX).filter((key) =>
      belongsToAttempt(key, confirmed.sessionId))];
  const entries = candidates.map((key) => ({ key, item: parseFinalization(readLocalStorage(key)) }))
    .filter((entry): entry is { key: string; item: PendingActivityFinalization } =>
      entry.item !== null && (entry.key === finalizationKey(entry.item.sessionId)
        || belongsToAttempt(entry.key, entry.item.sessionId)));
  const hasConfirmed = entries.some(({ item }) => sameFinalization(item, confirmed));
  if (!hasConfirmed) return true;
  // A stale successful PUT must not surface a task handoff belonging to
  // a superseded attempt, even if its own record is now acknowledged.
  const winner = readActivityRecovery().finalizations.find((item) =>
    item.sessionId === confirmed.sessionId);
  if (confirmed.handoffTaskId && winner && sameFinalization(winner, confirmed)
    && !writeLocalStorage(handoffKey(confirmed.handoffTaskId), "1")) return false;
  for (const { key, item } of entries) {
    const dominated = sameFinalization(item, confirmed)
      || item.heartbeat.activeSeconds < confirmed.heartbeat.activeSeconds
      || (item.heartbeat.activeSeconds === confirmed.heartbeat.activeSeconds
        && confirmed.endSession === true && !item.endSession);
    if (!dominated) continue;
    removeLocalStorage(key);
    if (readLocalStorage(key) !== null) return false;
  }
  return true;
}

export function removeActivityHandoff(taskId: string) {
  if (!migrateLegacyRecovery()) return false;
  const key = handoffKey(taskId);
  removeLocalStorage(key);
  return readLocalStorage(key) === null;
}

function logicalSessionId(sessionId: string) {
  const separator = sessionId.indexOf(":");
  return separator < 0 ? sessionId : sessionId.slice(0, separator);
}

/** Stop retrying any queued segments for a session deleted in the server. */
export function discardDeletedActivitySession(sessionId: string) {
  if (!migrateLegacyRecovery()) return false;
  const id = logicalSessionId(sessionId);
  for (const prefix of [ACTIVITY_RECOVERY_FINALIZATION_PREFIX, ACTIVITY_RECOVERY_ATTEMPT_PREFIX]) {
    for (const key of storageKeys(prefix)) {
      const item = parseFinalization(readLocalStorage(key));
      if (item && logicalSessionId(item.sessionId) === id
        && (prefix === ACTIVITY_RECOVERY_FINALIZATION_PREFIX
          ? key === finalizationKey(item.sessionId) : belongsToAttempt(key, item.sessionId))) {
        removeLocalStorage(key);
        if (readLocalStorage(key) !== null) return false;
      }
    }
  }
  return true;
}
