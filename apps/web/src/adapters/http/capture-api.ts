import { fetchTransport, json, request, type HttpTransport } from "./client.ts";
import type { CaptureItem, OrganizeCaptureInput } from "../../domain/capture/capture.ts";

const capturePath = (id: string) => `/api/captures/${encodeURIComponent(id)}`;

export function createCaptureHttpClient(transport: HttpTransport = fetchTransport) {
  return {
    list: () => request<CaptureItem[]>("/api/captures", undefined, transport),
    get: (id: string) => request<CaptureItem>(capturePath(id), undefined, transport),
    create: (content: string) => request<CaptureItem>("/api/captures", {
      method: "POST", ...json({ content }),
    }, transport),
    update: (id: string, version: number, content: string) =>
      request<CaptureItem>(capturePath(id), { method: "PATCH", ...json({ version, content }) }, transport),
    remove: (id: string, version: number) =>
      request<void>(capturePath(id), { method: "DELETE", headers: { "If-Match": `"${version}"` } }, transport),
    organize: (id: string, input: OrganizeCaptureInput) =>
      request<CaptureItem>(`${capturePath(id)}/organize`, { method: "POST", ...json(input) }, transport),
  };
}
const captures = createCaptureHttpClient();
export const listCaptures = captures.list;
export const getCapture = captures.get;
export const createCapture = captures.create;
export const updateCapture = captures.update;
export const deleteCapture = captures.remove;
export const organizeCapture = captures.organize;
