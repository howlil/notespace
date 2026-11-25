import type { WorkspaceContent } from "../../../entities/workspace";

export function normalizeWorkspaceContent(content: WorkspaceContent) {
  return {
    content: {
      title: content.title,
      canvas: content.canvas,
    },
    changed: false,
  };
}
