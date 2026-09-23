import type { LocalImageAsset } from "./image-types";

function assetUrl(workspaceId: string, assetId: string) {
  return `/api/workspaces/${encodeURIComponent(workspaceId)}/assets/${encodeURIComponent(assetId)}`;
}

export async function uploadRemoteImageAsset(
  workspaceId: string,
  id: string,
  blob: Blob,
) {
  const response = await fetch(assetUrl(workspaceId, id), {
    method: "PUT",
    headers: { "Content-Type": blob.type || "application/octet-stream" },
    body: blob,
    signal: AbortSignal.timeout(20_000),
  });

  // A 404 means ownership disappeared while the upload was in flight.
  if (response.status === 404) return false;
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.error || "Could not store image on this Notespace instance.");
  }
  return true;
}

export async function loadRemoteImageAsset(
  workspaceId: string,
  id: string,
): Promise<LocalImageAsset | null> {
  const response = await fetch(assetUrl(workspaceId, id), {
    signal: AbortSignal.timeout(20_000),
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error("Could not load image from this Notespace instance.");

  const blob = await response.blob();
  const createdAtHeader = response.headers.get("X-Notespace-Created-At");
  const createdAt = createdAtHeader ? Date.parse(createdAtHeader) : Date.now();

  return {
    id,
    workspaceId,
    blob,
    mimeType: blob.type || response.headers.get("Content-Type") || "application/octet-stream",
    createdAt: Number.isFinite(createdAt) ? createdAt : Date.now(),
  };
}
