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

function assetUrl(workspaceId: string, assetId: string) {
  return `/api/workspaces/${encodeURIComponent(workspaceId)}/assets/${encodeURIComponent(assetId)}`;
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

function putLocalCache(record: StoredImageAsset) {
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

async function readLocalCache(workspaceId: string, id: string) {
  const key = assetKey(workspaceId, id);
  const cached = memoryAssets.get(key);
  if (cached) return cached;
  const database = await openDatabase();
  if (!database) return null;
  return new Promise<StoredImageAsset | null>((resolve) => {
    const request = database.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).get(key);
    request.onerror = () => resolve(null);
    request.onsuccess = () => {
      const record = request.result as StoredImageAsset | undefined;
      if (record) memoryAssets.set(key, record);
      resolve(record ?? null);
    };
  });
}

async function uploadAsset(workspaceId: string, id: string, blob: Blob) {
  const response = await fetch(assetUrl(workspaceId, id), {
    method: "PUT",
    headers: { "Content-Type": blob.type || "application/octet-stream" },
    body: blob,
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.error || "Could not store image on this Notespace instance.");
  }
}

async function loadRemoteAsset(workspaceId: string, id: string) {
  const response = await fetch(assetUrl(workspaceId, id), { signal: AbortSignal.timeout(20_000) });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error("Could not load image from this Notespace instance.");
  const blob = await response.blob();
  const createdAtHeader = response.headers.get("X-Notespace-Created-At");
  const createdAt = createdAtHeader ? Date.parse(createdAtHeader) : Date.now();
  const record: StoredImageAsset = {
    key: assetKey(workspaceId, id),
    id,
    workspaceId,
    blob,
    mimeType: blob.type || response.headers.get("Content-Type") || "application/octet-stream",
    createdAt: Number.isFinite(createdAt) ? createdAt : Date.now(),
  };
  await putLocalCache(record);
  return record;
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

  if (normalized.size > MAX_ASSET_BYTES) throw new Error("This image is larger than the 8 MiB asset limit.");
  return normalized;
}

export async function storeImageAsset(workspaceId: string, id: string, source: Blob) {
  const blob = await normalizeImageBlob(source);
  await uploadAsset(workspaceId, id, blob);
  const record: StoredImageAsset = {
    key: assetKey(workspaceId, id),
    id,
    workspaceId,
    blob,
    mimeType: blob.type || source.type,
    createdAt: Date.now(),
  };
  await putLocalCache(record);
  return record;
}

export async function loadImageAsset(workspaceId: string, id: string) {
  const key = assetKey(workspaceId, id);
  const memory = memoryAssets.get(key);
  if (memory) return memory;

  try {
    const remote = await loadRemoteAsset(workspaceId, id);
    if (remote) return remote;
  } catch {
    // A local cache may still make an acknowledged legacy workspace readable.
  }

  const legacy = await readLocalCache(workspaceId, id);
  if (!legacy) return null;
  // Read-through migration: legacy browser-only assets become server-owned once seen.
  try { await uploadAsset(workspaceId, id, legacy.blob); } catch { /* keep legacy readable offline */ }
  return legacy;
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
