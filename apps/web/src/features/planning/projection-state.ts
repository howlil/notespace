import type { InboxProjection, PlanningTask, TodayProjection } from "../../domain/planning/planning";

export function belongsToToday(task: PlanningTask, date: string) {
  if (!task.plannedFor) return false;
  return task.plannedFor === date || (task.plannedFor < date && !task.completedAt);
}

export function removeFromTodayPatch() {
  return { plannedFor: "" } as const;
}

export function applyTodayTaskUpdate(
  projection: TodayProjection,
  updated: PlanningTask,
): TodayProjection {
  if (!belongsToToday(updated, projection.date)) {
    return {
      ...projection,
      tasks: projection.tasks.filter((task) => task.id !== updated.id),
    };
  }
  return {
    ...projection,
    tasks: projection.tasks.map((task) =>
      task.id === updated.id ? { ...task, ...updated } : task),
  };
}

export function belongsToInbox(task: PlanningTask) {
  return !task.workspaceId && !task.plannedFor && !task.completedAt;
}

export function applyInboxTaskUpdate(
  projection: InboxProjection,
  updated: PlanningTask,
): InboxProjection {
  if (!belongsToInbox(updated)) {
    return {
      ...projection,
      tasks: projection.tasks.filter((task) => task.id !== updated.id),
    };
  }
  return {
    ...projection,
    tasks: projection.tasks.map((task) => task.id === updated.id ? updated : task),
  };
}
