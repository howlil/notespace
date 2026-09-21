export interface PlanningMilestone {
  id: string;
  workspaceId: string;
  title: string;
  position: number;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  version: number;
}

export interface PlanningTask {
  id: string;
  workspaceId?: string;
  milestoneId?: string;
  title: string;
  description: string;
  position: number;
  plannedFor?: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  version: number;
}

export interface TodayTask extends PlanningTask {
  workspaceTitle?: string;
  milestoneTitle?: string;
}

export interface TodayProjection {
  date: string;
  tasks: TodayTask[];
}

export interface InboxProjection {
  tasks: PlanningTask[];
}

export interface WorkspacePlan {
  workspaceId: string;
  milestones: PlanningMilestone[];
  tasks: PlanningTask[];
}

export function localDateKey(value = new Date()) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function tasksForMilestone(plan: WorkspacePlan, milestoneId?: string) {
  return plan.tasks
    .filter((task) => milestoneId ? task.milestoneId === milestoneId : !task.milestoneId)
    .sort((a, b) => a.position - b.position || a.id.localeCompare(b.id));
}

export function milestoneProgress(plan: WorkspacePlan, milestoneId: string) {
  const tasks = tasksForMilestone(plan, milestoneId);
  return {
    done: tasks.filter((task) => Boolean(task.completedAt)).length,
    total: tasks.length,
  };
}
