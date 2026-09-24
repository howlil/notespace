import { fetchTransport, json, request, type HttpTransport } from "./client.ts";
import type { InboxProjection, PlanningMilestone, PlanningTask, TodayProjection, WorkspacePlan } from "../../domain/planning/planning";

const workspacePath = (workspaceId: string) => `/api/workspaces/${encodeURIComponent(workspaceId)}`;

export function createPlanningHttpClient(transport: HttpTransport = fetchTransport) {
  return {
    getWorkspacePlan: (workspaceId: string) =>
      request<WorkspacePlan>(`${workspacePath(workspaceId)}/plan`, undefined, transport),

    createMilestone: (workspaceId: string, title: string) =>
      request<PlanningMilestone>(`${workspacePath(workspaceId)}/milestones`, {
        method: "POST",
        ...json({ title }),
      }, transport),

    updateMilestone: (
      workspaceId: string,
      milestoneId: string,
      input: { title?: string; completed?: boolean; version: number },
    ) => request<PlanningMilestone>(
      `${workspacePath(workspaceId)}/milestones/${encodeURIComponent(milestoneId)}`,
      { method: "PATCH", ...json(input) },
      transport,
    ),

    deleteMilestone: (workspaceId: string, milestoneId: string, version: number) =>
      request<void>(`${workspacePath(workspaceId)}/milestones/${encodeURIComponent(milestoneId)}`, {
        method: "DELETE",
        headers: { "If-Match": `"${version}"` },
      }, transport),

    createTask: (workspaceId: string, title: string, milestoneId?: string) =>
      request<PlanningTask>(`${workspacePath(workspaceId)}/tasks`, {
        method: "POST",
        ...json({ title, ...(milestoneId ? { milestoneId } : {}) }),
      }, transport),

    updateTask: (
      workspaceId: string,
      taskId: string,
      input: { title?: string; description?: string; completed?: boolean; plannedFor?: string; version: number },
    ) => request<PlanningTask>(
      `${workspacePath(workspaceId)}/tasks/${encodeURIComponent(taskId)}`,
      { method: "PATCH", ...json(input) },
      transport,
    ),

    deleteTask: (workspaceId: string, taskId: string, version: number) =>
      request<void>(`${workspacePath(workspaceId)}/tasks/${encodeURIComponent(taskId)}`, {
        method: "DELETE",
        headers: { "If-Match": `"${version}"` },
      }, transport),

    getToday: (date: string) =>
      request<TodayProjection>(`/api/tasks/today?date=${encodeURIComponent(date)}`, undefined, transport),

    getInbox: () =>
      request<InboxProjection>("/api/tasks/inbox", undefined, transport),

    getAnyTask: (taskId: string) =>
      request<PlanningTask>(`/api/tasks/${encodeURIComponent(taskId)}`, undefined, transport),

    createStandaloneTask: (title: string, plannedFor?: string) =>
      request<PlanningTask>("/api/tasks", {
        method: "POST",
        ...json({ title, ...(plannedFor ? { plannedFor } : {}) }),
      }, transport),

    updateAnyTask: (
      taskId: string,
      input: { title?: string; description?: string; completed?: boolean; plannedFor?: string; version: number },
    ) => request<PlanningTask>(`/api/tasks/${encodeURIComponent(taskId)}`, {
      method: "PATCH",
      ...json(input),
    }, transport),

    deleteAnyTask: (taskId: string, version: number) =>
      request<void>(`/api/tasks/${encodeURIComponent(taskId)}`, {
        method: "DELETE",
        headers: { "If-Match": `"${version}"` },
      }, transport),
  };
}

const defaultPlanningClient = createPlanningHttpClient();

export const getWorkspacePlan = defaultPlanningClient.getWorkspacePlan;
export const createMilestone = defaultPlanningClient.createMilestone;
export const updateMilestone = defaultPlanningClient.updateMilestone;
export const deleteMilestone = defaultPlanningClient.deleteMilestone;
export const createTask = defaultPlanningClient.createTask;
export const updateTask = defaultPlanningClient.updateTask;
export const deleteTask = defaultPlanningClient.deleteTask;
export const getToday = defaultPlanningClient.getToday;
export const getInbox = defaultPlanningClient.getInbox;
export const getAnyTask = defaultPlanningClient.getAnyTask;
export const createStandaloneTask = defaultPlanningClient.createStandaloneTask;
export const updateAnyTask = defaultPlanningClient.updateAnyTask;
export const deleteAnyTask = defaultPlanningClient.deleteAnyTask;
