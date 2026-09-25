import type { ActivityHeartbeat } from "../../adapters/http/activity-api.ts";
import {
  readLocalStorage,
  removeLocalStorage,
  writeLocalStorage,
} from "../../shared/browser/local-storage.ts";
import type {
  ActivitySessionContext,
  ManualActivitySession,
} from "./activity-timer.ts";

export const activitySessionStorageKey = "notespace.activity-session";

export function legacyActivitySessionStorageKey(workspaceId: string) {
  return `notespace.study-session:${workspaceId}`;
}

export type ActivitySessionStorage = {
  read: (key: string) => string | null;
  write: (key: string, value: string) => boolean;
  remove: (key: string) => void;
};

const browserActivitySessionStorage: ActivitySessionStorage = {
  read: readLocalStorage,
  write: writeLocalStorage,
  remove: removeLocalStorage,
};

export function validStoredActivitySession(value: Partial<ManualActivitySession>) {
  return (
    typeof value.segmentId === "string"
    && typeof value.activityDate === "string"
    && (value.status === "running" || value.status === "paused")
    && typeof value.sessionAccumulatedSeconds === "number"
    && typeof value.segmentAccumulatedSeconds === "number"
    && (value.runningSince === null || typeof value.runningSince === "number")
    && typeof value.baselineTodaySeconds === "number"
    && typeof value.baselineTotalSeconds === "number"
  );
}

function withLogicalSessionId(value: Partial<ManualActivitySession>) {
  const logicalSessionId = typeof value.logicalSessionId === "string" && value.logicalSessionId
    ? value.logicalSessionId
    : value.segmentId!.split(":", 1)[0] || value.segmentId!;
  return { ...value, logicalSessionId } as ManualActivitySession;
}

export function readStoredActivitySession(
  defaultContext?: ActivitySessionContext,
  storage: ActivitySessionStorage = browserActivitySessionStorage,
): ManualActivitySession | null {
  try {
    const current = storage.read(activitySessionStorageKey);
    if (current) {
      const value = JSON.parse(current) as Partial<ManualActivitySession>;
      if (!validStoredActivitySession(value) || !value.context?.title || !value.context?.activityType) return null;
      return withLogicalSessionId(value);
    }

    if (!defaultContext?.workspaceId) return null;
    const legacyKey = legacyActivitySessionStorageKey(defaultContext.workspaceId);
    const raw = storage.read(legacyKey);
    if (!raw) return null;

    const value = JSON.parse(raw) as Partial<ManualActivitySession>;
    if (!validStoredActivitySession(value)) return null;

    const migrated = {
      ...withLogicalSessionId(value),
      context: defaultContext,
    } as ManualActivitySession;

    if (storage.write(activitySessionStorageKey, JSON.stringify(migrated))) {
      storage.remove(legacyKey);
    }
    return migrated;
  } catch {
    return null;
  }
}

export function writeStoredActivitySession(
  session: ManualActivitySession | null,
  storage: ActivitySessionStorage = browserActivitySessionStorage,
) {
  if (session) return storage.write(activitySessionStorageKey, JSON.stringify(session));
  storage.remove(activitySessionStorageKey);
  return true;
}

export function hasLegacyStoredActivitySession(
  workspaceId: string,
  storage: ActivitySessionStorage = browserActivitySessionStorage,
) {
  return Boolean(storage.read(legacyActivitySessionStorageKey(workspaceId)));
}

export function activityHeartbeatFor(
  context: ActivitySessionContext,
  date: string,
  activeSeconds: number,
  finish: boolean,
): ActivityHeartbeat {
  return {
    activityDate: date,
    activeSeconds,
    finish,
    title: context.title,
    activityType: context.activityType,
    ...(context.workspaceId ? { workspaceId: context.workspaceId } : {}),
    ...(context.workspaceTitleSnapshot ? { workspaceTitleSnapshot: context.workspaceTitleSnapshot } : {}),
    ...(context.taskId ? { taskId: context.taskId } : {}),
    ...(context.taskTitleSnapshot ? { taskTitleSnapshot: context.taskTitleSnapshot } : {}),
  };
}
