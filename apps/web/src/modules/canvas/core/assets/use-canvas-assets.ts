import { useCallback, useRef } from "react";
import type {
  BinaryFileData,
  BinaryFiles,
  ExcalidrawImperativeAPI,
} from "@excalidraw/excalidraw/types";
import type { Snapshot } from "../../../../entities/workspace";
import {
  blobFromDataUrl,
  blobToDataUrl,
  loadImageAsset,
  storeImageAsset,
} from "../../../../platform/assets/image-store";
import { fetchEraserIcon } from "../../../../platform/api/eraser-icon-api";
import { readLocalStorage, writeLocalStorage } from "../../../../shared/browser/local-storage";
import { PendingCanvasAssetWrites, persistCanvasAsset } from "./canvas-assets";

const ERASER_ICON_VIEWBOX_MIGRATION_PREFIX = "notespace:eraser-icon-viewbox-v1:";

function readCanvasFiles(data: Record<string, unknown>) {
  const files = data.files;
  return files && typeof files === "object" ? files as BinaryFiles : {};
}

export function useCanvasAssets({
  initial,
  workspaceId,
  onError,
}: {
  initial: Snapshot;
  workspaceId: string;
  onError: (message: string) => void;
}) {
  const initialFiles = useRef<BinaryFiles>(readCanvasFiles(initial.data));
  const persistedFileIds = useRef(new Set<string>());
  const pendingWrites = useRef(new PendingCanvasAssetWrites());

  const restoreFiles = useCallback(async (api: ExcalidrawImperativeAPI) => {
    const fileIds = new Set(
      api
        .getSceneElements()
        .map((element) =>
          "fileId" in element && typeof element.fileId === "string"
            ? String(element.fileId)
            : null,
        )
        .filter((fileId): fileId is string => fileId !== null),
    );

    const migrationKey = `${ERASER_ICON_VIEWBOX_MIGRATION_PREFIX}${workspaceId}`;
    const needsEraserRefresh = !readLocalStorage(migrationKey);
    let refreshedAnyEraserIcon = false;

    const files = await Promise.all(
      [...fileIds].map(async (fileId) => {
        const source = initialFiles.current[fileId];
        const isEraserIcon = fileId.startsWith("eraser-icon-");
        let asset = isEraserIcon && needsEraserRefresh ? null : await loadImageAsset(workspaceId, fileId);
        if (asset && /^image\/svg\b/i.test(asset.mimeType)) {
          asset = await storeImageAsset(workspaceId, fileId, asset.blob);
        }
        if (!asset && source && !(isEraserIcon && needsEraserRefresh)) {
          asset = await storeImageAsset(
            workspaceId,
            fileId,
            await blobFromDataUrl(source.dataURL),
          );
        }
        if (!asset && isEraserIcon) {
          const iconName = fileId.slice("eraser-icon-".length);
          if (iconName) {
            try {
              asset = await storeImageAsset(
                workspaceId,
                fileId,
                await fetchEraserIcon(iconName),
              );
              if (asset) refreshedAnyEraserIcon = true;
            } catch {
              // Keep missing icon non-fatal during scene restore.
            }
          }
        }
        if (!asset) return null;

        const dataURL = await blobToDataUrl(asset.blob);
        const restored = source
          ? ({
              ...source,
              dataURL: dataURL as BinaryFileData["dataURL"],
              mimeType: asset.mimeType as BinaryFileData["mimeType"],
              lastRetrieved: Date.now(),
            } as BinaryFileData)
          : ({
              id: fileId as BinaryFileData["id"],
              dataURL: dataURL as BinaryFileData["dataURL"],
              mimeType: asset.mimeType as BinaryFileData["mimeType"],
              created: asset.createdAt,
              lastRetrieved: Date.now(),
            } as BinaryFileData);

        persistedFileIds.current.add(fileId);
        return restored;
      }),
    );

    const restored = files.filter(
      (file): file is BinaryFileData => file !== null,
    );
    if (needsEraserRefresh && (refreshedAnyEraserIcon || ![...fileIds].some((id) => id.startsWith("eraser-icon-")))) {
      writeLocalStorage(migrationKey, "1");
    }
    if (restored.length) api.addFiles(restored);
  }, [workspaceId]);

  const persistFiles = useCallback((files: BinaryFiles, referencedFileIds: readonly string[]) => {
    const required = new Set(referencedFileIds);
    pendingWrites.current.retain(required);
    for (const [fileId, file] of Object.entries(files)) {
      if (
        !required.has(fileId) || pendingWrites.current.has(fileId) ||
        persistedFileIds.current.has(fileId)
      ) {
        continue;
      }

      const task = pendingWrites.current.track(fileId, async () => {
        const stored = await persistCanvasAsset(workspaceId, fileId, file.dataURL, {
          blobFromDataUrl,
          storeImageAsset,
        });
        if (!stored) throw new Error("Could not store this canvas image.");
        persistedFileIds.current.add(fileId);
      });
      void task.catch((error: unknown) => {
        onError(
          error instanceof Error
            ? error.message
            : "Could not store this canvas image.",
        );
      });
    }
  }, [onError, workspaceId]);

  const flushPendingAssets = useCallback(() => pendingWrites.current.flush(), []);

  return {
    restoreFiles,
    persistFiles,
    flushPendingAssets,
    hasPendingAssets: () => pendingWrites.current.hasPending,
  };
}
