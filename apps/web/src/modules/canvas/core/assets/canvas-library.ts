import type { LibraryItems } from "@excalidraw/excalidraw/types";
import { readLocalStorage, writeLocalStorage } from "../../../../shared/browser/local-storage.ts";

const EXCALIDRAW_LIBRARY_STORAGE_KEY = "notespace.excalidraw.library.v1";

export function readStoredLibraryItems(): LibraryItems {
  try {
    const raw = readLocalStorage(EXCALIDRAW_LIBRARY_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed as LibraryItems : [];
  } catch {
    return [];
  }
}

export function writeStoredLibraryItems(items: LibraryItems): boolean {
  return writeLocalStorage(EXCALIDRAW_LIBRARY_STORAGE_KEY, JSON.stringify(items));
}
