import { fetchTransport, json, request, type HttpTransport } from "./client.ts";
import type { PlanningTask } from "../../domain/planning/planning";

// Retained for persisted Activity task-completion handoffs, including pending
// handoffs restored after an offline restart. The retired Today/Inbox UI does
// not own these API calls.
export function createPlanningHttpClient(transport: HttpTransport = fetchTransport) {
  return {
    getAnyTask: (taskId: string) =>
      request<PlanningTask>(`/api/tasks/${encodeURIComponent(taskId)}`, undefined, transport),

    updateAnyTask: (
      taskId: string,
      input: { title?: string; description?: string; completed?: boolean; plannedFor?: string; version: number },
    ) => request<PlanningTask>(`/api/tasks/${encodeURIComponent(taskId)}`, {
      method: "PATCH", ...json(input),
    }, transport),
  };
}

const defaultPlanningClient = createPlanningHttpClient();
export const getAnyTask = defaultPlanningClient.getAnyTask;
export const updateAnyTask = defaultPlanningClient.updateAnyTask;
