import { useCallback } from "react";
import { useNavigate } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight, RotateCcw } from "lucide-react";
import { useStore } from "../../shared/lib/use-store";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
  IconButton,
  MenuDivider,
} from "../../shared/ui";
import {
  browserNavStore,
  canGoBack,
  canGoForward,
  getTabCurrentDestination,
  goBackInActiveTab,
  goForwardInActiveTab,
  jumpToTabHistoryIndex,
  reopenClosedTab,
  type NavDestination,
} from "./browser-nav-store";

export function TabHistoryControls() {
  const navigate = useNavigate();
  const browserNav = useStore(browserNavStore);

  const navigateToDestination = useCallback((dest: NavDestination | null) => {
    if (!dest) return;
    if (dest.kind === "home") {
      void navigate({ to: "/", search: {} });
    } else if (dest.kind === "map") {
      void navigate({ to: "/map", search: {} });
    } else if (dest.kind === "cards") {
      void navigate({ to: "/cards" });
    } else if (dest.kind === "card") {
      void navigate({ to: "/cards/$noteId", params: { noteId: dest.noteId } });
    } else {
      void navigate({
        to: "/workspaces/$workspaceId",
        params: { workspaceId: dest.workspaceId },
        search: { noteId: undefined },
      });
    }
  }, [navigate]);

  const activeTab = browserNav.activeTabId
    ? browserNav.tabs.find((t) => t.id === browserNav.activeTabId)
    : undefined;

  const backAvailable = canGoBack(activeTab);
  const forwardAvailable = canGoForward(activeTab);

  const backEntries = activeTab
    ? activeTab.history
        .slice(0, activeTab.cursor)
        .map((entry, idx) => ({ entry, idx }))
        .reverse()
    : [];

  const forwardEntries = activeTab
    ? activeTab.history
        .slice(activeTab.cursor + 1)
        .map((entry, offset) => ({ entry, idx: activeTab.cursor + 1 + offset }))
    : [];

  return (
    <div className="flex items-center gap-0.5" role="group" aria-label="Canvas history navigation">
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <IconButton
            type="button"
            size="xs"
            variant="ghost"
            aria-label="Back"
            title="Back · Alt+← (Right-click for history)"
            disabled={!backAvailable}
            className="text-ink/75 hover:bg-ink/[0.06] hover:text-ink disabled:opacity-35"
            onClick={() => navigateToDestination(goBackInActiveTab())}
          >
            <ArrowLeft size={14} aria-hidden="true" />
          </IconButton>
        </ContextMenuTrigger>
        <ContextMenuContent>
          {backEntries.length === 0 ? (
            <ContextMenuItem disabled>No back history</ContextMenuItem>
          ) : (
            backEntries.slice(0, 12).map(({ entry, idx }) => (
              <ContextMenuItem
                key={`back-${idx}-${entry.visitedAt}`}
                onSelect={() => navigateToDestination(jumpToTabHistoryIndex(idx))}
              >
                <span className="truncate">{entry.title}</span>
              </ContextMenuItem>
            ))
          )}
          {browserNav.closedTabs.length > 0 && (
            <>
              <MenuDivider />
              <ContextMenuItem
                onSelect={() => {
                  const reopened = reopenClosedTab();
                  navigateToDestination(getTabCurrentDestination(reopened));
                }}
              >
                <RotateCcw size={12} aria-hidden="true" />
                <span>Reopen closed: {browserNav.closedTabs[0].tab.title}</span>
              </ContextMenuItem>
            </>
          )}
        </ContextMenuContent>
      </ContextMenu>

      <ContextMenu>
        <ContextMenuTrigger asChild>
          <IconButton
            type="button"
            size="xs"
            variant="ghost"
            aria-label="Forward"
            title="Forward · Alt+→ (Right-click for history)"
            disabled={!forwardAvailable}
            className="text-ink/75 hover:bg-ink/[0.06] hover:text-ink disabled:opacity-35"
            onClick={() => navigateToDestination(goForwardInActiveTab())}
          >
            <ArrowRight size={14} aria-hidden="true" />
          </IconButton>
        </ContextMenuTrigger>
        <ContextMenuContent>
          {forwardEntries.length === 0 ? (
            <ContextMenuItem disabled>No forward history</ContextMenuItem>
          ) : (
            forwardEntries.slice(0, 12).map(({ entry, idx }) => (
              <ContextMenuItem
                key={`fwd-${idx}-${entry.visitedAt}`}
                onSelect={() => navigateToDestination(jumpToTabHistoryIndex(idx))}
              >
                <span className="truncate">{entry.title}</span>
              </ContextMenuItem>
            ))
          )}
        </ContextMenuContent>
      </ContextMenu>
    </div>
  );
}
