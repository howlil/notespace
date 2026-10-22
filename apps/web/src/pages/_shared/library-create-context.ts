import { createContext, useContext } from "react";

export type LibraryCreateRequest = {
  sequence: number;
  kind: "category" | "workspace";
  categoryId?: string;
};

/** Page-shell to Explorer request. The library feature alone owns creation mutations. */
export const LibraryCreateContext = createContext<LibraryCreateRequest | null>(null);
export function useLibraryCreateRequest() {
  return useContext(LibraryCreateContext);
}
