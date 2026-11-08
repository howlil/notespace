import type { BinaryFileData, ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { blobToDataUrl, loadImageAsset, storeImageAsset } from "../../../../adapters/assets/image-store";
import { fetchEraserIcon } from "../../../../adapters/http/eraser-icon-api";
import type { StructuredDiagram } from "../../../../domain/diagram/diagram";
import { eraserIconFileId, eraserIconName } from "./palette/eraser-icons";

export type EraserIconLoadResult = {
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
      if (!asset) {
        asset = await storeImageAsset(workspaceId, fileId, await fetchEraserIcon(iconName));
      }
      if (!asset) throw new Error("Could not resolve diagram icon asset.");

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
