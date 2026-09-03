import type {
  CategorySummary,
  Project,
  ProjectContent,
  ProjectSummary,
} from "./project";

export class APIError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new APIError(
      response.status,
      body?.error || "Unable to reach Notespace. Please retry.",
    );
  }
  return response.status === 204 ? (undefined as T) : response.json();
}

const json = (body: unknown) => ({
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});
export const listProjects = () => request<ProjectSummary[]>("/api/projects");
export const listCategories = () =>
  request<CategorySummary[]>("/api/categories");
export const getProject = (id: string) =>
  request<Project>(`/api/projects/${encodeURIComponent(id)}`);
export const createProject = (title: string, categoryId: string) =>
  request<Project>("/api/projects", {
    method: "POST",
    ...json({ title, categoryId }),
  });
export const createCategory = (title: string) =>
  request<CategorySummary>("/api/categories", {
    method: "POST",
    ...json({ title }),
  });
export const updateCategory = (id: string, title: string) =>
  request<CategorySummary>(`/api/categories/${encodeURIComponent(id)}`, {
    method: "PATCH",
    ...json({ title }),
  });
export const deleteCategory = (id: string) =>
  request<void>(`/api/categories/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
export const renameProject = (id: string, title: string) =>
  request<Project>(`/api/projects/${encodeURIComponent(id)}/title`, {
    method: "PATCH",
    ...json({ title }),
  });
export const deleteProject = (id: string) =>
  request<void>(`/api/projects/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });

export type StudyStats = { todaySeconds: number; totalSeconds: number };
export type StudySession = {
  id: string;
  workspaceId: string;
  workspaceTitleSnapshot: string;
  activityDate: string;
  startedAt: string;
  endedAt: string | null;
  activeSeconds: number;
  lastHeartbeatAt: string;
};
export type StudyDay = { date: string; activeSeconds: number };
export type StudyActivity = {
  todaySeconds: number;
  weekSeconds: number;
  currentStreak: number;
  days: StudyDay[];
};
export type StudyDayDetail = {
  date: string;
  activeSeconds: number;
  workspaces: Array<{ workspaceId: string; title: string; deleted: boolean; activeSeconds: number }>;
};

export const recordStudyHeartbeat = (workspaceId: string, sessionId: string, body: { activityDate: string; activeSeconds: number; finish: boolean }) =>
  request<StudySession>(`/api/workspaces/${encodeURIComponent(workspaceId)}/study-sessions/${encodeURIComponent(sessionId)}`, {
    method: "PUT",
    ...json(body),
  });
export const getWorkspaceStudy = (workspaceId: string, date: string) =>
  request<StudyStats>(`/api/workspaces/${encodeURIComponent(workspaceId)}/study?date=${encodeURIComponent(date)}`);
export const getStudyActivity = (from: string, to: string) =>
  request<StudyActivity>(`/api/study/activity?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
export const getStudyDayDetail = (date: string) =>
  request<StudyDayDetail>(`/api/study/activity/${encodeURIComponent(date)}`);
export async function saveProject(
  id: string,
  content: ProjectContent,
  version: number,
) {
  try {
    return await request<Project>(`/api/projects/${encodeURIComponent(id)}`, {
      method: "PATCH",
      ...json({ ...content, version }),
    });
  } catch (error) {
    // A lost acknowledgement may have committed. Recognize the exact retry safely.
    if (error instanceof APIError && error.status === 409) {
      const current = await getProject(id);
      if (
        current.version === version + 1 &&
        current.title === content.title.trim() &&
        current.splitRatio === content.splitRatio &&
        JSON.stringify(current.document) === JSON.stringify(content.document) &&
        JSON.stringify(current.notes) === JSON.stringify(content.notes) &&
        JSON.stringify(current.canvas) === JSON.stringify(content.canvas)
        && JSON.stringify(current.references) === JSON.stringify(content.references)
      )
        return current;
    }
    throw error;
  }
}
