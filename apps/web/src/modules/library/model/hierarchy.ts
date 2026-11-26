import type { WorkspaceSummary } from "../../../entities/workspace";

export type WorkspaceTreeNode = {
  workspace: WorkspaceSummary;
  depth: number;
  ancestorTitles: string[];
  descendantIds: Set<string>;
};

/**
 * Builds a deterministic pre-order flat tree from a list of workspaces,
 * safely ignoring cycles or missing parents.
 */
export function buildWorkspaceTree(workspaces: WorkspaceSummary[]): WorkspaceTreeNode[] {
  const byId = new Map<string, WorkspaceSummary>();
  const childrenByParent = new Map<string | null, WorkspaceSummary[]>();

  for (const ws of workspaces) {
    byId.set(ws.id, ws);
  }
  for (const ws of workspaces) {
    const parentKey = ws.parentId && byId.has(ws.parentId) && ws.parentId !== ws.id ? ws.parentId : null;
    const list = childrenByParent.get(parentKey);
    if (list) list.push(ws);
    else childrenByParent.set(parentKey, [ws]);
  }
  for (const list of childrenByParent.values()) {
    list.sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: "base" }) || a.id.localeCompare(b.id));
  }

  const nodes: WorkspaceTreeNode[] = [];
  const visited = new Set<string>();

  function visit(ws: WorkspaceSummary, depth: number, ancestorTitles: string[]): Set<string> {
    if (visited.has(ws.id)) return new Set();
    visited.add(ws.id);
    const descendantIds = new Set<string>();
    const node: WorkspaceTreeNode = {
      workspace: ws,
      depth,
      ancestorTitles,
      descendantIds,
    };
    nodes.push(node);
    const children = childrenByParent.get(ws.id) ?? [];
    for (const child of children) {
      descendantIds.add(child.id);
      for (const grand of visit(child, depth + 1, [...ancestorTitles, ws.title])) {
        descendantIds.add(grand);
      }
    }
    return descendantIds;
  }

  for (const root of childrenByParent.get(null) ?? []) {
    visit(root, 0, []);
  }
  // Append any disconnected cycle members deterministically.
  for (const ws of workspaces) {
    if (!visited.has(ws.id)) {
      visit(ws, 0, []);
    }
  }

  return nodes;
}

/**
 * Collapses middle ancestors when an ancestor chain exceeds maxVisible,
 * keeping the root and immediate parent visible.
 */
export function collapseAncestors(
  ancestors: WorkspaceSummary[],
  maxVisible = 2,
): {
  leading: WorkspaceSummary[];
  collapsed: WorkspaceSummary[];
  trailing: WorkspaceSummary[];
} {
  if (ancestors.length <= maxVisible || maxVisible < 2) {
    return { leading: ancestors, collapsed: [], trailing: [] };
  }
  return {
    leading: [ancestors[0]],
    collapsed: ancestors.slice(1, ancestors.length - 1),
    trailing: [ancestors[ancestors.length - 1]],
  };
}
