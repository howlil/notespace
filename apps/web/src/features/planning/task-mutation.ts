import { APIError } from "../../adapters/http/client.ts";
import { getAnyTask } from "../../adapters/http/planning-api.ts";
import type { PlanningTask } from "../../domain/planning/planning";

/** No automatic replay of an ambiguous mutation: that can reverse a later edit. */
export type TaskPatch = {
  title?: string;
  description?: string;
  completed?: boolean;
  plannedFor?: string;
};

export type TaskMutationOutcome =
  | { status: "confirmed"; task: PlanningTask; reconciled: boolean }
  | { status: "conflict"; task: PlanningTask }
  | { status: "missing" }
  | { status: "unknown" };

export function matchesRequestedPatch(task: PlanningTask, patch: TaskPatch) {
  if (patch.title !== undefined && task.title !== patch.title.trim()) return false;
  if (patch.description !== undefined && task.description !== patch.description) return false;
  if (patch.completed !== undefined && Boolean(task.completedAt) !== patch.completed) return false;
  if (patch.plannedFor !== undefined && (task.plannedFor ?? "") !== patch.plannedFor) return false;
  return true;
}

/**
 * After a failed update, use authoritative task identity + version to distinguish
 * a lost success response from a conflicting writer. Never retry the PATCH.
 */
export async function reconcileTaskPatch(
  original: PlanningTask,
  patch: TaskPatch,
  commit: () => Promise<PlanningTask>,
  read: (id: string) => Promise<PlanningTask> = getAnyTask,
): Promise<TaskMutationOutcome> {
  try {
    return { status: "confirmed", task: await commit(), reconciled: false };
  } catch {
    try {
      const current = await read(original.id);
      if (current.version === original.version + 1 && matchesRequestedPatch(current, patch)) {
        return { status: "confirmed", task: current, reconciled: true };
      }
      return { status: "conflict", task: current };
    } catch (error) {
      if (error instanceof APIError && error.status === 404) return { status: "missing" };
      return { status: "unknown" };
    }
  }
}

export type TaskDeletionOutcome =
  | { status: "confirmed" }
  | { status: "exists"; task: PlanningTask }
  | { status: "unknown" };

/** Verify absence after an ambiguous DELETE. Never retry the original request. */
export async function reconcileTaskDelete(
  taskId: string,
  commit: () => Promise<void>,
  read: (id: string) => Promise<PlanningTask> = getAnyTask,
): Promise<TaskDeletionOutcome> {
  try {
    await commit();
    return { status: "confirmed" };
  } catch {
    try {
      return { status: "exists", task: await read(taskId) };
    } catch (error) {
      if (error instanceof APIError && error.status === 404) return { status: "confirmed" };
      return { status: "unknown" };
    }
  }
}

/** A replayed successful creation must not duplicate an already-loaded row. */
export function mergeCreatedTask(tasks: PlanningTask[], created: PlanningTask): PlanningTask[] {
  if (!tasks.some((task) => task.id === created.id)) return [...tasks, created];
  return tasks.map((task) =>
    task.id === created.id && task.version <= created.version ? created : task);
}
