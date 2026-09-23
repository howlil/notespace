import type { Workspace, WorkspaceContent } from "../../domain/workspace/workspace";

export interface HttpTransport {
  fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
}

export interface WorkspaceHttpClient {
  request<T>(url: string, init?: RequestInit): Promise<T>;
  getWorkspace(id: string): Promise<Workspace>;
  updateWorkspaceSnapshot(id: string, content: WorkspaceContent, version: number): Promise<Workspace>;
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

export function createWorkspaceHttpClient(transport: HttpTransport = fetchTransport): WorkspaceHttpClient {
  const request = <T>(url: string, init?: RequestInit) => requestWithTransport<T>(transport, url, init);
  return {
    request,
    getWorkspace: (id) => request<Workspace>(`/api/workspaces/${encodeURIComponent(id)}`),
    updateWorkspaceSnapshot: (id, content, version) => request<Workspace>(`/api/workspaces/${encodeURIComponent(id)}`, {
      method: "PATCH",
      ...json({ ...content, version }),
    }),
  };
}

const defaultClient = createWorkspaceHttpClient();

export const request = <T>(url: string, init?: RequestInit, transport: HttpTransport = fetchTransport) =>
  requestWithTransport<T>(transport, url, init);
export const getWorkspace = defaultClient.getWorkspace;
export const updateWorkspaceSnapshot = defaultClient.updateWorkspaceSnapshot;
