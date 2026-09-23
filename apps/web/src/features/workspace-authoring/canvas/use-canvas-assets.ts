import { useCallback, useRef } from "react";
import type {
  BinaryFileData,
  BinaryFiles,
  ExcalidrawImperativeAPI,
} from "@excalidraw/excalidraw/types";
import type { Snapshot } from "../../../domain/workspace/workspace";
import {
  blobFromDataUrl,
  blobToDataUrl,
  loadImageAsset,
  storeImageAsset,
} from "../../../adapters/assets/image-store";

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
  const pendingFileIds = useRef(new Set<string>());
  const persistedFileIds = useRef(new Set<string>());
  const lastFilesRef = useRef<BinaryFiles | null>(null);

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

    const files = await Promise.all(
      [...fileIds].map(async (fileId) => {
        const source = initialFiles.current[fileId];
        let asset = await loadImageAsset(workspaceId, fileId);
        if (!asset && source) {
          asset = await storeImageAsset(
            workspaceId,
            fileId,
            await blobFromDataUrl(source.dataURL),
          );
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
    if (restored.length) api.addFiles(restored);
  }, [workspaceId]);

  const persistFiles = useCallback((files: BinaryFiles) => {
    if (lastFilesRef.current === files) return;
    lastFilesRef.current = files;
    for (const [fileId, file] of Object.entries(files)) {
      if (
        pendingFileIds.current.has(fileId) ||
        persistedFileIds.current.has(fileId)
      ) {
        continue;
      }

      pendingFileIds.current.add(fileId);
      void blobFromDataUrl(file.dataURL)
        .then((blob) => storeImageAsset(workspaceId, fileId, blob))
        .then(() => persistedFileIds.current.add(fileId))
        .catch((error) =>
          onError(
            error instanceof Error
              ? error.message
              : "Could not store this canvas image.",
          ),
        )
        .finally(() => pendingFileIds.current.delete(fileId));
    }
  }, [onError, workspaceId]);

  return { restoreFiles, persistFiles };
}
