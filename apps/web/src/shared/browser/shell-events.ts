/** UI-only commands. Domain mutations remain owned by existing feature hooks. */
export const OPEN_QUICK_CAPTURE_EVENT = "notespace:open-quick-capture";
export const OPEN_LIBRARY_TOOLS_EVENT = "notespace:open-library-tools";
export const OPEN_LIBRARY_CREATE_EVENT = "notespace:open-library-create";
export type LibraryCreateTarget = { kind: "category" | "workspace"; categoryId?: string };
export function requestLibraryCreate(detail: LibraryCreateTarget) {
  window.dispatchEvent(new CustomEvent<LibraryCreateTarget>(OPEN_LIBRARY_CREATE_EVENT, { detail }));
}
