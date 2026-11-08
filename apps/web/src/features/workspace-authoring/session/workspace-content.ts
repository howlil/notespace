import type { WorkspaceContent } from "../../../domain/workspace/workspace";

export function normalizeWorkspaceContent(content: WorkspaceContent) {
  const changed = content.references.length > 0;
  const normalized: WorkspaceContent = {
    ...content,
    notes: [],
    references: [],
  };
  return { content: normalized, changed };
}
