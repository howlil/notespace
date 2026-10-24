import { useEffect, useState } from "react";
import { listAllWorkspaces } from "../../adapters/http/workspace-api";
import type { WorkspaceSummary } from "../../domain/workspace/workspace";

export async function listActivityWorkspaces(): Promise<WorkspaceSummary[]> {
  const result: WorkspaceSummary[] = [];
  let offset = 0;
  for (;;) {
    const page = await listAllWorkspaces({ offset, limit: 100 });
    result.push(...page.items);
    if (page.nextOffset == null || page.nextOffset <= offset) return result;
    offset = page.nextOffset;
  }
}

/** Reads Workspace choices from the existing API, never a second local store. */
export function useActivityWorkspaceChoices(enabled = true) {
  const [items, setItems] = useState<WorkspaceSummary[]>([]);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState(false);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    setLoading(true);
    setError(false);
    void listActivityWorkspaces().then((value) => {
      if (active) setItems(value);
    }).catch(() => {
      if (active) setError(true);
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [enabled, revision]);
  return { items, loading, error, retry: () => setRevision((value) => value + 1) };
}
