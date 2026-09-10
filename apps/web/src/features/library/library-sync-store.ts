import { create } from "zustand";

type LibrarySyncState = {
  revision: number;
  markChanged: () => void;
};

export const useLibrarySyncStore = create<LibrarySyncState>((set) => ({
  revision: 0,
  markChanged: () => set((state) => ({ revision: state.revision + 1 })),
}));

export function notifyLibraryChanged() {
  useLibrarySyncStore.getState().markChanged();
}
