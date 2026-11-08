import type { LocalImageAsset } from "./image-types";

export type ImageStoreDependencies = {
  normalize(source: Blob): Promise<Blob>;
  uploadRemote(workspaceId: string, id: string, blob: Blob): Promise<boolean>;
  loadRemote(workspaceId: string, id: string): Promise<LocalImageAsset | null>;
  getMemory(workspaceId: string, id: string): LocalImageAsset | null;
  putLocal(record: LocalImageAsset): Promise<void> | void;
  readLocal(workspaceId: string, id: string): Promise<LocalImageAsset | null>;
  removeLocal(workspaceId: string, id: string): Promise<void> | void;
  cacheKey(workspaceId: string, id: string): string;
  now(): number;
};

export function createImageStore(deps: ImageStoreDependencies) {
  const inFlightLoads = new Map<string, { workspaceId: string; promise: Promise<LocalImageAsset | null> }>();
  let cacheGeneration = 0;
  const workspaceGenerations = new Map<string, number>();
  const generationFor = (workspaceId: string) => `${cacheGeneration}:${workspaceGenerations.get(workspaceId) ?? 0}`;

  async function storeImageAsset(workspaceId: string, id: string, source: Blob) {
    const generation = generationFor(workspaceId);
    const blob = await deps.normalize(source);
    const accepted = await deps.uploadRemote(workspaceId, id, blob);
    if (!accepted) {
      if (generation === generationFor(workspaceId)) await deps.removeLocal(workspaceId, id);
      return null;
    }

    const record: LocalImageAsset = {
      id,
      workspaceId,
      blob,
      mimeType: blob.type || source.type,
      createdAt: deps.now(),
    };
    if (generation === generationFor(workspaceId)) await deps.putLocal(record);
    return record;
  }

  async function loadImageAsset(workspaceId: string, id: string) {
    const generation = generationFor(workspaceId);
    const memory = deps.getMemory(workspaceId, id);
    if (memory) return memory;

    const key = deps.cacheKey(workspaceId, id);
    const existing = inFlightLoads.get(key);
    if (existing) return existing.promise;

    const load = (async () => {
      try {
        const remote = await deps.loadRemote(workspaceId, id);
        if (remote) {
          if (generation === generationFor(workspaceId)) await deps.putLocal(remote);
          return remote;
        }
      } catch {
        // A local cache may still make an acknowledged legacy workspace readable.
      }

      if (generation !== generationFor(workspaceId)) return null;
      const legacy = await deps.readLocal(workspaceId, id);
      if (!legacy || generation !== generationFor(workspaceId)) return null;

      try {
        const accepted = await deps.uploadRemote(workspaceId, id, legacy.blob);
        if (!accepted) {
          if (generation === generationFor(workspaceId)) await deps.removeLocal(workspaceId, id);
          return null;
        }
        if (generation === generationFor(workspaceId)) await deps.putLocal(legacy);
      } catch {
        // Keep legacy readable when the server is temporarily unavailable.
      }
      return legacy;
    })().finally(() => {
      if (inFlightLoads.get(key)?.promise === load) inFlightLoads.delete(key);
    });

    inFlightLoads.set(key, { workspaceId, promise: load });
    return load;
  }

  function invalidateCache(workspaceId?: string) {
    if (!workspaceId) {
      cacheGeneration += 1;
      workspaceGenerations.clear();
      inFlightLoads.clear();
      return;
    }
    workspaceGenerations.set(workspaceId, (workspaceGenerations.get(workspaceId) ?? 0) + 1);
    for (const [key, load] of inFlightLoads) if (load.workspaceId === workspaceId) inFlightLoads.delete(key);
  }
  return { storeImageAsset, loadImageAsset, invalidateCache };
}
