import type { LocalImageAsset } from "./image-types";

const DATABASE_NAME = "notespace-local-assets";
const STORE_NAME = "images";

type StoredImageAsset = LocalImageAsset & { key: string };

const memoryAssets = new Map<string, LocalImageAsset>();
let databasePromise: Promise<IDBDatabase | null> | null = null;

export function imageCacheKey(workspaceId: string, assetId: string) {
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

export function getMemoryImageAsset(workspaceId: string, id: string) {
  return memoryAssets.get(imageCacheKey(workspaceId, id)) ?? null;
}

export function putLocalImageCache(record: LocalImageAsset) {
  const key = imageCacheKey(record.workspaceId, record.id);
  memoryAssets.set(key, record);
  const stored: StoredImageAsset = { ...record, key };

  return openDatabase().then((database) => {
    if (!database) return;
    return new Promise<void>((resolve) => {
      const transaction = database.transaction(STORE_NAME, "readwrite");
      transaction.objectStore(STORE_NAME).put(stored);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => resolve();
    });
  });
}

export async function removeLocalImageCache(workspaceId: string, id: string) {
  const key = imageCacheKey(workspaceId, id);
  memoryAssets.delete(key);
  const database = await openDatabase();
  if (!database) return;
  await new Promise<void>((resolve) => {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).delete(key);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => resolve();
  });
}

export async function readLocalImageCache(workspaceId: string, id: string) {
  const key = imageCacheKey(workspaceId, id);
  const cached = memoryAssets.get(key);
  if (cached) return cached;

  const database = await openDatabase();
  if (!database) return null;

  return new Promise<LocalImageAsset | null>((resolve) => {
    const request = database.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).get(key);
    request.onerror = () => resolve(null);
    request.onsuccess = () => {
      const stored = request.result as StoredImageAsset | undefined;
      if (!stored) {
        resolve(null);
        return;
      }
      const { key: _key, ...record } = stored;
      memoryAssets.set(key, record);
      resolve(record);
    };
  });
}

export async function pruneLocalImageCache(
  workspaceId: string,
  referencedIds: Iterable<string>,
) {
  const keep = new Set(referencedIds);
  for (const [key, record] of [...memoryAssets.entries()]) {
    if (record.workspaceId === workspaceId && !keep.has(record.id)) memoryAssets.delete(key);
  }

  const database = await openDatabase();
  if (!database) return;

  await new Promise<void>((resolve) => {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    const request = transaction.objectStore(STORE_NAME).openCursor();
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) return;
      const record = cursor.value as StoredImageAsset;
      if (record.workspaceId === workspaceId && !keep.has(record.id)) cursor.delete();
      cursor.continue();
    };
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => resolve();
  });
}
