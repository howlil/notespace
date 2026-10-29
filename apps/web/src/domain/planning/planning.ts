// Retained because Activity finalization can complete a Task authored by
// an earlier Notespace version. SQLite remains the authoritative source.
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
