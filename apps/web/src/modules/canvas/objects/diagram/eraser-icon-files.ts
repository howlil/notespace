import type { BinaryFileData, ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { blobToDataUrl, loadImageAsset, normalizeImageBlob, storeImageAsset } from "../../../../platform/assets/image-store";
import { fetchEraserIcon } from "../../../../platform/api/eraser-icon-api";
import type { StructuredDiagram } from "./model/diagram";
import { eraserIconFileId, eraserIconName } from "./palette/eraser-icons";

type EraserIconLoadResult = {
  available: Set<string>;
  failed: string[];
};

export async function ensureEraserDiagramIconFiles(
  value: ExcalidrawImperativeAPI,
  diagram: StructuredDiagram,
  workspaceId: string,
): Promise<EraserIconLoadResult> {
  const available = new Set<string>();
  const failed: string[] = [];
  const existing = value.getFiles();
  const additions: BinaryFileData[] = [];
  const iconNames = [...new Set(diagram.nodes.map((node) => eraserIconName(node.specKey)).filter((name): name is string => Boolean(name)))];

  for (const iconName of iconNames) {
    const fileId = eraserIconFileId(iconName);
    const typedFileId = fileId as BinaryFileData["id"];
    if (existing[typedFileId]) {
      available.add(iconName);
      continue;
    }

    try {
      let asset = await loadImageAsset(workspaceId, fileId);
      if (asset && /^image\/svg\b/i.test(asset.mimeType)) {
        asset = await storeImageAsset(workspaceId, fileId, asset.blob);
      }
      if (!asset) {
        const iconBlob = await fetchEraserIcon(iconName);
        asset = await storeImageAsset(workspaceId, fileId, iconBlob);
        if (!asset) {
          const normalizedBlob = await normalizeImageBlob(iconBlob);
          asset = {
            id: fileId,
            workspaceId,
            blob: normalizedBlob,
            mimeType: normalizedBlob.type || "image/webp",
            createdAt: Date.now(),
          };
        }
      }

      const dataURL = await blobToDataUrl(asset.blob);
      additions.push({
        id: typedFileId,
        dataURL: dataURL as BinaryFileData["dataURL"],
        mimeType: asset.mimeType as BinaryFileData["mimeType"],
        created: asset.createdAt,
        lastRetrieved: Date.now(),
      });
      available.add(iconName);
    } catch {
      failed.push(iconName);
    }
  }

  if (additions.length) value.addFiles(additions);
  return { available, failed };
}
