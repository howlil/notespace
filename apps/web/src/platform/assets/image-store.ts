import {
  getMemoryImageAsset,
  imageCacheKey,
  putLocalImageCache,
  readLocalImageCache,
  removeLocalImageCache,
  clearLocalImageCache,
} from "./image-cache";
import { loadRemoteImageAsset, uploadRemoteImageAsset } from "./image-api";
import { normalizeImageBlob } from "./image-normalizer";
import { createImageStore } from "./image-store-core";

export type { LocalImageAsset } from "./image-types";
export { normalizeImageBlob } from "./image-normalizer";

const defaultImageStore = createImageStore({
  normalize: normalizeImageBlob,
  uploadRemote: uploadRemoteImageAsset,
  loadRemote: loadRemoteImageAsset,
  getMemory: getMemoryImageAsset,
  putLocal: (record) => putLocalImageCache(record, true),
  readLocal: readLocalImageCache,
  removeLocal: removeLocalImageCache,
  cacheKey: imageCacheKey,
  now: () => Date.now(),
});

export const storeImageAsset = defaultImageStore.storeImageAsset;
export const loadImageAsset = defaultImageStore.loadImageAsset;

export async function clearImageCache(workspaceId?: string) {
  defaultImageStore.invalidateCache(workspaceId);
  await clearLocalImageCache(workspaceId);
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
