import type { Project, ProjectContent } from "../../domain/project/project";

export interface HttpTransport {
  fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
}

export interface ProjectHttpClient {
  request<T>(url: string, init?: RequestInit): Promise<T>;
  getProject(id: string): Promise<Project>;
  updateProjectSnapshot(id: string, content: ProjectContent, version: number): Promise<Project>;
}

export class APIError extends Error {
  readonly status: number;
  readonly code?: string;

  constructor(status: number, message: string, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export const fetchTransport: HttpTransport = {
  fetch: (input, init) => globalThis.fetch(input, init),
};

const requestWithTransport = async <T>(transport: HttpTransport, url: string, init?: RequestInit): Promise<T> => {
  const response = await transport.fetch(url, {
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
};

export const json = (body: unknown) => ({
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

export function createProjectHttpClient(transport: HttpTransport = fetchTransport): ProjectHttpClient {
  const request = <T>(url: string, init?: RequestInit) => requestWithTransport<T>(transport, url, init);
  return {
    request,
    getProject: (id) => request<Project>(`/api/workspaces/${encodeURIComponent(id)}`),
    updateProjectSnapshot: (id, content, version) => request<Project>(`/api/workspaces/${encodeURIComponent(id)}`, {
      method: "PATCH",
      ...json({ ...content, version }),
    }),
  };
}

const defaultClient = createProjectHttpClient();

export const request = <T>(url: string, init?: RequestInit, transport: HttpTransport = fetchTransport) =>
  requestWithTransport<T>(transport, url, init);
export const getProject = defaultClient.getProject;
export const updateProjectSnapshot = defaultClient.updateProjectSnapshot;
