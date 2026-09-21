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
  workspaceId: string;
  milestoneId?: string;
  title: string;
  description: string;
  position: number;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  version: number;
}

export interface WorkspacePlan {
  workspaceId: string;
  milestones: PlanningMilestone[];
  tasks: PlanningTask[];
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
