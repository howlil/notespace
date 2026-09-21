import type { ActivityHeartbeat } from "../../domain/activity/api";
import { readLocalStorage, removeLocalStorage, writeLocalStorage } from "../../browser/local-storage";

export type PendingActivityFinalization = {
  sessionId: string;
  heartbeat: ActivityHeartbeat;
  handoffTaskId?: string;
};

export type ActivityRecoveryState = {
  finalizations: PendingActivityFinalization[];
  handoffTaskIds: string[];
};

const recoveryStorageKey = "notespace.activity-recovery:v1";

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
  const raw = readLocalStorage(recoveryStorageKey);
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
    removeLocalStorage(recoveryStorageKey);
    return true;
  }
  return writeLocalStorage(recoveryStorageKey, JSON.stringify(next));
}

export function enqueueActivityFinalization(finalization: PendingActivityFinalization) {
  const current = readActivityRecovery();
  const finalizations = current.finalizations.filter((item) => item.sessionId !== finalization.sessionId);
  finalizations.push(finalization);
  return writeActivityRecovery({ ...current, finalizations });
}

export function acknowledgeActivityFinalization(sessionId: string, handoffTaskId?: string) {
  const current = readActivityRecovery();
  const finalizations = current.finalizations.filter((item) => item.sessionId !== sessionId);
  const handoffTaskIds = handoffTaskId && !current.handoffTaskIds.includes(handoffTaskId)
    ? [...current.handoffTaskIds, handoffTaskId]
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
