const DATABASE_NAME = "notespace-local-assets";
const STORE_NAME = "images";
const MAX_ASSET_BYTES = 8 * 1024 * 1024;
const MAX_IMAGE_DIMENSION = 2560;

export type LocalImageAsset = {
  id: string;
  workspaceId: string;
  blob: Blob;
  mimeType: string;
  createdAt: number;
};

type StoredImageAsset = LocalImageAsset & { key: string };

const memoryAssets = new Map<string, StoredImageAsset>();
let databasePromise: Promise<IDBDatabase | null> | null = null;

function assetKey(workspaceId: string, assetId: string) {
  return `${workspaceId}:${assetId}`;
}

function openDatabase() {
  if (databasePromise) return databasePromise;
  if (typeof indexedDB === "undefined") return Promise.resolve(null);

  databasePromise = new Promise((resolve) => {
    const request = indexedDB.open(DATABASE_NAME, 1);
    request.onerror = () => resolve(null);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE_NAME, { keyPath: "key" });
    };
  });
  return databasePromise;
}

function putAsset(record: StoredImageAsset) {
  memoryAssets.set(record.key, record);
  return openDatabase().then((database) => {
    if (!database) return;
    return new Promise<void>((resolve) => {
      const transaction = database.transaction(STORE_NAME, "readwrite");
      transaction.objectStore(STORE_NAME).put(record);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => resolve();
    });
  });
}

export function createLocalAssetId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `asset-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export async function normalizeImageBlob(source: Blob) {
  if (!source.type.startsWith("image/")) throw new Error("Only image files can be pasted.");

  let normalized = source;
  if (typeof createImageBitmap === "function" && typeof document !== "undefined") {
    try {
      const bitmap = await createImageBitmap(source);
      const scale = Math.min(1, MAX_IMAGE_DIMENSION / Math.max(bitmap.width, bitmap.height));
      if (scale < 1 || source.size > MAX_ASSET_BYTES) {
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(bitmap.width * scale));
        canvas.height = Math.max(1, Math.round(bitmap.height * scale));
        canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        const compressed = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", 0.86));
        if (compressed && (scale < 1 || compressed.size < source.size)) normalized = compressed;
      }
      bitmap.close();
    } catch {
      // Keep the original blob when a browser cannot decode the clipboard image.
    }
  }

  if (normalized.size > MAX_ASSET_BYTES) throw new Error("This image is larger than the 8 MiB local limit.");
  return normalized;
}

export async function storeImageAsset(workspaceId: string, id: string, source: Blob) {
  const blob = await normalizeImageBlob(source);
  const record: StoredImageAsset = {
    key: assetKey(workspaceId, id),
    id,
    workspaceId,
    blob,
    mimeType: blob.type || source.type,
    createdAt: Date.now(),
  };
  await putAsset(record);
  return record;
}

export async function loadImageAsset(workspaceId: string, id: string) {
  const key = assetKey(workspaceId, id);
  const cached = memoryAssets.get(key);
  if (cached) return cached;
  const database = await openDatabase();
  if (!database) return null;

  return new Promise<LocalImageAsset | null>((resolve) => {
    const request = database.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).get(key);
    request.onerror = () => resolve(null);
    request.onsuccess = () => {
      const record = request.result as StoredImageAsset | undefined;
      if (record) memoryAssets.set(key, record);
      resolve(record ?? null);
    };
  });
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
