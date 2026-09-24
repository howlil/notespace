import type { LocalImageAsset } from "../../../adapters/assets/image-types";

type BlobFromDataUrl = (dataUrl: string) => Promise<Blob>;
type StoreImageAsset = (
  workspaceId: string,
  assetId: string,
  source: Blob,
) => Promise<LocalImageAsset | null>;

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
