import type { ConflictDraft, GranularConflictDraft } from "../../domain/workspace/conflict";
export type { ConflictDraft, GranularConflictDraft } from "../../domain/workspace/conflict";

const conflictEvent = "notespace:workspace-conflict";

function publishConflict(draft: ConflictDraft) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<ConflictDraft>(conflictEvent, { detail: draft }));
}

export function publishGranularConflict(draft: GranularConflictDraft) {
  publishConflict(draft);
}

export function subscribeWorkspaceConflict(listener: (draft: ConflictDraft) => void) {
  if (typeof window === "undefined") return () => {};
  const handle = (event: Event) => listener((event as CustomEvent<ConflictDraft>).detail);
  window.addEventListener(conflictEvent, handle);
  return () => window.removeEventListener(conflictEvent, handle);
}
