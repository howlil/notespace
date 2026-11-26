import { useEffect, useMemo, useState } from "react";
import { CornerLeftUp, Folder } from "lucide-react";
import { CommandListDialog, Kbd, SectionLabel, cn } from "../../../shared/ui";
import { listAllWorkspaces } from "../../../platform/api/workspace-api";
import type { WorkspaceSummary } from "../../../entities/workspace";
import { buildWorkspaceTree } from "../model/hierarchy";

type MoveDestination = {
  id: string | null;
  title: string;
  context: string;
  depth: number;
};

type Props = {
  workspace: WorkspaceSummary | null;
  onOpenChange: (open: boolean) => void;
  onSelectParent: (targetParentId: string | null) => Promise<void>;
};

export function WorkspaceMoveDialog({ workspace, onOpenChange, onSelectParent }: Props) {
  const open = workspace !== null;
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [workspaces, setWorkspaces] = useState<WorkspaceSummary[]>([]);
  const [selected, setSelected] = useState(0);
  const [reloadNonce, setReloadNonce] = useState(0);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setSelected(0);
    setStatus("loading");
    let active = true;
    void listAllWorkspaces({ limit: 100 })
      .then((page) => {
        if (!active) return;
        setWorkspaces(page.items);
        setStatus("ready");
      })
      .catch(() => {
        if (!active) return;
        setStatus("error");
      });
    return () => { active = false; };
  }, [open, reloadNonce]);

  const destinations = useMemo<MoveDestination[]>(() => {
    if (!workspace) return [];
    const tree = buildWorkspaceTree(workspaces);
    const selfNode = tree.find((node) => node.workspace.id === workspace.id);
    const excluded = new Set<string>([workspace.id, ...(selfNode?.descendantIds ?? [])]);
    const needle = query.trim().toLowerCase();

    const items: MoveDestination[] = [];
    if (!needle || "top level".includes(needle) || "root".includes(needle)) {
      items.push({
        id: null,
        title: "Top level",
        context: workspace.parentId === null ? "Current location" : "Move to root",
        depth: 0,
      });
    }

    for (const node of tree) {
      if (excluded.has(node.workspace.id)) continue;
      if (needle) {
        const haystack = `${node.workspace.title} ${node.ancestorTitles.join(" ")}`.toLowerCase();
        if (!haystack.includes(needle)) continue;
      }
      items.push({
        id: node.workspace.id,
        title: node.workspace.title,
        context: node.workspace.id === workspace.parentId
          ? "Current parent"
          : node.ancestorTitles.length ? node.ancestorTitles.join(" / ") : "Root workspace",
        depth: node.depth,
      });
    }
    return items;
  }, [query, workspace, workspaces]);

  return (
    <CommandListDialog
      open={open}
      onOpenChange={onOpenChange}
      title={workspace ? `Move “${workspace.title}”` : "Move workspace"}
      description="Choose a new parent workspace or move to top level."
      size="md"
      query={query}
      onQueryChange={(next) => { setQuery(next); setSelected(0); }}
      placeholder="Filter destination workspaces…"
      searchRightSlot={<Kbd>Esc</Kbd>}
      status={status}
      loadingFallback={(
        <p className="m-0 px-2 py-3 text-sm text-muted" role="status" aria-live="polite">
          Loading workspaces…
        </p>
      )}
      errorMessage="Could not load destination workspaces."
      onRetry={() => setReloadNonce((n) => n + 1)}
      items={destinations}
      selectedIndex={selected}
      onSelectedIndexChange={setSelected}
      onSelect={(item) => {
        if (!item) return;
        onOpenChange(false);
        void onSelectParent(item.id);
      }}
      bodyHeader={<SectionLabel title="Destination" className="px-2 pt-0.5 pb-1" />}
      emptyFallback={<p className="m-0 px-2 py-3 text-xs text-muted">No valid destination workspaces.</p>}
      renderItem={(item, { selected: isSelected, index }) => (
        <button
          key={item.id ?? "__root__"}
          type="button"
          className={cn(
            "flex min-h-8 w-full items-center gap-2 rounded-lg px-2 py-1 text-left transition-colors focus-visible:outline-2 focus-visible:outline-accent",
            isSelected && "bg-tint",
          )}
          style={{ paddingLeft: `${8 + item.depth * 14}px` }}
          onMouseEnter={() => setSelected(index)}
          onClick={() => {
            onOpenChange(false);
            void onSelectParent(item.id);
          }}
        >
          {item.id === null
            ? <CornerLeftUp size={14} className={cn("shrink-0", isSelected ? "text-accent" : "text-muted")} aria-hidden="true" />
            : <Folder size={14} className={cn("shrink-0", isSelected ? "text-accent" : "text-muted")} aria-hidden="true" />}
          <span className={cn("min-w-0 truncate text-nav font-medium", isSelected ? "text-accent" : "text-ink")}>
            {item.title}
          </span>
          <span className="min-w-0 flex-1 truncate text-xs text-muted">
            {item.context}
          </span>
          {isSelected && <Kbd tone="surface">↵</Kbd>}
        </button>
      )}
    />
  );
}
