import { useEffect, useState } from "react";
import { loadImageAsset } from "../../../adapters/assets/image-store";

export function useImageAssetUrl(workspaceId: string, assetId: string | null | undefined, fallbackSrc: string | null = null) {
  const [src, setSrc] = useState<string | null>(fallbackSrc);

  useEffect(() => {
    if (!assetId) {
      setSrc(fallbackSrc);
      return;
    }

    let active = true;
    let objectUrl: string | null = null;
    setSrc(null);

    void loadImageAsset(workspaceId, assetId)
      .then((asset) => {
        if (!active) return;
        if (!asset) {
          setSrc(fallbackSrc);
          return;
        }
        objectUrl = URL.createObjectURL(asset.blob);
        setSrc(objectUrl);
      })
      .catch(() => {
        if (active) setSrc(fallbackSrc);
      });

    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [assetId, fallbackSrc, workspaceId]);

  return src;
}
