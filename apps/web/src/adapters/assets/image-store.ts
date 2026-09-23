import {
  getMemoryImageAsset,
  imageCacheKey,
  putLocalImageCache,
  readLocalImageCache,
  removeLocalImageCache,
} from "./image-cache";
import { loadRemoteImageAsset, uploadRemoteImageAsset } from "./image-api";
import { normalizeImageBlob } from "./image-normalizer";
import type { LocalImageAsset } from "./image-types";

export type { LocalImageAsset } from "./image-types";
export { normalizeImageBlob } from "./image-normalizer";
export { pruneLocalImageCache } from "./image-cache";

const inFlightAssetLoads = new Map<string, Promise<LocalImageAsset | null>>();

export function createLocalAssetId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `asset-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export async function storeImageAsset(workspaceId: string, id: string, source: Blob) {
  const blob = await normalizeImageBlob(source);
  const accepted = await uploadRemoteImageAsset(workspaceId, id, blob);
  if (!accepted) {
    await removeLocalImageCache(workspaceId, id);
    return null;
  }

  const record: LocalImageAsset = {
    id,
    workspaceId,
    blob,
    mimeType: blob.type || source.type,
    createdAt: Date.now(),
  };
  await putLocalImageCache(record);
  return record;
}

export async function loadImageAsset(workspaceId: string, id: string) {
  const memory = getMemoryImageAsset(workspaceId, id);
  if (memory) return memory;

  const key = imageCacheKey(workspaceId, id);
  const existing = inFlightAssetLoads.get(key);
  if (existing) return existing;

  const load = (async () => {
    try {
      const remote = await loadRemoteImageAsset(workspaceId, id);
      if (remote) {
        await putLocalImageCache(remote);
        return remote;
      }
    } catch {
      // A local cache may still make an acknowledged legacy workspace readable.
    }

    const legacy = await readLocalImageCache(workspaceId, id);
    if (!legacy) return null;

    // Read-through migration: legacy browser-only assets become server-owned once seen.
    try {
      const accepted = await uploadRemoteImageAsset(workspaceId, id, legacy.blob);
      if (!accepted) {
        await removeLocalImageCache(workspaceId, id);
        return null;
      }
    } catch {
      // Keep legacy readable when the server is temporarily unavailable.
    }
    return legacy;
  })().finally(() => {
    if (inFlightAssetLoads.get(key) === load) inFlightAssetLoads.delete(key);
  });

  inFlightAssetLoads.set(key, load);
  return load;
}

export async function blobFromDataUrl(dataUrl: string) {
  const response = await fetch(dataUrl);
  return response.blob();
}

export function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error("Could not read image asset."));
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(blob);
  });
}
