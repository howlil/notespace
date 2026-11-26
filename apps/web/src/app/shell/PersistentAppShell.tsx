import { startTransition, useCallback, useEffect, useMemo, type ReactNode } from "react";
import { useMatches, useNavigate } from "@tanstack/react-router";
import { noteFirstLine } from "../../entities/note";
import type { Workspace } from "../../entities/workspace";
import type { Note } from "../../platform/api/note-api";
import { useStore } from "../../shared/lib/use-store";
import { BrowserTabsSection, LibrarySidebar, type BrowserNavDestination } from "../../modules/library";
import { LibraryPageShell } from "./LibraryPageShell";
import { RightDockPanel } from "./RightDockPanel";
import { activeWorkspaceStore } from "./active-workspace-store";
import { openQuickOpen } from "./app-shell-store";
import {
  browserNavStore,
  closeTab,
  createPinnedFolder,
  createTabGroup,
  deletePinnedFolder,
  deleteTabGroup,
  duplicateTab,
  getTabCurrentDestination,
  goBackInActiveTab,
  goForwardInActiveTab,
  hydrateBrowserNavStoreFromStorage,
  movePinToFolder,
  moveTabToGroup,
  openBackgroundTab,
  openDestinationInCurrentTab,
  pinTab,
  renamePinnedFolder,
  renameTabGroup,
  reopenClosedTab,
  reorderTabs,
  selectTab,
  switchTabGroup,
  syncRouteToActiveTab,
  togglePinnedFolder,
  unpinTab,
  type NavDestination,
} from "./browser-nav-store";

type Props = {
  children: ReactNode;
};

type WorkspaceLoaderData = {
  workspace?: Workspace;
};

type CardLoaderData = {
  note?: Note;
};

function ownsTextInput(target: EventTarget | null) {
  return target instanceof Element && Boolean(target.closest('input, textarea, select, [contenteditable="true"], .cm-editor'));
}

function hasForegroundDialog() {
  return Array.from(document.querySelectorAll<HTMLElement>('[role="dialog"], [role="alertdialog"], [role="menu"]'))
    .some((el) => el.getClientRects().length > 0);
}

function activeDestinationFromStore(): NavDestination | null {
  const snap = browserNavStore.getSnapshot();
  const activeTab = snap.activeTabId ? snap.tabs.find((t) => t.id === snap.activeTabId) : undefined;
  return getTabCurrentDestination(activeTab);
}

export function PersistentAppShell({ children }: Props) {
  const matches = useMatches();
  const navigate = useNavigate();
  const activeSession = useStore(activeWorkspaceStore, (state) => state.session);
  const browserNav = useStore(browserNavStore);

  const workspaceMatch = matches.find((match) => match.routeId === "/workspaces/$workspaceId");
  const cardMatch = matches.find((match) => match.routeId === "/cards/$noteId");
  const isCanvasRoute = Boolean(workspaceMatch);
  const isMapRoute = matches.some((match) => match.routeId === "/map");
  const isCardsRoute = matches.some((match) => match.routeId === "/cards");
  const isCardDetailRoute = Boolean(cardMatch);

  const workspaceLoaderData = workspaceMatch?.loaderData as WorkspaceLoaderData | undefined;
  const cardLoaderData = cardMatch?.loaderData as CardLoaderData | undefined;
  const activeCard = cardLoaderData?.note;
  const routeWorkspace = workspaceLoaderData?.workspace;
  const activeWorkspace = useMemo(() => {
    if (!routeWorkspace) return undefined;
    const liveVersion = activeSession?.workspaceId === routeWorkspace.id ? activeSession.version : routeWorkspace.version;
    return { ...routeWorkspace, version: Math.max(routeWorkspace.version, liveVersion) };
  }, [activeSession, routeWorkspace]);

  const navigateToDestination = useCallback((dest: NavDestination | null) => {
    if (!dest || dest.kind === "home") {
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

  useEffect(() => {
    startTransition(() => {
      hydrateBrowserNavStoreFromStorage();
    });
  }, []);

  useEffect(() => {
    startTransition(() => {
      if (isCanvasRoute && activeWorkspace) {
        syncRouteToActiveTab({ kind: "workspace", workspaceId: activeWorkspace.id }, activeWorkspace.title);
      } else if (isCardDetailRoute && activeCard) {
        const cardTitle = noteFirstLine(activeCard.document).trim() || "Untitled card";
        syncRouteToActiveTab({ kind: "card", noteId: activeCard.id }, cardTitle);
      } else if (isMapRoute) {
        syncRouteToActiveTab({ kind: "map" }, "Workspace Map");
      } else if (isCardsRoute) {
        syncRouteToActiveTab({ kind: "cards" }, "Card Library");
      } else {
        syncRouteToActiveTab({ kind: "home" }, "Welcome");
      }
    });
  }, [activeCard, activeWorkspace, isCanvasRoute, isCardDetailRoute, isCardsRoute, isMapRoute]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing || hasForegroundDialog() || ownsTextInput(event.target)) return;
      if ((event.ctrlKey || event.metaKey) && !event.altKey) {
        const lower = event.key.toLowerCase();
        if (lower === "t" && event.shiftKey) {
          event.preventDefault();
          const tab = reopenClosedTab();
          const dest = getTabCurrentDestination(tab);
          if (dest) navigateToDestination(dest);
          return;
        }
        if (lower === "t" && !event.shiftKey) {
          event.preventDefault();
          openQuickOpen();
          return;
        }
        if (lower === "w" && !event.shiftKey && browserNav.activeTabId) {
          event.preventDefault();
          closeTab(browserNav.activeTabId);
          navigateToDestination(activeDestinationFromStore());
          return;
        }
        if (/^[1-9]$/.test(event.key)) {
          const activeGroup = browserNav.groups.find((g) => g.id === browserNav.activeGroupId);
          const groupTabs = activeGroup?.tabIds ?? [];
          const targetId = groupTabs[Number(event.key) - 1];
          if (targetId) {
            event.preventDefault();
            selectTab(targetId);
            const dest = activeDestinationFromStore();
            if (dest) navigateToDestination(dest);
          }
          return;
        }
      }
      if (event.altKey && !event.ctrlKey && !event.metaKey) {
        if (event.key === "ArrowLeft") {
          event.preventDefault();
          const dest = goBackInActiveTab();
          if (dest) navigateToDestination(dest);
        } else if (event.key === "ArrowRight") {
          event.preventDefault();
          const dest = goForwardInActiveTab();
          if (dest) navigateToDestination(dest);
        }
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [browserNav.activeGroupId, browserNav.activeTabId, browserNav.groups, navigateToDestination]);

  const tabItems = useMemo(() => (
    browserNav.tabs.map((tab) => ({
      id: tab.id,
      groupId: tab.groupId,
      pinned: tab.pinned,
      folderId: tab.folderId,
      title: tab.title,
      destination: getTabCurrentDestination(tab) as BrowserNavDestination | null,
    }))
  ), [browserNav.tabs]);

  const recentItems = useMemo(() => {
    const seen = new Set<string>();
    const items: Array<{ destination: BrowserNavDestination; title: string; visitedAt: number }> = [];
    for (const visit of browserNav.recentVisits) {
      if (visit.destination.kind !== "workspace" && visit.destination.kind !== "card") continue;
      const key = visit.destination.kind === "workspace"
        ? `ws:${visit.destination.workspaceId}`
        : `card:${visit.destination.noteId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      items.push({
        destination: visit.destination as BrowserNavDestination,
        title: visit.title,
        visitedAt: visit.visitedAt,
      });
      if (items.length >= 10) break;
    }
    return items;
  }, [browserNav.recentVisits]);

  return (
    <LibraryPageShell
      canvas={isCanvasRoute}
      rightDock={isCanvasRoute ? <RightDockPanel activeWorkspace={activeWorkspace} /> : undefined}
      sidebar={(
        <LibrarySidebar
          activeRoute={isCardsRoute || isCardDetailRoute ? "cards" : isMapRoute ? "map" : isCanvasRoute ? "workspace" : "home"}
          browserTabs={(
            <BrowserTabsSection
              activeGroupId={browserNav.activeGroupId}
              activeTabId={browserNav.activeTabId}
              groups={browserNav.groups}
              tabs={tabItems}
              pinnedFolders={browserNav.pinnedFolders}
              recentItems={recentItems}
              storageWarning={browserNav.storageWarning}
              onSelectTab={(tabId) => {
                selectTab(tabId);
                const dest = activeDestinationFromStore();
                if (dest) navigateToDestination(dest);
              }}
              onCloseTab={(tabId) => {
                closeTab(tabId);
                navigateToDestination(activeDestinationFromStore());
              }}
              onNewTab={openQuickOpen}
              onOpenRecent={(dest, title) => {
                openDestinationInCurrentTab(dest as NavDestination, title);
                navigateToDestination(dest as NavDestination);
              }}
              onOpenRecentInNewTab={(dest, title) => {
                openBackgroundTab(dest as NavDestination, title);
              }}
              onDuplicateTab={(tabId) => {
                const newId = duplicateTab(tabId);
                if (newId) {
                  const dest = activeDestinationFromStore();
                  if (dest) navigateToDestination(dest);
                }
              }}
              onPinTab={(tabId) => pinTab(tabId)}
              onUnpinTab={(tabId) => unpinTab(tabId)}
              onMoveTabToGroup={(tabId, groupId) => {
                moveTabToGroup(tabId, groupId);
                const dest = activeDestinationFromStore();
                if (dest) navigateToDestination(dest);
              }}
              onCloseOtherTabs={(keepTabId) => {
                const activeGroup = browserNav.groups.find((g) => g.id === browserNav.activeGroupId);
                for (const id of activeGroup?.tabIds ?? []) {
                  if (id !== keepTabId) closeTab(id);
                }
                navigateToDestination(activeDestinationFromStore());
              }}
              onReorderTabs={(sourceId, targetId) => reorderTabs(sourceId, targetId)}
              onSwitchGroup={(groupId) => {
                switchTabGroup(groupId);
                navigateToDestination(activeDestinationFromStore());
              }}
              onCreateGroup={(name) => createTabGroup(name)}
              onRenameGroup={(groupId, name) => renameTabGroup(groupId, name)}
              onDeleteGroup={(groupId) => {
                deleteTabGroup(groupId);
                navigateToDestination(activeDestinationFromStore());
              }}
              onCreatePinnedFolder={(name) => createPinnedFolder(name)}
              onRenamePinnedFolder={(folderId, name) => renamePinnedFolder(folderId, name)}
              onTogglePinnedFolder={(folderId) => togglePinnedFolder(folderId)}
              onDeletePinnedFolder={(folderId) => deletePinnedFolder(folderId)}
              onMovePinToFolder={(tabId, folderId) => movePinToFolder(tabId, folderId)}
            />
          )}
        />
      )}
    >
      {children}
    </LibraryPageShell>
  );
}

export function openWorkspaceFromCanvas(workspaceId: string, title?: string, background = false) {
  const dest: NavDestination = { kind: "workspace", workspaceId };
  if (background) {
    openBackgroundTab(dest, title ?? "Workspace");
    return false;
  }
  openDestinationInCurrentTab(dest, title ?? "Workspace");
  return true;
}
