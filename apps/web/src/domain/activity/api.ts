import { json, request } from "../project/http";

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
  taskId?: string;
};

export const recordActivityHeartbeat = (
  sessionId: string,
  body: ActivityHeartbeat,
) => request<ActivitySession>(
  `/api/activity/sessions/${encodeURIComponent(sessionId)}`,
  { method: "PUT", ...json(body) },
);

export const listActivitySessions = (limit = 20) =>
  request<ActivitySession[]>(`/api/activity/sessions?limit=${limit}`);

export const deleteActivitySession = (sessionId: string) =>
  request<void>(`/api/activity/sessions/${encodeURIComponent(sessionId)}`, {
    method: "DELETE",
  });

export const getActivityStats = (date: string) =>
  request<ActivityStats>(`/api/activity/stats?date=${encodeURIComponent(date)}`);

export const getActivitySummary = (from: string, to: string) =>
  request<ActivitySummary>(
    `/api/activity?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
  );

export const getActivityDayDetail = (date: string) =>
  request<ActivityDayDetail>(`/api/activity/${encodeURIComponent(date)}`);
