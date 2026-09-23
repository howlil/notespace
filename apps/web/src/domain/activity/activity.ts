export type ActivityType = "build" | "learn" | "read" | "write" | "exercise" | "other";

export type ActivitySession = {
  id: string;
  workspaceId?: string;
  workspaceTitleSnapshot?: string;
  taskId?: string;
  taskTitleSnapshot?: string;
  title: string;
  activityType: ActivityType;
  activityDate: string;
  startedAt: string;
  endedAt: string | null;
  activeSeconds: number;
  lastHeartbeatAt: string;
};

export type ActivityStats = {
  todaySeconds: number;
  totalSeconds: number;
};

export type ActivityDay = {
  date: string;
  activeSeconds: number;
};

export type ActivitySummary = {
  todaySeconds: number;
  weekSeconds: number;
  currentStreak: number;
  days: ActivityDay[];
};

export type ActivityDayDetail = {
  date: string;
  activeSeconds: number;
  workspaces: Array<{
    workspaceId?: string;
    title: string;
    deleted: boolean;
    activeSeconds: number;
  }>;
};

export type ActivityHeartbeat = {
  activityDate: string;
  activeSeconds: number;
  finish: boolean;
  title: string;
  activityType: ActivityType;
  workspaceId?: string;
  workspaceTitleSnapshot?: string;
  taskId?: string;
  taskTitleSnapshot?: string;
};
