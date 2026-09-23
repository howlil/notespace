import { json, request } from "./client";
import type { ActivityType, ActivitySession, ActivityStats, ActivityDay, ActivitySummary, ActivityDayDetail, ActivityHeartbeat } from "../../domain/activity/activity";
export type { ActivityType, ActivitySession, ActivityStats, ActivityDay, ActivitySummary, ActivityDayDetail, ActivityHeartbeat } from "../../domain/activity/activity";

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
