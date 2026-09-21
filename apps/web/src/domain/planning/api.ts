import { json, request } from "../project/http";
import type { PlanningMilestone, PlanningTask, WorkspacePlan } from "./planning";

const workspacePath = (workspaceId: string) => `/api/workspaces/${encodeURIComponent(workspaceId)}`;

export const getWorkspacePlan = (workspaceId: string) =>
  request<WorkspacePlan>(`${workspacePath(workspaceId)}/plan`);

export const createMilestone = (workspaceId: string, title: string) =>
  request<PlanningMilestone>(`${workspacePath(workspaceId)}/milestones`, {
    method: "POST",
    ...json({ title }),
  });

export const updateMilestone = (
  workspaceId: string,
  milestoneId: string,
  input: { title?: string; completed?: boolean; version: number },
) => request<PlanningMilestone>(
  `${workspacePath(workspaceId)}/milestones/${encodeURIComponent(milestoneId)}`,
  { method: "PATCH", ...json(input) },
);

export const deleteMilestone = (workspaceId: string, milestoneId: string, version: number) =>
  request<void>(`${workspacePath(workspaceId)}/milestones/${encodeURIComponent(milestoneId)}`, {
    method: "DELETE",
    headers: { "If-Match": `"${version}"` },
  });

export const createTask = (workspaceId: string, title: string, milestoneId?: string) =>
  request<PlanningTask>(`${workspacePath(workspaceId)}/tasks`, {
    method: "POST",
    ...json({ title, ...(milestoneId ? { milestoneId } : {}) }),
  });

export const updateTask = (
  workspaceId: string,
  taskId: string,
  input: { title?: string; description?: string; completed?: boolean; version: number },
) => request<PlanningTask>(
  `${workspacePath(workspaceId)}/tasks/${encodeURIComponent(taskId)}`,
  { method: "PATCH", ...json(input) },
);

export const deleteTask = (workspaceId: string, taskId: string, version: number) =>
  request<void>(`${workspacePath(workspaceId)}/tasks/${encodeURIComponent(taskId)}`, {
    method: "DELETE",
    headers: { "If-Match": `"${version}"` },
  });
