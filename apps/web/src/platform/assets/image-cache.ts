import type { LocalImageAsset } from "./image-types";

const DATABASE_NAME = "notespace-local-assets";
const STORE_NAME = "images";
const MEMORY_BYTES = 32 * 1024 * 1024;
const MEMORY_ENTRIES = 64;
const PERSISTENT_BYTES = 128 * 1024 * 1024;
type StoredImageAsset = LocalImageAsset & { key: string; confirmedAt?: number; lastAccessedAt?: number };
type CacheEntry = { key: string; bytes: number; confirmedAt?: number; lastAccessedAt: number };

export function imageCacheKey(workspaceId: string, assetId: string) {
  return `${workspaceId}:${assetId}`;
}

export function createMemoryImageCache(maxBytes = MEMORY_BYTES, maxEntries = MEMORY_ENTRIES) {
  const assets = new Map<string, LocalImageAsset>();
  let bytes = 0;
  function remove(key: string) {
    const previous = assets.get(key);
    if (previous) bytes -= previous.blob.size;
    assets.delete(key);
  }
  return {
    get(workspaceId: string, id: string) {
      const key = imageCacheKey(workspaceId, id);
      const value = assets.get(key);
      if (value) { assets.delete(key); assets.set(key, value); }
      return value ?? null;
    },
    put(record: LocalImageAsset) {
      const key = imageCacheKey(record.workspaceId, record.id);
      remove(key);
      if (record.blob.size > maxBytes || maxEntries < 1) return;
      assets.set(key, record);
      bytes += record.blob.size;
      while (bytes > maxBytes || assets.size > maxEntries) remove(assets.keys().next().value!);
    },
    remove,
    clear(workspaceId?: string) {
      for (const [key, record] of assets) if (!workspaceId || record.workspaceId === workspaceId) remove(key);
    },
  };
}

// Unknown legacy records may be the only offline copy. The disk budget is soft
// until those records have been successfully copied to the server.
export function imageCacheEvictions(records: readonly CacheEntry[], maxBytes = PERSISTENT_BYTES) {
  let bytes = records.reduce((sum, record) => sum + record.bytes, 0);
  const evictions: string[] = [];
  const confirmed = records.filter((record) => Number.isFinite(record.confirmedAt))
    .sort((a, b) => a.lastAccessedAt - b.lastAccessedAt);
  for (const record of confirmed) {
    if (bytes <= maxBytes) break;
    bytes -= record.bytes;
    evictions.push(record.key);
  }
  return evictions;
}

const memory = createMemoryImageCache();
let cacheGeneration = 0;
const workspaceGenerations = new Map<string, number>();
const generationFor = (workspaceId: string) => `${cacheGeneration}:${workspaceGenerations.get(workspaceId) ?? 0}`;
let databasePromise: Promise<IDBDatabase | null> | null = null;
function openDatabase() {
  if (databasePromise) return databasePromise;
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  databasePromise = new Promise<IDBDatabase | null>((resolve) => {
    const request = indexedDB.open(DATABASE_NAME, 1);
    request.onerror = () => { databasePromise = null; resolve(null); };
    request.onsuccess = () => {
      const database = request.result;
      database.onversionchange = () => { database.close(); databasePromise = null; };
      resolve(database);
    };
    request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME, { keyPath: "key" });
  }).catch(() => { databasePromise = null; return null; });
  return databasePromise;
}

async function updateLocalCache(update: (store: IDBObjectStore) => void) {
  const database = await openDatabase();
  if (!database) return;
  await new Promise<void>((resolve) => {
    let transaction: IDBTransaction | undefined;
    try {
      transaction = database.transaction(STORE_NAME, "readwrite");
      transaction.oncomplete = transaction.onerror = transaction.onabort = () => resolve();
      update(transaction.objectStore(STORE_NAME));
    } catch {
      try { transaction?.abort(); } catch { /* The cache transaction already finished. */ }
      resolve();
    }
  });
}

let maintenance: Promise<void> | null = null;
let pruneRequested = false;
function maintainDiskBudget() {
  pruneRequested = true;
  if (maintenance) return maintenance;
  const run = (async () => {
    while (pruneRequested) {
      pruneRequested = false;
      await updateLocalCache((store) => {
        const records: CacheEntry[] = [];
        const request = store.openCursor();
        request.onsuccess = () => {
          const cursor = request.result;
          if (!cursor) {
            for (const key of imageCacheEvictions(records)) store.delete(key);
            return;
          }
          const record = cursor.value as StoredImageAsset;
          records.push({ key: record.key, bytes: record.blob.size, confirmedAt: record.confirmedAt,
            lastAccessedAt: record.lastAccessedAt ?? record.createdAt });
          cursor.continue();
        };
      });
    }
  })();
  maintenance = run;
  void run.finally(() => { if (maintenance === run) maintenance = null; });
  return run;
}

export function getMemoryImageAsset(workspaceId: string, id: string) {
  return memory.get(workspaceId, id);
}

export async function putLocalImageCache(record: LocalImageAsset, confirmed = false) {
  memory.put(record);
  const now = Date.now();
  const stored: StoredImageAsset = { ...record, key: imageCacheKey(record.workspaceId, record.id),
    lastAccessedAt: now, ...(confirmed ? { confirmedAt: now } : {}) };
  await updateLocalCache((store) => { store.put(stored); });
  if (confirmed) await maintainDiskBudget();
}

export async function removeLocalImageCache(workspaceId: string, id: string) {
  const key = imageCacheKey(workspaceId, id);
  memory.remove(key);
  await updateLocalCache((store) => { store.delete(key); });
}

export async function readLocalImageCache(workspaceId: string, id: string) {
  const generation = generationFor(workspaceId);
  const cached = memory.get(workspaceId, id);
  if (cached) return cached;
  let record: LocalImageAsset | null = null;
  await updateLocalCache((store) => {
    const request = store.get(imageCacheKey(workspaceId, id));
    request.onsuccess = () => {
      const stored = request.result as StoredImageAsset | undefined;
      if (!stored) return;
      record = { id: stored.id, workspaceId: stored.workspaceId, blob: stored.blob,
        mimeType: stored.mimeType, createdAt: stored.createdAt };
      store.put({ ...stored, lastAccessedAt: Date.now() });
    };
  });
  if (generation !== generationFor(workspaceId)) return null;
  if (record) memory.put(record);
  return record;
}

export async function clearLocalImageCache(workspaceId?: string) {
  if (workspaceId) workspaceGenerations.set(workspaceId, (workspaceGenerations.get(workspaceId) ?? 0) + 1);
  else { cacheGeneration += 1; workspaceGenerations.clear(); }
  memory.clear(workspaceId);
  await updateLocalCache((store) => {
    if (!workspaceId) { store.clear(); return; }
    const request = store.openCursor();
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) return;
      if ((cursor.value as StoredImageAsset).workspaceId === workspaceId) cursor.delete();
      cursor.continue();
    };
  });
}
