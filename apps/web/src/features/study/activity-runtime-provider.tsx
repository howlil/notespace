import { createContext, useContext, useState, type ReactNode } from "react";
import { APIError } from "../../domain/project/http";
import { getAnyTask, updateAnyTask } from "../../domain/planning/api";
import type { PlanningTask } from "../../domain/planning/planning";
import { useToast } from "../../providers/toast-provider";
import {
  useActivitySession,
  type ActivityStart,
  type StudySessionState,
} from "./use-study-session";

export type ActivityRuntimeState = StudySessionState & {
  handoffTask: PlanningTask | null;
  handoffResolving: boolean;
  handoffBusy: boolean;
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
  const [taskRevision, setTaskRevision] = useState(0);

  const handoffBlocksStart = handoffResolving || Boolean(handoffTask) || handoffBusy;
  const canStart = activity.canStart && !handoffBlocksStart;

  function start(context?: ActivityStart) {
    if (!canStart) return;
    activity.start(context);
  }

  function end() {
    const taskId = activity.activeContext?.taskId;
    activity.end();
    if (!taskId) return;

    setHandoffResolving(true);
    void getAnyTask(taskId)
      .then((task) => {
        setTaskRevision((value) => value + 1);
        setHandoffTask(task.completedAt ? null : task);
      })
      .catch((error) => {
        if (error instanceof APIError && error.status === 404) {
          setHandoffTask(null);
          setTaskRevision((value) => value + 1);
          return;
        }
        showToast({
          kind: "error",
          message: error instanceof Error
            ? `Activity ended, but task status could not be loaded: ${error.message}`
            : "Activity ended, but task status could not be loaded.",
        });
      })
      .finally(() => setHandoffResolving(false));
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
      setHandoffTask(null);
      setTaskRevision((value) => value + 1);
    } catch (error) {
      let completionConfirmed = false;
      let taskRemoved = false;
      try {
        const latest = await getAnyTask(target.id);
        completionConfirmed = Boolean(latest.completedAt);
        setHandoffTask(completionConfirmed ? null : latest);
        setTaskRevision((value) => value + 1);
      } catch (refreshError) {
        if (refreshError instanceof APIError && refreshError.status === 404) {
          taskRemoved = true;
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
    }
  }

  const value: ActivityRuntimeState = {
    ...activity,
    canStart,
    start,
    end,
    handoffTask,
    handoffResolving,
    handoffBusy,
    taskRevision,
    completeHandoffTask,
    keepHandoffTaskOpen: () => setHandoffTask(null),
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
