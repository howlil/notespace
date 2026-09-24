import { fetchTransport, json, request, type HttpTransport } from "./client.ts";
import type { ActivitySession, ActivityStats, ActivitySummary, ActivityDayDetail, ActivityHeartbeat } from "../../domain/activity/activity";
export type { ActivityType, ActivitySession, ActivityStats, ActivityDay, ActivitySummary, ActivityDayDetail, ActivityHeartbeat } from "../../domain/activity/activity";

export function createActivityHttpClient(transport: HttpTransport = fetchTransport) {
  return {
    recordActivityHeartbeat: (sessionId: string, body: ActivityHeartbeat) =>
      request<ActivitySession>(
        `/api/activity/sessions/${encodeURIComponent(sessionId)}`,
        { method: "PUT", ...json(body) },
        transport,
      ),

    listActivitySessions: (limit = 20) =>
      request<ActivitySession[]>(`/api/activity/sessions?limit=${limit}`, undefined, transport),

    deleteActivitySession: (sessionId: string) =>
      request<void>(`/api/activity/sessions/${encodeURIComponent(sessionId)}`, {
        method: "DELETE",
      }, transport),

    getActivityStats: (date: string) =>
      request<ActivityStats>(`/api/activity/stats?date=${encodeURIComponent(date)}`, undefined, transport),

    getActivitySummary: (from: string, to: string) =>
      request<ActivitySummary>(
        `/api/activity?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
        undefined,
        transport,
      ),

    getActivityDayDetail: (date: string) =>
      request<ActivityDayDetail>(`/api/activity/${encodeURIComponent(date)}`, undefined, transport),
  };
}

const defaultActivityClient = createActivityHttpClient();

export const recordActivityHeartbeat = defaultActivityClient.recordActivityHeartbeat;
export const listActivitySessions = defaultActivityClient.listActivitySessions;
export const deleteActivitySession = defaultActivityClient.deleteActivitySession;
export const getActivityStats = defaultActivityClient.getActivityStats;
export const getActivitySummary = defaultActivityClient.getActivitySummary;
export const getActivityDayDetail = defaultActivityClient.getActivityDayDetail;
