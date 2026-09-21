import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { recordActivityHeartbeat } from "../../domain/activity/api";
import { APIError } from "../../domain/project/http";
import { getAnyTask, updateAnyTask } from "../../domain/planning/api";
import type { PlanningTask } from "../../domain/planning/planning";
import { useToast } from "../../providers/toast-provider";
import {
  ACTIVITY_RECOVERY_PENDING_EVENT,
  acknowledgeActivityFinalization,
  readActivityRecovery,
  removeActivityHandoff,
} from "./activity-recovery";
import {
  useActivitySession,
  type ActivityStart,
  type StudySessionState,
} from "./use-study-session";

export type ActivityRuntimeState = StudySessionState & {
  handoffTask: PlanningTask | null;
  handoffResolving: boolean;
  handoffBusy: boolean;
  finalizingCount: number;
  taskRevision: number;
  completeHandoffTask: () => Promise<void>;
  keepHandoffTaskOpen: () => void;
};

const ActivityRuntimeContext = createContext<ActivityRuntimeState | null>(null);

export function ActivityRuntimeProvider({ children }: { children: ReactNode }) {
  const { showToast } = useToast();
  const activity = useActivitySession();
  const [handoffTask, setHandoffTask] = useState<PlanningTask | null>(null);
  const [handoffResolving, setHandoffResolving] = useState(false);
  const [handoffBusy, setHandoffBusy] = useState(false);
  const [finalizingCount, setFinalizingCount] = useState(
    () => readActivityRecovery().finalizations.length,
  );
  const [taskRevision, setTaskRevision] = useState(0);
  const recoverySyncing = useRef(false);

  const reconcileRecovery = useCallback(async () => {
    if (recoverySyncing.current) return;
    recoverySyncing.current = true;

    try {
      let recovery = readActivityRecovery();
      setFinalizingCount(recovery.finalizations.length);

      for (const finalization of recovery.finalizations) {
        try {
          await recordActivityHeartbeat(finalization.sessionId, finalization.heartbeat);
          acknowledgeActivityFinalization(
            finalization.sessionId,
            finalization.handoffTaskId,
          );
        } catch {
          // The durable outbox keeps the user intent for the next retry trigger.
        }
      }

      recovery = readActivityRecovery();
      setFinalizingCount(recovery.finalizations.length);

      if (recovery.handoffTaskIds.length === 0) {
        setHandoffTask(null);
        setHandoffResolving(false);
        return;
      }

      setHandoffResolving(true);
      for (const taskId of recovery.handoffTaskIds) {
        try {
          const task = await getAnyTask(taskId);
          setTaskRevision((value) => value + 1);
          if (task.completedAt) {
            removeActivityHandoff(taskId);
            continue;
          }
          setHandoffTask(task);
          return;
        } catch (error) {
          if (error instanceof APIError && error.status === 404) {
            removeActivityHandoff(taskId);
            setTaskRevision((value) => value + 1);
            continue;
          }
          setHandoffTask(null);
          showToast({
            kind: "error",
            message: error instanceof Error
              ? `Activity ended, but task status could not be loaded: ${error.message}`
              : "Activity ended, but task status could not be loaded.",
          });
          return;
        }
      }

      setHandoffTask(null);
    } finally {
      setHandoffResolving(false);
      recoverySyncing.current = false;
    }
  }, [showToast]);

  useEffect(() => {
    const retry = () => { void reconcileRecovery(); };
    const retryWhenVisible = () => {
      if (document.visibilityState === "visible") retry();
    };

    retry();
    window.addEventListener("online", retry);
    window.addEventListener(ACTIVITY_RECOVERY_PENDING_EVENT, retry);
    document.addEventListener("visibilitychange", retryWhenVisible);
    return () => {
      window.removeEventListener("online", retry);
      window.removeEventListener(ACTIVITY_RECOVERY_PENDING_EVENT, retry);
      document.removeEventListener("visibilitychange", retryWhenVisible);
    };
  }, [reconcileRecovery]);

  function start(context?: ActivityStart) {
    if (!activity.canStart) return;
    activity.start(context);
  }

  function end() {
    const finalization = activity.end();
    if (finalization) void reconcileRecovery();
  }

  async function completeHandoffTask() {
    if (!handoffTask || handoffBusy) return;
    const target = handoffTask;
    setHandoffBusy(true);
    try {
      await updateAnyTask(target.id, {
        completed: true,
        version: target.version,
      });
      removeActivityHandoff(target.id);
      setHandoffTask(null);
      setTaskRevision((value) => value + 1);
    } catch (error) {
      let completionConfirmed = false;
      let taskRemoved = false;
      try {
        const latest = await getAnyTask(target.id);
        completionConfirmed = Boolean(latest.completedAt);
        if (completionConfirmed) {
          removeActivityHandoff(target.id);
          setHandoffTask(null);
        } else {
          setHandoffTask(latest);
        }
        setTaskRevision((value) => value + 1);
      } catch (refreshError) {
        if (refreshError instanceof APIError && refreshError.status === 404) {
          taskRemoved = true;
          removeActivityHandoff(target.id);
          setHandoffTask(null);
          setTaskRevision((value) => value + 1);
        }
      }
      if (!completionConfirmed && !taskRemoved) {
        showToast({
          kind: "error",
          message: error instanceof Error ? error.message : "Could not complete task.",
        });
      }
    } finally {
      setHandoffBusy(false);
      void reconcileRecovery();
    }
  }

  function keepHandoffTaskOpen() {
    if (!handoffTask) return;
    removeActivityHandoff(handoffTask.id);
    setHandoffTask(null);
    void reconcileRecovery();
  }

  const value: ActivityRuntimeState = {
    ...activity,
    canStart: activity.canStart,
    start,
    end,
    handoffTask,
    handoffResolving,
    handoffBusy,
    finalizingCount,
    taskRevision,
    completeHandoffTask,
    keepHandoffTaskOpen,
  };

  return (
    <ActivityRuntimeContext.Provider value={value}>
      {children}
    </ActivityRuntimeContext.Provider>
  );
}

export function useActivityRuntime() {
  const context = useContext(ActivityRuntimeContext);
  if (!context) throw new Error("useActivityRuntime must be used inside ActivityRuntimeProvider");
  return context;
}
