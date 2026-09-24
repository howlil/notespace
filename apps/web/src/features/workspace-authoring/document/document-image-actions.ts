import type { LocalImageAsset } from "../../../adapters/assets/image-types";

export type DocumentImageStore = (
  workspaceId: string,
  assetId: string,
  source: Blob,
) => Promise<LocalImageAsset | null>;

export type DocumentImageNode = {
  type: "image";
  attrs: {
    assetId: string;
    src: string;
    alt: string;
  };
};

export async function prepareDocumentImage({
  workspaceId,
  assetId,
  file,
  store,
}: {
  workspaceId: string;
  assetId: string;
  file: File;
  store: DocumentImageStore;
}): Promise<DocumentImageNode | null> {
  const stored = await store(workspaceId, assetId, file);
  if (!stored) return null;

  return {
    type: "image",
    attrs: {
      assetId,
      src: `notespace-asset://${assetId}`,
      alt: file.name || "Pasted image",
    },
  };
}
