import type { Project, ProjectContent } from "./project";

export class APIError extends Error {
  readonly status: number;
  readonly code?: string;

  constructor(status: number, message: string, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    signal: init?.signal ?? AbortSignal.timeout(20_000),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new APIError(
      response.status,
      body?.error || "Unable to reach Notespace. Please retry.",
      body?.code,
    );
  }
  return response.status === 204 ? (undefined as T) : response.json();
}

export const json = (body: unknown) => ({
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

export const getProject = (id: string) => request<Project>(`/api/workspaces/${encodeURIComponent(id)}`);

export const updateProjectSnapshot = (id: string, content: ProjectContent, version: number) => request<Project>(`/api/workspaces/${encodeURIComponent(id)}`, {
  method: "PATCH",
  ...json({ ...content, version }),
});
