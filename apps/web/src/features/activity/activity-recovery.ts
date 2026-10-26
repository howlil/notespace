import type { ActivityHeartbeat } from "../../adapters/http/activity-api";
import { readLocalStorage, removeLocalStorage, writeLocalStorage } from "../../shared/browser/local-storage.ts";

export type PendingActivityFinalization = {
  sessionId: string;
  heartbeat: ActivityHeartbeat;
  handoffTaskId?: string;
};

export type ActivityRecoveryState = {
  finalizations: PendingActivityFinalization[];
  handoffTaskIds: string[];
};

export const ACTIVITY_RECOVERY_STORAGE_KEY = "notespace.activity-recovery:v1";
export const ACTIVITY_RECOVERY_PENDING_EVENT = "notespace:activity-recovery-pending";

const emptyRecovery = (): ActivityRecoveryState => ({
  finalizations: [],
  handoffTaskIds: [],
});

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
  );
}

export function readActivityRecovery(): ActivityRecoveryState {
  const raw = readLocalStorage(ACTIVITY_RECOVERY_STORAGE_KEY);
  if (!raw) return emptyRecovery();

  try {
    const parsed = JSON.parse(raw) as Partial<ActivityRecoveryState>;
    const finalizations = Array.isArray(parsed.finalizations)
      ? parsed.finalizations.filter(isFinalization)
      : [];
    const handoffTaskIds = Array.isArray(parsed.handoffTaskIds)
      ? parsed.handoffTaskIds.filter((value): value is string => typeof value === "string" && value.length > 0)
      : [];

    return {
      finalizations,
      handoffTaskIds: [...new Set(handoffTaskIds)],
    };
  } catch {
    return emptyRecovery();
  }
}

export function writeActivityRecovery(state: ActivityRecoveryState) {
  const next: ActivityRecoveryState = {
    finalizations: state.finalizations,
    handoffTaskIds: [...new Set(state.handoffTaskIds)],
  };
  if (next.finalizations.length === 0 && next.handoffTaskIds.length === 0) {
    removeLocalStorage(ACTIVITY_RECOVERY_STORAGE_KEY);
    return true;
  }
  return writeLocalStorage(ACTIVITY_RECOVERY_STORAGE_KEY, JSON.stringify(next));
}

export function enqueueActivityFinalization(finalization: PendingActivityFinalization) {
  const current = readActivityRecovery();
  const finalizations = current.finalizations.filter((item) => item.sessionId !== finalization.sessionId);
  finalizations.push(finalization);
  const written = writeActivityRecovery({ ...current, finalizations });
  if (written && typeof window !== "undefined") {
    window.dispatchEvent(new Event(ACTIVITY_RECOVERY_PENDING_EVENT));
  }
  return written;
}

// A response acknowledges only the exact payload it sent. Another tab may
// enqueue a newer finalization for the same segment while this PUT is in flight.
function sameFinalization(a: PendingActivityFinalization, b: PendingActivityFinalization) {
  const x = a.heartbeat;
  const y = b.heartbeat;
  return a.sessionId === b.sessionId && a.handoffTaskId === b.handoffTaskId
    && x.activityDate === y.activityDate && x.activeSeconds === y.activeSeconds
    && x.finish === y.finish && x.title === y.title && x.activityType === y.activityType
    && x.workspaceId === y.workspaceId && x.workspaceTitleSnapshot === y.workspaceTitleSnapshot
    && x.taskId === y.taskId && x.taskTitleSnapshot === y.taskTitleSnapshot;
}

export function acknowledgeActivityFinalization(confirmed: PendingActivityFinalization) {
  const current = readActivityRecovery();
  const pending = current.finalizations.find((item) => sameFinalization(item, confirmed));
  if (!pending) return true;
  const finalizations = current.finalizations.filter((item) => item.sessionId !== confirmed.sessionId);
  // A late success cannot generate a handoff after a deletion or replacement.
  const handoffTaskIds = pending.handoffTaskId && !current.handoffTaskIds.includes(pending.handoffTaskId)
    ? [...current.handoffTaskIds, pending.handoffTaskId]
    : current.handoffTaskIds;
  return writeActivityRecovery({ finalizations, handoffTaskIds });
}

export function removeActivityHandoff(taskId: string) {
  const current = readActivityRecovery();
  return writeActivityRecovery({
    ...current,
    handoffTaskIds: current.handoffTaskIds.filter((id) => id !== taskId),
  });
}

function logicalSessionId(sessionId: string) {
  const separator = sessionId.indexOf(":");
  return separator < 0 ? sessionId : sessionId.slice(0, separator);
}

/** Stop retrying any queued segments for a session deleted in the server. */
export function discardDeletedActivitySession(sessionId: string) {
  const current = readActivityRecovery();
  const logicalId = logicalSessionId(sessionId);
  return writeActivityRecovery({
    ...current,
    finalizations: current.finalizations.filter((item) => logicalSessionId(item.sessionId) !== logicalId),
  });
}
