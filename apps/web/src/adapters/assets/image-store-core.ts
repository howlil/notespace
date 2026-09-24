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
  const inFlightLoads = new Map<string, Promise<LocalImageAsset | null>>();

  async function storeImageAsset(workspaceId: string, id: string, source: Blob) {
    const blob = await deps.normalize(source);
    const accepted = await deps.uploadRemote(workspaceId, id, blob);
    if (!accepted) {
      await deps.removeLocal(workspaceId, id);
      return null;
    }

    const record: LocalImageAsset = {
      id,
      workspaceId,
      blob,
      mimeType: blob.type || source.type,
      createdAt: deps.now(),
    };
    await deps.putLocal(record);
    return record;
  }

  async function loadImageAsset(workspaceId: string, id: string) {
    const memory = deps.getMemory(workspaceId, id);
    if (memory) return memory;

    const key = deps.cacheKey(workspaceId, id);
    const existing = inFlightLoads.get(key);
    if (existing) return existing;

    const load = (async () => {
      try {
        const remote = await deps.loadRemote(workspaceId, id);
        if (remote) {
          await deps.putLocal(remote);
          return remote;
        }
      } catch {
        // A local cache may still make an acknowledged legacy workspace readable.
      }

      const legacy = await deps.readLocal(workspaceId, id);
      if (!legacy) return null;

      try {
        const accepted = await deps.uploadRemote(workspaceId, id, legacy.blob);
        if (!accepted) {
          await deps.removeLocal(workspaceId, id);
          return null;
        }
      } catch {
        // Keep legacy readable when the server is temporarily unavailable.
      }
      return legacy;
    })().finally(() => {
      if (inFlightLoads.get(key) === load) inFlightLoads.delete(key);
    });

    inFlightLoads.set(key, load);
    return load;
  }

  return { storeImageAsset, loadImageAsset };
}
