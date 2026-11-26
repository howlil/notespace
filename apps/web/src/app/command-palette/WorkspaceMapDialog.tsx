import { useEffect, useMemo, useState } from "react";
import { Folder } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { CommandListDialog, Kbd, SectionLabel, cn } from "../../shared/ui";
import { useStore } from "../../shared/lib/use-store";
import type { WorkspaceSummary } from "../../entities/workspace";
import { listAllWorkspaces } from "../../platform/api/workspace-api";
import { buildWorkspaceTree } from "../../modules/library";
import { appShellStore, setWorkspaceMapOpen } from "../shell/app-shell-store";
import { activeWorkspaceStore } from "../shell/active-workspace-store";

export function WorkspaceMapDialog() {
  const navigate = useNavigate();
  const open = useStore(appShellStore, (state) => state.workspaceMapOpen);
  const activeWorkspaceId = useStore(activeWorkspaceStore, (state) => state.session?.workspaceId);
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

  const nodes = useMemo(() => {
    const tree = buildWorkspaceTree(workspaces);
    const needle = query.trim().toLowerCase();
    if (!needle) return tree;
    return tree.filter((node) => {
      const haystack = `${node.workspace.title} ${node.ancestorTitles.join(" ")}`.toLowerCase();
      return haystack.includes(needle);
    });
  }, [query, workspaces]);

  return (
    <CommandListDialog
      open={open}
      onOpenChange={setWorkspaceMapOpen}
      title="Workspace Map"
      description="Browse and jump to any workspace across your library."
      size="md"
      query={query}
      onQueryChange={(next) => { setQuery(next); setSelected(0); }}
      placeholder="Filter workspaces in map…"
      searchRightSlot={<Kbd>Esc</Kbd>}
      status={status}
      loadingFallback={(
        <p className="m-0 px-2 py-3 text-sm text-muted" role="status" aria-live="polite">
          Loading workspace map…
        </p>
      )}
      errorMessage="Workspace map could not be loaded."
      onRetry={() => setReloadNonce((n) => n + 1)}
      items={nodes}
      selectedIndex={selected}
      onSelectedIndexChange={setSelected}
      onSelect={(node) => {
        if (!node) return;
        setWorkspaceMapOpen(false);
        void navigate({
          to: "/workspaces/$workspaceId",
          params: { workspaceId: node.workspace.id },
          search: { noteId: undefined },
        });
      }}
      bodyHeader={<SectionLabel title="All workspaces" className="px-2 pt-0.5 pb-1" />}
      emptyFallback={<p className="m-0 px-2 py-3 text-xs text-muted">No matching workspaces.</p>}
      renderItem={(node, { selected: isSelected, index }) => {
        const isActive = node.workspace.id === activeWorkspaceId;
        return (
          <button
            key={node.workspace.id}
            type="button"
            className={cn(
              "flex min-h-8 w-full items-center gap-2 rounded-lg px-2 py-1 text-left transition-colors focus-visible:outline-2 focus-visible:outline-accent",
              (isSelected || isActive) && "bg-tint",
            )}
            style={{ paddingLeft: `${8 + node.depth * 14}px` }}
            onMouseEnter={() => setSelected(index)}
            onClick={() => {
              setWorkspaceMapOpen(false);
              void navigate({
                to: "/workspaces/$workspaceId",
                params: { workspaceId: node.workspace.id },
                search: { noteId: undefined },
              });
            }}
          >
            <Folder size={14} className={cn("shrink-0", isSelected || isActive ? "text-accent" : "text-muted")} aria-hidden="true" />
            <span className={cn("min-w-0 truncate text-nav font-medium", isSelected || isActive ? "text-accent" : "text-ink")}>
              {node.workspace.title}
            </span>
            {node.ancestorTitles.length > 0 && (
              <span className="min-w-0 flex-1 truncate text-xs text-muted">
                {node.ancestorTitles.join(" / ")}
              </span>
            )}
            {node.workspace.childCount > 0 && (
              <span className="ml-auto shrink-0 text-[11px] tabular-nums text-muted">
                {node.workspace.childCount}
              </span>
            )}
            {isSelected && <Kbd tone="surface">↵</Kbd>}
          </button>
        );
      }}
    />
  );
}
