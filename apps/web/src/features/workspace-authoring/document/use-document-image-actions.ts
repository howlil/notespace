import type { Editor } from "@tiptap/core";
import { useCallback, type RefObject } from "react";
import { createLocalAssetId, storeImageAsset } from "../../../adapters/assets/image-store";
import { prepareDocumentImage } from "./document-image-actions";

export function useDocumentImageActions(editorRef: RefObject<Editor | null>, workspaceId: string, onError: (message: string) => void) {
  return useCallback(async (files: File[], position?: number) => {
    const editor = editorRef.current;
    if (!editor) return;
    try {
      let at = position;
      for (const file of files) {
        const assetId = createLocalAssetId();
        const node = await prepareDocumentImage({
          workspaceId,
          assetId,
          file,
          store: storeImageAsset,
        });
        if (!node) throw new Error("This image could not be stored in the workspace.");
        if (typeof at === "number") {
          editor.chain().focus().insertContentAt(at, node).run();
          at += 1;
        } else {
          editor.chain().focus().insertContent(node).run();
        }
      }
    } catch (error) {
      onError(error instanceof Error ? error.message : "Could not store this image.");
    }
  }, [editorRef, onError, workspaceId]);
}
