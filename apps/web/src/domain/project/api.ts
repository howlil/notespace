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
export const deleteProject = (id: string) =>
  request<void>(`/api/projects/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
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
