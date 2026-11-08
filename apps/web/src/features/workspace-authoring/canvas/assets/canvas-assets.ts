import type { LocalImageAsset } from "../../../../adapters/assets/image-types";

type BlobFromDataUrl = (dataUrl: string) => Promise<Blob>;
type StoreImageAsset = (
  workspaceId: string,
  assetId: string,
  source: Blob,
) => Promise<LocalImageAsset | null>;

export class PendingCanvasAssetWrites {
  private pending = new Map<string, Promise<void>>();
  private failed = new Map<string, () => Promise<void>>();
  private required: ReadonlySet<string> | null = null;

  retain(assetIds: ReadonlySet<string>) {
    this.required = assetIds;
    for (const assetId of this.failed.keys()) {
      if (!assetIds.has(assetId)) this.failed.delete(assetId);
    }
  }

  track(assetId: string, write: () => Promise<void>) {
    const existing = this.pending.get(assetId);
    if (existing) return existing;
    this.failed.delete(assetId);

    const task = Promise.resolve()
      .then(write)
      .catch((error: unknown) => {
        if (!this.required || this.required.has(assetId)) this.failed.set(assetId, write);
        throw error;
      })
      .finally(() => {
        if (this.pending.get(assetId) === task) this.pending.delete(assetId);
      });
    this.pending.set(assetId, task);
    return task;
  }

  get hasPending() {
    return this.pending.size > 0 || this.failed.size > 0;
  }

  has(assetId: string) {
    return this.pending.has(assetId);
  }

  async flush() {
    for (const [assetId, write] of [...this.failed]) {
      // track deletes the retry entry synchronously. Snapshot the work so a
      // later failed attempt is retained for the next explicit flush.
      void this.track(assetId, write).catch(() => {});
    }
    while (this.pending.size > 0) {
      await Promise.all([...this.pending.values()]);
    }
  }
}

export async function persistCanvasAsset(
  workspaceId: string,
  fileId: string,
  dataUrl: string,
  deps: {
    blobFromDataUrl: BlobFromDataUrl;
    storeImageAsset: StoreImageAsset;
  },
) {
  const blob = await deps.blobFromDataUrl(dataUrl);
  return deps.storeImageAsset(workspaceId, fileId, blob);
}
